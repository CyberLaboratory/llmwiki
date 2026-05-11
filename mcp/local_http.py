"""Local no-auth MCP server over streamable HTTP."""

import asyncio
import logging
import os
from pathlib import Path

import uvicorn
from mcp.server.fastmcp import FastMCP
from starlette.responses import PlainTextResponse
from starlette.routing import Route
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from config import settings
from local_workspace import LOCAL_USER_ID, init_workspace
from tools import register
from vaultfs import SqliteVaultFS

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("llmwiki.local_http")

_DEFAULT_WORKSPACE_PATH = "/workspace"


def _workspace_path() -> Path:
    raw = os.environ.get("WORKSPACE_PATH")
    if raw:
        return Path(raw).resolve()
    if settings.WORKSPACE_PATH and settings.WORKSPACE_PATH != ".":
        return Path(settings.WORKSPACE_PATH).resolve()
    return Path(_DEFAULT_WORKSPACE_PATH).resolve()


class WorkspaceInitASGI:
    """Initialize SQLite before the MCP app starts serving requests."""

    def __init__(self, app: ASGIApp, workspace_path: Path):
        self.app = app
        self.workspace_path = workspace_path
        self._initialized = False
        self._lock = asyncio.Lock()

    async def _ensure_initialized(self) -> None:
        if self._initialized:
            return
        async with self._lock:
            if self._initialized:
                return
            ws = await init_workspace(self.workspace_path)
            self._initialized = True
            logger.info("Local HTTP MCP server ready - workspace: %s", ws)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "lifespan":
            await self._handle_lifespan(scope, receive, send)
            return

        await self._ensure_initialized()
        await self.app(scope, receive, send)

    async def _handle_lifespan(self, scope: Scope, receive: Receive, send: Send) -> None:
        async def receive_with_workspace() -> Message:
            message = await receive()
            if message["type"] == "lifespan.startup":
                await self._ensure_initialized()
            return message

        async def send_with_shutdown(message: Message) -> None:
            await send(message)
            if message["type"] == "lifespan.shutdown.complete":
                await SqliteVaultFS.close()

        await self.app(scope, receive_with_workspace, send_with_shutdown)


mcp = FastMCP(
    name="LLM Wiki",
    instructions=(
        "You are connected to a local LLM Wiki workspace. The user has uploaded files, "
        "notes, and documents that you can read, search, edit, and organize. "
        "Call the `guide` tool first to see available knowledge bases and learn the full workflow."
    ),
)


def _get_user_id(ctx):
    return LOCAL_USER_ID


register(mcp, _get_user_id, lambda user_id: SqliteVaultFS(user_id))


@mcp.tool(name="ping", description="Test connectivity")
async def ping() -> str:
    return "pong"


async def health(request):
    return PlainTextResponse("OK")


_mcp_app = mcp.streamable_http_app()
_mcp_app.router.routes.insert(0, Route("/health", health))

app = WorkspaceInitASGI(_mcp_app, _workspace_path())


def main() -> None:
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8080")))


if __name__ == "__main__":
    main()
