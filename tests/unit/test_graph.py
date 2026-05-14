"""Unit tests for local graph service paths."""

import json

import aiosqlite

from services.graph import get_graph_local, rebuild_local


USER_ID = "local-user"


async def _make_db():
    db = await aiosqlite.connect(":memory:")
    db.row_factory = None
    await db.executescript(
        """
        CREATE TABLE documents (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            title TEXT,
            path TEXT NOT NULL,
            file_type TEXT NOT NULL,
            source_kind TEXT NOT NULL,
            metadata TEXT,
            tags TEXT DEFAULT '[]',
            status TEXT NOT NULL,
            content TEXT
        );

        CREATE TABLE document_references (
            id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
            source_document_id TEXT NOT NULL,
            target_document_id TEXT NOT NULL,
            reference_type TEXT NOT NULL,
            page INTEGER,
            UNIQUE(source_document_id, target_document_id, reference_type)
        );
        """
    )
    return db


async def test_get_graph_local_maps_sqlite_rows_and_filters_failed_docs():
    db = await _make_db()
    try:
        await db.executemany(
            "INSERT INTO documents "
            "(id, user_id, filename, title, path, file_type, source_kind, metadata, tags, status, content) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    "wiki-overview",
                    USER_ID,
                    "overview.md",
                    "Overview",
                    "/wiki/",
                    "md",
                    "wiki",
                    json.dumps({"description": "Workspace overview"}),
                    json.dumps(["overview", "graph"]),
                    "ready",
                    "Body",
                ),
                (
                    "source-report",
                    USER_ID,
                    "source.pdf",
                    "Source",
                    "/",
                    "pdf",
                    "source",
                    None,
                    json.dumps([]),
                    "ready",
                    None,
                ),
                (
                    "failed-doc",
                    USER_ID,
                    "failed.pdf",
                    "Failed",
                    "/",
                    "pdf",
                    "source",
                    None,
                    json.dumps([]),
                    "failed",
                    None,
                ),
            ],
        )
        await db.executemany(
            "INSERT INTO document_references "
            "(source_document_id, target_document_id, reference_type, page) "
            "VALUES (?, ?, ?, ?)",
            [
                ("wiki-overview", "source-report", "cites", 3),
                ("wiki-overview", "failed-doc", "links_to", None),
            ],
        )
        await db.commit()

        data = await get_graph_local(db, USER_ID)

        nodes = {node["id"]: node for node in data["nodes"]}
        assert set(nodes) == {"wiki-overview", "source-report"}
        assert nodes["wiki-overview"]["description"] == "Workspace overview"
        assert nodes["wiki-overview"]["tags"] == ["overview", "graph"]
        assert data["edges"] == [
            {"source": "wiki-overview", "target": "source-report", "type": "cites", "page": 3}
        ]
    finally:
        await db.close()


async def test_rebuild_local_maps_sqlite_rows_and_indexes_references():
    db = await _make_db()
    try:
        content = "See [Tool](entities/tool.md).\n\n[^1]: source.pdf, p.7"
        await db.executemany(
            "INSERT INTO documents "
            "(id, user_id, filename, title, path, file_type, source_kind, metadata, tags, status, content) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    "wiki-overview",
                    USER_ID,
                    "overview.md",
                    "Overview",
                    "/wiki/",
                    "md",
                    "wiki",
                    None,
                    json.dumps([]),
                    "ready",
                    content,
                ),
                (
                    "wiki-tool",
                    USER_ID,
                    "tool.md",
                    "Tool",
                    "/wiki/entities/",
                    "md",
                    "wiki",
                    None,
                    json.dumps([]),
                    "ready",
                    "Tool page",
                ),
                (
                    "source-report",
                    USER_ID,
                    "source.pdf",
                    "Source",
                    "/",
                    "pdf",
                    "source",
                    None,
                    json.dumps([]),
                    "ready",
                    None,
                ),
            ],
        )
        await db.execute(
            "INSERT INTO document_references "
            "(source_document_id, target_document_id, reference_type, page) "
            "VALUES ('old-source', 'old-target', 'links_to', NULL)"
        )
        await db.commit()

        result = await rebuild_local(db, USER_ID)

        assert result == {"citations": 1, "links": 1}
        cursor = await db.execute(
            "SELECT source_document_id, target_document_id, reference_type, page "
            "FROM document_references ORDER BY reference_type, target_document_id"
        )
        try:
            rows = await cursor.fetchall()
        finally:
            await cursor.close()

        assert rows == [
            ("wiki-overview", "source-report", "cites", 7),
            ("wiki-overview", "wiki-tool", "links_to", None),
        ]
    finally:
        await db.close()
