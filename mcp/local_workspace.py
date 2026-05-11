"""Shared local workspace initialization for no-auth MCP servers."""

import logging
import os
import uuid
from pathlib import Path

logger = logging.getLogger("llmwiki.local")

LOCAL_USER_ID = os.environ.get("LLMWIKI_USER_ID", str(uuid.uuid5(uuid.NAMESPACE_DNS, "local")))
os.environ["SUPAVAULT_USER_ID"] = LOCAL_USER_ID


async def init_workspace(workspace_path: str | Path) -> Path:
    """Initialize local workspace directories, SQLite, and scaffold wiki files."""
    ws = Path(workspace_path).resolve()

    (ws / "wiki").mkdir(parents=True, exist_ok=True)
    (ws / ".llmwiki").mkdir(parents=True, exist_ok=True)
    (ws / ".llmwiki" / "cache").mkdir(parents=True, exist_ok=True)

    from vaultfs import SqliteVaultFS

    await SqliteVaultFS.init(str(ws))

    fs = SqliteVaultFS(LOCAL_USER_ID)
    existing = await fs.get_workspace()
    if existing:
        logger.info("Workspace ready: %s", ws)
        return ws

    ws_name = ws.name
    ws_id = await fs.ensure_workspace(ws_name)

    overview_content = (
        f"This wiki tracks research on {ws_name}.\n\n"
        "## Key Findings\n\n"
        "No sources ingested yet.\n\n"
        "## Recent Updates\n\n"
        "No activity yet."
    )
    log_content = "Chronological record of ingests, queries, and maintenance passes."

    await fs.create_document(
        ws_id,
        "overview.md",
        "Overview",
        "/wiki/",
        "md",
        overview_content,
        ["overview"],
    )
    await fs.create_document(
        ws_id,
        "log.md",
        "Log",
        "/wiki/",
        "md",
        log_content,
        ["log"],
    )

    overview_path = ws / "wiki" / "overview.md"
    if not overview_path.exists():
        overview_path.write_text(overview_content + "\n", encoding="utf-8")

    log_path = ws / "wiki" / "log.md"
    if not log_path.exists():
        log_path.write_text(log_content + "\n", encoding="utf-8")

    logger.info("Initialized workspace: %s", ws)
    return ws
