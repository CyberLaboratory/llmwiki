"""SQLite repository implementations for local mode.

Single-user, no RLS. FTS5 for full-text search.
All queries use native SQLite syntax — no translation layer.
"""

import json
import logging
import uuid
from pathlib import Path

import aiosqlite

logger = logging.getLogger(__name__)

_SCHEMA_PATH = Path(__file__).parent.parent.parent.parent / "shared" / "sqlite_schema.sql"

_DOC_COLUMNS = (
    "id, workspace_id, workspace_id as knowledge_base_id, user_id, filename, title, path, relative_path, source_kind, "
    "file_type, file_size, document_number, status, page_count, content, "
    "tags, date, metadata, error_message, version, parser, "
    "content_hash, mtime_ns, last_indexed_at, stale_since, "
    "created_at, updated_at"
)


def _row_to_dict(cursor: aiosqlite.Cursor, row: tuple) -> dict:
    cols = [d[0] for d in cursor.description]
    d = dict(zip(cols, row))
    if "tags" in d and isinstance(d["tags"], str):
        d["tags"] = json.loads(d["tags"])
    if "metadata" in d and isinstance(d["metadata"], str):
        try:
            d["metadata"] = json.loads(d["metadata"])
        except (json.JSONDecodeError, TypeError):
            pass
    if "elements" in d and isinstance(d["elements"], str):
        try:
            d["elements"] = json.loads(d["elements"])
        except (json.JSONDecodeError, TypeError):
            pass
    # Compatibility: add archived=False for local docs (never archived, just deleted)
    if "status" in d:
        d.setdefault("archived", False)
    return d


async def create_pool(db_path: str) -> aiosqlite.Connection:
    db = await aiosqlite.connect(db_path, timeout=30)
    db.row_factory = None
    await db.execute("PRAGMA busy_timeout=10000")
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    schema = _SCHEMA_PATH.read_text()
    await db.executescript(schema)
    await db.commit()
    await _migrate(db)
    return db


def _slugify(name: str) -> str:
    s = "".join(c.lower() if c.isalnum() else "-" for c in name).strip("-")
    while "--" in s:
        s = s.replace("--", "-")
    return s or "workspace"


async def _migrate(db: aiosqlite.Connection) -> None:
    """Idempotent schema migrations keyed off PRAGMA user_version."""
    cursor = await db.execute("PRAGMA user_version")
    row = await cursor.fetchone()
    version = row[0] if row else 0

    if version < 2:
        # v1 -> v2: multi-workspace. Drop UNIQUE(user_id) on workspace and add slug.
        # SQLite needs a table rebuild to change UNIQUE constraints / add UNIQUE column.
        # Detect whether the migration is needed by inspecting the existing table.
        cursor = await db.execute("PRAGMA table_info(workspace)")
        cols = {r[1] for r in await cursor.fetchall()}

        if "slug" not in cols:
            await db.execute("BEGIN")
            try:
                await db.execute(
                    "CREATE TABLE workspace_new ("
                    "id TEXT PRIMARY KEY, "
                    "name TEXT NOT NULL, "
                    "slug TEXT NOT NULL UNIQUE, "
                    "description TEXT DEFAULT '', "
                    "user_id TEXT NOT NULL, "
                    "created_at TEXT DEFAULT (datetime('now'))"
                    ")"
                )
                # Backfill slug from name; in single-workspace land there is at most one row.
                cursor = await db.execute(
                    "SELECT id, name, description, user_id, created_at FROM workspace"
                )
                existing = await cursor.fetchall()
                for rid, name, desc, uid, created in existing:
                    slug = _slugify(name)
                    await db.execute(
                        "INSERT INTO workspace_new (id, name, slug, description, user_id, created_at) "
                        "VALUES (?, ?, ?, ?, ?, ?)",
                        (rid, name, slug, desc or "", uid, created),
                    )
                await db.execute("DROP TABLE workspace")
                await db.execute("ALTER TABLE workspace_new RENAME TO workspace")
                await db.commit()
                logger.info("Migrated workspace table to multi-workspace schema (v2)")
            except Exception:
                await db.rollback()
                raise

        await db.execute("PRAGMA user_version = 2")
        await db.commit()

    if version < 3:
        cursor = await db.execute("PRAGMA table_info(documents)")
        cols = {r[1] for r in await cursor.fetchall()}
        await cursor.close()
        cursor = await db.execute("SELECT id FROM workspace ORDER BY created_at LIMIT 1")
        workspace_row = await cursor.fetchone()
        await cursor.close()
        if "workspace_id" not in cols:
            if workspace_row:
                await db.execute("ALTER TABLE documents ADD COLUMN workspace_id TEXT")
                await db.execute("UPDATE documents SET workspace_id = ?", (workspace_row[0],))
                await db.execute("CREATE INDEX IF NOT EXISTS idx_documents_workspace_id ON documents(workspace_id)")
                await db.commit()
                logger.info("Migrated documents table to workspace-scoped schema (v3)")

        if workspace_row and await _documents_have_global_relative_unique(db):
            await _rebuild_documents_table(db, workspace_row[0])
            logger.info("Rebuilt documents table with workspace-scoped relative path uniqueness")

        await db.execute("PRAGMA user_version = 3")
        await db.commit()

    if version < 4:
        await _fix_broken_document_fks(db)
        await db.execute("PRAGMA user_version = 4")
        await db.commit()


