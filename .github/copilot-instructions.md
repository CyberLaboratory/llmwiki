# LLM Wiki — Copilot Instructions

LLM Wiki is an open-source implementation of Karpathy's LLM Wiki concept. It indexes a local research folder, exposes an MCP server for Claude, and lets Claude write and maintain wiki pages in markdown.

## Repo layout

```
api/        FastAPI backend — document ingestion, search, file storage
mcp/        MCP server (stdio + streamable HTTP) — Claude's tool interface
web/        Next.js frontend — wiki viewer and workspace browser
shared/     Shared Python types/utilities used by api and mcp
converter/  Optional LibreOffice-based Office file conversion service
supabase/   SQL migrations for hosted (Postgres) mode
tests/      Integration tests
llmwiki     CLI entry point (bash script)
```

## Key concepts

- **Two modes:** `local` (SQLite, filesystem, no auth) and `hosted` (Postgres, Supabase auth, S3).
- **Filesystem is source of truth.** SQLite/Postgres is a derived search index — always rebuildable.
- **MCP tools Claude uses:** `guide`, `search`, `read`, `write`, `delete`.
- **Wiki pages** live under `wiki/` inside the workspace folder as plain markdown.
- **`.llmwiki/`** is the hidden index/cache directory inside each workspace.

## Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Python 3.11+, FastAPI, SQLite (local) / PostgreSQL (hosted) |
| MCP server | Python, `mcp` library, uvicorn |
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| PDF extraction | pdf-oxide (default), Mistral OCR (optional) |
| Auth (hosted) | Supabase JWT |
| Storage (hosted) | S3-compatible |

## Conventions

- Python code targets 3.11+. Use type hints throughout.
- FastAPI routes live in `api/routers/`. Each router file owns one resource domain.
- MCP tools are defined in `mcp/tools/`. Each file exports a single tool.
- The `MODE` environment variable (`local` | `hosted`) gates all auth and storage branching — check it rather than adding new flags.
- Frontend API calls go through the `/v1/*` Next.js proxy route (server-side) so the API host is never exposed to the browser.
- Do not add cloud dependencies to the `local` mode code path.
- Tests use pytest. Integration tests in `tests/` spin up a real SQLite workspace — do not mock the database.
