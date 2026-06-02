import os
import sys
import uuid

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "mcp"))


@pytest.fixture
async def sqlite_fs(tmp_path):
    workspace = tmp_path / "workspace"
    (workspace / ".llmwiki").mkdir(parents=True)

    from vaultfs.sqlite import SqliteVaultFS

    await SqliteVaultFS.init(str(workspace))
    fs = SqliteVaultFS("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    try:
        yield fs
    finally:
        await SqliteVaultFS.close()


async def test_resolve_kb_uses_requested_slug(sqlite_fs):
    from vaultfs.sqlite import SqliteVaultFS

    db = SqliteVaultFS._db_or_raise()
    alpha_id = str(uuid.uuid4())
    beta_id = str(uuid.uuid4())
    await db.execute(
        "INSERT INTO workspace (id, name, slug, description, user_id) VALUES (?, ?, ?, '', ?)",
        (alpha_id, "Alpha", "alpha", sqlite_fs.user_id),
    )
    await db.execute(
        "INSERT INTO workspace (id, name, slug, description, user_id) VALUES (?, ?, ?, '', ?)",
        (beta_id, "Beta", "beta", sqlite_fs.user_id),
    )
    await db.commit()

    alpha = await sqlite_fs.resolve_kb("alpha")
    beta = await sqlite_fs.resolve_kb("beta")

    assert alpha["id"] == alpha_id
    assert alpha["slug"] == "alpha"
    assert beta["id"] == beta_id
    assert beta["slug"] == "beta"


async def test_resolve_kb_rejects_unknown_slug(sqlite_fs):
    from vaultfs.sqlite import SqliteVaultFS

    db = SqliteVaultFS._db_or_raise()
    await db.execute(
        "INSERT INTO workspace (id, name, slug, description, user_id) VALUES (?, ?, ?, '', ?)",
        (str(uuid.uuid4()), "Alpha", "alpha", sqlite_fs.user_id),
    )
    await db.commit()

    assert await sqlite_fs.resolve_kb("missing") is None


async def test_documents_are_scoped_to_requested_workspace(sqlite_fs):
    from vaultfs.sqlite import SqliteVaultFS

    db = SqliteVaultFS._db_or_raise()
    alpha_id = str(uuid.uuid4())
    beta_id = str(uuid.uuid4())
    await db.execute(
        "INSERT INTO workspace (id, name, slug, description, user_id) VALUES (?, ?, ?, '', ?)",
        (alpha_id, "Alpha", "alpha", sqlite_fs.user_id),
    )
    await db.execute(
        "INSERT INTO workspace (id, name, slug, description, user_id) VALUES (?, ?, ?, '', ?)",
        (beta_id, "Beta", "beta", sqlite_fs.user_id),
    )
    await db.commit()

    await sqlite_fs.create_document(alpha_id, "alpha.md", "Alpha", "/wiki/", "md", "alpha body", ["alpha"])
    await sqlite_fs.create_document(beta_id, "beta.md", "Beta", "/wiki/", "md", "beta body", ["beta"])

    alpha_docs = await sqlite_fs.list_documents(alpha_id)
    beta_docs = await sqlite_fs.list_documents(beta_id)

    assert [doc["filename"] for doc in alpha_docs] == ["alpha.md"]
    assert [doc["filename"] for doc in beta_docs] == ["beta.md"]
    assert await sqlite_fs.get_document(alpha_id, "beta.md", "/wiki/") is None