async def _dependent_tables_reference_documents_old(db: aiosqlite.Connection) -> bool:
    """Return True if any dependent table still has its FK rewritten to 'documents_old'."""
    for tbl in ("document_chunks", "document_pages", "document_references"):
        cursor = await db.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (tbl,)
        )
        row = await cursor.fetchone()
        await cursor.close()
        if row and row[0] and "documents_old" in row[0]:
            return True
    return False


async def _fix_broken_document_fks(db: aiosqlite.Connection) -> None:
    """Fix document_chunks/pages/references whose FKs were rewritten to 'documents_old'
    by a previous migration that used ALTER TABLE documents RENAME TO documents_old."""
    if not await _dependent_tables_reference_documents_old(db):
        return

    logger.info("Fixing broken FK references to documents_old in dependent tables")
    await db.execute("PRAGMA foreign_keys=OFF")
    try:
        # document_chunks: rebuild preserving data, then recreate FTS triggers
        await db.execute(
            "CREATE TABLE document_chunks_new ("
            "id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), "
            "document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, "
            "chunk_index INTEGER NOT NULL, "
            "content TEXT NOT NULL, "
            "page INTEGER, "
            "start_char INTEGER, "
            "token_count INTEGER NOT NULL, "
            "header_breadcrumb TEXT, "
            "created_at TEXT DEFAULT (datetime('now')), "
            "UNIQUE(document_id, chunk_index))"
        )
        await db.execute("INSERT INTO document_chunks_new SELECT * FROM document_chunks")
        await db.execute("DROP TABLE document_chunks")
        await db.execute("ALTER TABLE document_chunks_new RENAME TO document_chunks")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_chunks_doc ON document_chunks(document_id)")
        # Recreate FTS triggers dropped along with the old document_chunks table
        await db.execute(
            "CREATE TRIGGER IF NOT EXISTS chunks_fts_insert AFTER INSERT ON document_chunks BEGIN\n"
            "    INSERT INTO chunks_fts(rowid, content) VALUES (new.rowid, new.content);\n"
            "END"
        )
        await db.execute(
            "CREATE TRIGGER IF NOT EXISTS chunks_fts_delete AFTER DELETE ON document_chunks BEGIN\n"
            "    INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.rowid, old.content);\n"
            "END"
        )
        await db.execute(
            "CREATE TRIGGER IF NOT EXISTS chunks_fts_update AFTER UPDATE ON document_chunks BEGIN\n"
            "    INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.rowid, old.content);\n"
            "    INSERT INTO chunks_fts(rowid, content) VALUES (new.rowid, new.content);\n"
            "END"
        )

        # document_pages
        await db.execute(
            "CREATE TABLE document_pages_new ("
            "id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), "
            "document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, "
            "page INTEGER NOT NULL, "
            "content TEXT NOT NULL, "
            "elements TEXT, "
            "UNIQUE(document_id, page))"
        )
        await db.execute("INSERT INTO document_pages_new SELECT * FROM document_pages")
        await db.execute("DROP TABLE document_pages")
        await db.execute("ALTER TABLE document_pages_new RENAME TO document_pages")

        # document_references
        await db.execute(
            "CREATE TABLE document_references_new ("
            "id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), "
            "source_document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, "
            "target_document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, "
            "reference_type TEXT NOT NULL CHECK (reference_type IN ('cites', 'links_to')), "
            "page INTEGER, "
            "UNIQUE(source_document_id, target_document_id, reference_type))"
        )
        await db.execute("INSERT INTO document_references_new SELECT * FROM document_references")
        await db.execute("DROP TABLE document_references")
        await db.execute("ALTER TABLE document_references_new RENAME TO document_references")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_refs_source ON document_references(source_document_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_refs_target ON document_references(target_document_id)")

        await db.commit()
        logger.info("Fixed FK references in document_chunks, document_pages, document_references")
    except Exception:
        await db.rollback()
        raise
    finally:
        await db.execute("PRAGMA foreign_keys=ON")


async def _documents_have_global_relative_unique(db: aiosqlite.Connection) -> bool:
    cursor = await db.execute("PRAGMA index_list(documents)")
    indexes = await cursor.fetchall()
    await cursor.close()
    for index in indexes:
        # PRAGMA index_list: seq, name, unique, origin, partial
        if not index[2]:
            continue
        info = await db.execute(f"PRAGMA index_info({index[1]})")
        cols = [row[2] for row in await info.fetchall()]
        await info.close()
        if cols == ["relative_path"]:
            return True
    return False


async def _rebuild_documents_table(db: aiosqlite.Connection, fallback_workspace_id: str) -> None:
    columns = (
        "id, workspace_id, user_id, filename, title, path, relative_path, source_kind, "
        "file_type, file_size, document_number, status, page_count, content, tags, date, "
        "metadata, error_message, version, parser, content_hash, mtime_ns, last_indexed_at, "
        "stale_since, created_at, updated_at"
    )
    select_columns = columns.replace("workspace_id", "COALESCE(workspace_id, ?) AS workspace_id", 1)

    await db.commit()
    await db.execute("PRAGMA foreign_keys=OFF")
    try:
        # Use create-new / copy / drop-old / rename pattern to avoid SQLite auto-rewriting
        # FK references in dependent tables (document_chunks, document_pages, document_references)
        # when renaming 'documents'. Those tables reference 'documents' by name; if we renamed
        # 'documents' to 'documents_old' first, SQLite would rewrite their FKs to 'documents_old'
        # and then DROP TABLE documents_old leaves them with a dangling reference.
        await db.execute(
            "CREATE TABLE documents_new ("
            "id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), "
            "workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE, "
            "user_id TEXT NOT NULL, filename TEXT NOT NULL, title TEXT, "
            "path TEXT DEFAULT '/' NOT NULL, relative_path TEXT NOT NULL, "
            "source_kind TEXT NOT NULL CHECK (source_kind IN ('wiki', 'source', 'asset')), "
            "file_type TEXT NOT NULL, file_size INTEGER DEFAULT 0, document_number INTEGER, "
            "status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')), "
            "page_count INTEGER, content TEXT, tags TEXT DEFAULT '[]', date TEXT, metadata TEXT, "
            "error_message TEXT, version INTEGER DEFAULT 0, parser TEXT, content_hash TEXT, "
            "mtime_ns INTEGER, last_indexed_at TEXT, stale_since TEXT, "
            "created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), "
            "UNIQUE(workspace_id, relative_path))"
        )
        await db.execute(
            f"INSERT INTO documents_new ({columns}) SELECT {select_columns} FROM documents",
            (fallback_workspace_id,),
        )
        await db.execute("DROP TABLE documents")
        await db.execute("ALTER TABLE documents_new RENAME TO documents")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_documents_relative_path ON documents(relative_path)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_documents_workspace_id ON documents(workspace_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(path)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_documents_source_kind ON documents(source_kind)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)")
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    finally:
        await db.execute("PRAGMA foreign_keys=ON")


class SQLiteDocumentRepository:
    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    async def list_by_kb(self, kb_id: str, *, path: str | None = None, archived: bool = False) -> list[dict]:
        if path:
            cursor = await self._db.execute(
                f"SELECT {_DOC_COLUMNS} FROM documents "
                "WHERE workspace_id = ? AND path = ? AND status != 'failed' "
                "ORDER BY filename",
                (kb_id, path),
            )
        else:
            cursor = await self._db.execute(
                f"SELECT {_DOC_COLUMNS} FROM documents "
                "WHERE workspace_id = ? AND status != 'failed' ORDER BY filename",
                (kb_id,),
            )
        rows = await cursor.fetchall()
        return [_row_to_dict(cursor, r) for r in rows]

    async def get(self, doc_id: str) -> dict | None:
        cursor = await self._db.execute(
            f"SELECT {_DOC_COLUMNS} FROM documents WHERE id = ?", (doc_id,),
        )
        row = await cursor.fetchone()
        return _row_to_dict(cursor, row) if row else None

    async def get_content(self, doc_id: str) -> dict | None:
        cursor = await self._db.execute(
            "SELECT id, content, version FROM documents WHERE id = ?", (doc_id,),
        )
        row = await cursor.fetchone()
        return _row_to_dict(cursor, row) if row else None

    async def get_for_url(self, doc_id: str) -> dict | None:
        cursor = await self._db.execute(
            "SELECT id, user_id, filename, file_type FROM documents WHERE id = ?",
            (doc_id,),
        )
        row = await cursor.fetchone()
        return _row_to_dict(cursor, row) if row else None

    async def find_by_path(
        self, kb_id: str, user_id: str, filename: str, path: str,
    ) -> dict | None:
        cursor = await self._db.execute(
            f"SELECT {_DOC_COLUMNS} FROM documents WHERE user_id = ? "
            "AND workspace_id = ? AND filename = ? AND path = ? AND status != 'failed'",
            (user_id, kb_id, filename, path),
        )
        row = await cursor.fetchone()
        return _row_to_dict(cursor, row) if row else None

    async def create_note(
        self, kb_id: str, user_id: str, filename: str, path: str,
        title: str, content: str, tags: list[str],
    ) -> dict:
        doc_id = str(uuid.uuid4())
        relative_path = (path.rstrip("/") + "/" + filename).lstrip("/")
        source_kind = "wiki" if path.strip("/").startswith("wiki") else "source"

        cursor = await self._db.execute(
            "SELECT COALESCE(MAX(document_number), 0) + 1 FROM documents WHERE workspace_id = ?",
            (kb_id,),
        )
        row = await cursor.fetchone()
        doc_number = row[0]

        await self._db.execute(
            "INSERT INTO documents (id, workspace_id, user_id, filename, title, path, relative_path, source_kind, "
            "file_type, status, content, tags, version, document_number) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'md', 'ready', ?, ?, 0, ?)",
            (doc_id, kb_id, user_id, filename, title, path, relative_path, source_kind,
             content, json.dumps(tags), doc_number),
        )
        await self._db.commit()
        return await self.get(doc_id)

    async def update_content(self, doc_id: str, user_id: str, content: str) -> dict | None:
        cursor = await self._db.execute(
            "UPDATE documents SET content = ?, version = version + 1, "
            "updated_at = datetime('now') WHERE id = ? "
            "RETURNING id, content, version",
            (content, doc_id),
        )
        row = await cursor.fetchone()
        await self._db.commit()
        return _row_to_dict(cursor, row) if row else None

    async def update_metadata(self, doc_id: str, user_id: str, **fields) -> dict | None:
        updates = []
        params = []
        for key, value in fields.items():
            if key == "tags":
                updates.append("tags = ?")
                params.append(json.dumps(value))
            elif key == "metadata":
                updates.append("metadata = ?")
                params.append(json.dumps(value))
            else:
                updates.append(f"{key} = ?")
                params.append(value)

        if not updates:
            return None

        updates.append("updated_at = datetime('now')")
        params.append(doc_id)

        sql = f"UPDATE documents SET {', '.join(updates)} WHERE id = ?"
        await self._db.execute(sql, params)
        await self._db.commit()
        return await self.get(doc_id)

    async def archive(self, doc_id: str, user_id: str) -> bool:
        await self._db.execute("DELETE FROM document_pages WHERE document_id = ?", (doc_id,))
        await self._db.execute("DELETE FROM document_chunks WHERE document_id = ?", (doc_id,))
        cursor = await self._db.execute(
            "DELETE FROM documents WHERE id = ?", (doc_id,),
        )
        await self._db.commit()
        return cursor.rowcount > 0

    async def bulk_archive(self, doc_ids: list[str], user_id: str) -> None:
        if not doc_ids:
            return
        placeholders = ",".join("?" for _ in doc_ids)
        await self._db.execute(f"DELETE FROM document_pages WHERE document_id IN ({placeholders})", doc_ids)
        await self._db.execute(f"DELETE FROM document_chunks WHERE document_id IN ({placeholders})", doc_ids)
        await self._db.execute(
            f"DELETE FROM documents WHERE id IN ({placeholders})", doc_ids,
        )
        await self._db.commit()

    async def get_kb_id(self, doc_id: str) -> str | None:
        cursor = await self._db.execute(
            "SELECT workspace_id FROM documents WHERE id = ?",
            (doc_id,),
        )
        row = await cursor.fetchone()
        return row[0] if row else None

    async def update_status(self, doc_id: str, status: str, **fields) -> None:
        updates = ["status = ?"]
        params = [status]
        for key, value in fields.items():
            updates.append(f"{key} = ?")
            params.append(value)
        updates.append("updated_at = datetime('now')")
        params.append(doc_id)

        await self._db.execute(
            f"UPDATE documents SET {', '.join(updates)} WHERE id = ?", params,
        )
        await self._db.commit()

    async def get_for_processing(self, doc_id: str, user_id: str) -> dict | None:
        cursor = await self._db.execute(
            "SELECT filename, file_type, "
            "workspace_id as knowledge_base_id "
            "FROM documents WHERE id = ?",
            (doc_id,),
        )
        row = await cursor.fetchone()
        return _row_to_dict(cursor, row) if row else None

    async def create_upload(
        self, doc_id: str, kb_id: str, user_id: str, filename: str,
        path: str, title: str, file_type: str, file_size: int,
    ) -> None:
        relative_path = (path.rstrip("/") + "/" + filename).lstrip("/")
        source_kind = "wiki" if path.strip("/").startswith("wiki") else "source"

        cursor = await self._db.execute(
            "SELECT COALESCE(MAX(document_number), 0) + 1 FROM documents WHERE workspace_id = ?",
            (kb_id,),
        )
        row = await cursor.fetchone()
        doc_number = row[0]

        await self._db.execute(
            "INSERT INTO documents (id, workspace_id, user_id, filename, title, path, relative_path, source_kind, "
            "file_type, file_size, status, document_number) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
            (doc_id, kb_id, user_id, filename, title, path, relative_path, source_kind,
             file_type, file_size, doc_number),
        )
        await self._db.commit()


class SQLiteKBRepository:
    """SQLite local KB repository."""

    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    async def list_all(self, user_id: str) -> list[dict]:
        cursor = await self._db.execute(
            "SELECT w.id, w.user_id, w.name, w.slug, w.description, "
            "w.created_at, w.created_at as updated_at, "
            "(SELECT count(*) FROM documents d WHERE d.workspace_id = w.id AND d.source_kind != 'wiki' AND d.status != 'failed') as source_count, "
            "(SELECT count(*) FROM documents d WHERE d.workspace_id = w.id AND d.source_kind = 'wiki' AND d.status != 'failed') as wiki_page_count "
            "FROM workspace w ORDER BY w.created_at",
        )
        rows = await cursor.fetchall()
        return [_row_to_dict(cursor, r) for r in rows]

    async def get(self, kb_id: str, user_id: str) -> dict | None:
        cursor = await self._db.execute(
            "SELECT w.id, w.user_id, w.name, w.slug, w.description, "
            "w.created_at, w.created_at as updated_at, "
            "(SELECT count(*) FROM documents d WHERE d.workspace_id = w.id AND d.source_kind != 'wiki' AND d.status != 'failed') as source_count, "
            "(SELECT count(*) FROM documents d WHERE d.workspace_id = w.id AND d.source_kind = 'wiki' AND d.status != 'failed') as wiki_page_count "
            "FROM workspace w WHERE w.id = ?",
            (kb_id,),
        )
        row = await cursor.fetchone()
        return _row_to_dict(cursor, row) if row else None

    async def get_owner(self, kb_id: str) -> str | None:
        cursor = await self._db.execute(
            "SELECT user_id FROM workspace WHERE id = ?", (kb_id,),
        )
        row = await cursor.fetchone()
        return row[0] if row else None

    async def create(self, user_id: str, name: str, slug: str, description: str | None) -> dict:
        # Ensure slug uniqueness — append a numeric suffix on collision.
        base_slug = _slugify(slug or name)
        candidate = base_slug
        i = 2
        while True:
            cursor = await self._db.execute(
                "SELECT 1 FROM workspace WHERE slug = ?", (candidate,),
            )
            if not await cursor.fetchone():
                break
            candidate = f"{base_slug}-{i}"
            i += 1

        ws_id = str(uuid.uuid4())
        await self._db.execute(
            "INSERT INTO workspace (id, name, slug, description, user_id) VALUES (?, ?, ?, ?, ?)",
            (ws_id, name, candidate, description or "", user_id),
        )
        await self._db.commit()
        return await self.get(ws_id, user_id)

    async def update(self, kb_id: str, user_id: str, **fields) -> dict | None:
        allowed = {"name", "description"}
        updates = []
        params = []
        for key, value in fields.items():
            if key in allowed:
                updates.append(f"{key} = ?")
                params.append(value)
        if not updates:
            return None
        params.append(kb_id)
        await self._db.execute(
            f"UPDATE workspace SET {', '.join(updates)} WHERE id = ?", params,
        )
        await self._db.commit()
        return await self.get(kb_id, user_id)

    async def delete(self, kb_id: str, user_id: str) -> bool:
        # Refuse to delete the last workspace so the app remains usable.
        cursor = await self._db.execute("SELECT count(*) FROM workspace")
        row = await cursor.fetchone()
        if row and row[0] <= 1:
            return False
        cursor = await self._db.execute(
            "DELETE FROM workspace WHERE id = ?", (kb_id,),
        )
        await self._db.commit()
        return (cursor.rowcount or 0) > 0

    async def count_users(self) -> int:
        return 1  # Single user in local mode


class SQLiteChunkRepository:
    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    async def store(self, doc_id: str, user_id: str, kb_id: str, chunks: list) -> None:
        await self._db.execute("DELETE FROM document_chunks WHERE document_id = ?", (doc_id,))
        if not chunks:
            await self._db.commit()
            return

        await self._db.executemany(
            "INSERT INTO document_chunks "
            "(id, document_id, chunk_index, content, page, start_char, token_count, header_breadcrumb) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (str(uuid.uuid4()), doc_id, c.index, c.content, c.page,
                 c.start_char, c.token_count, c.header_breadcrumb)
                for c in chunks
            ],
        )
        await self._db.commit()
        logger.info("Stored %d chunks for doc %s", len(chunks), doc_id[:8])

    async def search_fulltext(
        self, kb_id: str, query: str, *, limit: int = 20,
        path_filter: str | None = None, user_id: str | None = None,
    ) -> list[dict]:
        sql = (
            "SELECT dc.content, dc.page, dc.header_breadcrumb, dc.chunk_index, "
            "d.filename, d.title, d.path, d.file_type, d.tags, "
            "rank "
            "FROM document_chunks dc "
            "JOIN chunks_fts fts ON dc.rowid = fts.rowid "
            "JOIN documents d ON dc.document_id = d.id "
            "WHERE chunks_fts MATCH ? AND d.workspace_id = ? AND d.status != 'failed' "
        )
        params: list = [query, kb_id]

        if path_filter == "wiki":
            sql += "AND d.source_kind = 'wiki' "
        elif path_filter == "sources":
            sql += "AND d.source_kind != 'wiki' "

        sql += "ORDER BY rank LIMIT ?"
        params.append(limit)

        cursor = await self._db.execute(sql, params)
        rows = await cursor.fetchall()
        return [_row_to_dict(cursor, r) for r in rows]


