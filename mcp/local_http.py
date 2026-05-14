"""Local no-auth MCP server over streamable HTTP."""

import asyncio
import logging
import os
from pathlib import Path
from urllib.parse import urlparse

import uvicorn
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
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
_LOCAL_ALLOWED_HOSTS = ["127.0.0.1:*", "localhost:*", "[::1]:*"]


def _workspace_path() -> Path:
    raw = os.environ.get("WORKSPACE_PATH")
    if raw:
        return Path(raw).resolve()
    if settings.WORKSPACE_PATH and settings.WORKSPACE_PATH != ".":
        return Path(settings.WORKSPACE_PATH).resolve()
    return Path(_DEFAULT_WORKSPACE_PATH).resolve()


def _csv_values(raw: str) -> list[str]:
    return [item.strip() for item in raw.split(",") if item.strip()]


def _allowed_host_values(raw: str) -> list[str]:
    hosts: list[str] = []
    for value in _csv_values(raw):
        if "://" in value:
            pattern = _host_pattern_from_url(value)
            if pattern:
                hosts.append(pattern)
        elif ":" not in value:
            hosts.append(f"{value}:*")
        else:
            hosts.append(value)
    return hosts


def _host_pattern_from_url(raw_url: str) -> str | None:
    host = urlparse(raw_url).hostname
    if not host:
        return None
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    return f"{host}:*"


def _default_allowed_hosts() -> list[str]:
    hosts = list(_LOCAL_ALLOWED_HOSTS)
    for raw_url in (settings.MCP_URL, os.environ.get("NEXT_PUBLIC_MCP_URL", "")):
        pattern = _host_pattern_from_url(raw_url)
        if pattern and pattern not in hosts:
            hosts.append(pattern)
    return hosts


def _transport_security_settings() -> TransportSecuritySettings:
    allowed_hosts = (
        _allowed_host_values(os.environ.get("MCP_ALLOWED_HOSTS", ""))
        or _default_allowed_hosts()
    )
    allowed_origins = _csv_values(os.environ.get("MCP_ALLOWED_ORIGINS", ""))
    if not allowed_origins:
        allowed_origins = [f"http://{host}" for host in allowed_hosts]

    return TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=allowed_hosts,
        allowed_origins=allowed_origins,
    )


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
    host="0.0.0.0",
    instructions=(
        "You are connected to a local LLM Wiki workspace. The user has uploaded files, "
        "notes, and documents that you can read, search, edit, and organize. "
        "Call the `guide` tool first to see available knowledge bases and learn the full workflow."
    ),
    transport_security=_transport_security_settings(),
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
