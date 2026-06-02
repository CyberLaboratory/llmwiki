import importlib.util
import os
from importlib.machinery import SourceFileLoader
import sqlite3
import sys
from pathlib import Path


def _load_cli_module():
    cli_path = Path(__file__).resolve().parents[2] / "llmwiki"
    loader = SourceFileLoader("llmwiki_cli", str(cli_path))
    spec = importlib.util.spec_from_loader("llmwiki_cli", loader)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_init_uses_shared_sqlite_schema(tmp_path):
    cli = _load_cli_module()
    workspace = tmp_path / "My Research"

    cli.cmd_init(str(workspace))

    db_path = workspace / ".llmwiki" / "index.db"
    assert db_path.exists()

    conn = sqlite3.connect(db_path)
    row = conn.execute("SELECT name, slug FROM workspace").fetchone()
    conn.close()

    assert row == ("My Research", "my-research")
    assert (workspace / "wiki" / "overview.md").exists()


def test_mcp_command_runs_from_mcp_directory(tmp_path, monkeypatch):
    cli = _load_cli_module()
    workspace = tmp_path / "workspace"
    (workspace / ".llmwiki").mkdir(parents=True)
    (workspace / ".llmwiki" / "index.db").write_bytes(b"")

    calls = {}
    old_cwd = Path.cwd()

    def fake_execvp(command, args):
        calls["command"] = command
        calls["args"] = args
        calls["cwd"] = Path.cwd()
        raise SystemExit(0)

    monkeypatch.setattr(os, "execvp", fake_execvp)
    try:
        try:
            cli.cmd_mcp(str(workspace))
        except SystemExit:
            pass
    finally:
        os.chdir(old_cwd)

    assert calls["command"] == sys.executable
    assert calls["args"][:2] == [sys.executable, "-m"]
    assert calls["args"][2] == "local_server"
    assert calls["cwd"] == cli.MCP_DIR