class SQLitePageRepository:
    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    async def get_pages(self, doc_id: str, pages: list[int]) -> list[dict]:
        if not pages:
            return []
        placeholders = ",".join("?" for _ in pages)
        cursor = await self._db.execute(
            f"SELECT page, content, elements FROM document_pages "
            f"WHERE document_id = ? AND page IN ({placeholders}) ORDER BY page",
            [doc_id] + pages,
        )
        rows = await cursor.fetchall()
        return [_row_to_dict(cursor, r) for r in rows]

    async def get_all_pages(self, doc_id: str) -> list[dict]:
        cursor = await self._db.execute(
            "SELECT page, content, elements FROM document_pages "
            "WHERE document_id = ? ORDER BY page",
            (doc_id,),
        )
        rows = await cursor.fetchall()
        return [_row_to_dict(cursor, r) for r in rows]

    async def store_pages(self, doc_id: str, pages: list[tuple]) -> None:
        await self._db.execute("DELETE FROM document_pages WHERE document_id = ?", (doc_id,))
        if not pages:
            await self._db.commit()
            return

        await self._db.executemany(
            "INSERT INTO document_pages (id, document_id, page, content, elements) "
            "VALUES (?, ?, ?, ?, ?)",
            [
                (str(uuid.uuid4()), doc_id, page_num, content,
                 json.dumps(elements) if elements else None)
                for page_num, content, *rest in pages
                for elements in [rest[0] if rest else None]
            ],
        )
        await self._db.commit()


class SQLiteUserRepository:
    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    async def get(self, user_id: str) -> dict | None:
        cursor = await self._db.execute(
            "SELECT user_id as id, name as display_name, 'local@localhost' as email, 1 as onboarded "
            "FROM workspace WHERE user_id = ?",
            (user_id,),
        )
        row = await cursor.fetchone()
        return _row_to_dict(cursor, row) if row else None

    async def get_limits(self, user_id: str) -> dict | None:
        return {"page_limit": 999999, "storage_limit_bytes": 107374182400}

    async def get_usage(self, user_id: str) -> dict:
        cursor = await self._db.execute(
            "SELECT COALESCE(SUM(page_count), 0) as total_pages, "
            "COALESCE(SUM(file_size), 0) as total_storage_bytes "
            "FROM documents WHERE status != 'failed'",
        )
        row = await cursor.fetchone()
        return _row_to_dict(cursor, row) if row else {"total_pages": 0, "total_storage_bytes": 0}

    async def set_onboarded(self, user_id: str) -> None:
        pass  # Always onboarded in local mode

    async def ensure_exists(self, user_id: str, email: str = "local@localhost") -> None:
        cursor = await self._db.execute("SELECT id FROM workspace LIMIT 1")
        if not await cursor.fetchone():
            ws_id = str(uuid.uuid4())
            await self._db.execute(
                "INSERT INTO workspace (id, name, slug, description, user_id) VALUES (?, 'My Wiki', 'my-wiki', '', ?)",
                (ws_id, user_id),
            )
            await self._db.commit()
