# LLM Wiki

[![License](https://img.shields.io/badge/license-Apache%202.0-green)](https://opensource.org/licenses/Apache-2.0)

Open-source implementation of [Karpathy's LLM Wiki](https://x.com/karpathy/status/2039805659525644595) ([spec](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)).

I built this because research folders accumulate useful material faster than I can keep summaries, links, and citations current by hand. LLM Wiki offloads that editing work to Claude so I can focus on source selection and analysis instead.

Point it at a folder, start the local app, and connect Claude over MCP. From there, Claude reads your sources, writes wiki pages, and keeps links and citations in sync.

![LLM Wiki — a compiled wiki page with citations and table of contents](wiki-page.png)

## What actually happens

1. **You have a folder** — PDFs, notes, articles, spreadsheets. Your existing research.
2. **LLM Wiki indexes it** — extracts text, chunks for search, builds a local SQLite index. Source files stay where they are.
3. **Claude connects via MCP** — reads sources, writes wiki pages under `wiki/`, maintains cross-references and footnote citations.
4. **The wiki improves** as Claude reads more of the workspace and writes more pages. Summaries, entity pages, and cross-references accumulate instead of being re-derived from scratch each conversation.

## Quick Start

**Requirements:** Python 3.11+, Node.js 20+

```bash
git clone https://github.com/lucasastorian/llmwiki.git
cd llmwiki

# Install Python deps
cd api && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd ..

# Install web deps
cd web && npm install && cd ..

# Initialize a workspace (point at any folder with your files)
./llmwiki init ~/research

# Start the app
./llmwiki serve ~/research
```

Open [localhost:3000](http://localhost:3000). Your files are indexed, wiki is scaffolded, ready to go.

### Connect Claude

```bash
./llmwiki mcp-config ~/research
```

This prints a JSON snippet for `claude_desktop_config.json` (Claude Desktop) or `.claude/settings.json` (Claude Code). One workspace runs as one MCP server entry, so if you have multiple research folders, add one entry per folder.

Then tell Claude: *"Read the guide, then ingest my sources and start building the wiki."*

### One-command start

```bash
./llmwiki open ~/research
```

Does everything: init if needed, start servers, open browser, print MCP config hint.

## CLI

| Command | What it does |
|---------|-------------|
| `llmwiki open <folder>` | Init + serve + open browser |
| `llmwiki init <folder>` | Create `.llmwiki/` + `wiki/`, index existing files |
| `llmwiki serve <folder>` | Start API on :8000 + web on :3000 |
| `llmwiki mcp <folder>` | Run stdio MCP server (for Claude config) |
| `llmwiki mcp-config <folder>` | Print `claude_desktop_config.json` snippet |
| `llmwiki reindex <folder>` | Rebuild the index from disk |

## What happens on disk

LLM Wiki adds two things to your folder. Source files are not moved or modified.

```
~/research/                  # Your existing files (untouched)
  papers/paper.pdf
  notes.md
  data.xlsx
  wiki/                      # Generated pages (created by LLM Wiki)
    overview.md
    log.md
    concepts/
      attention.md
  .llmwiki/                  # Index + cache (hidden, rebuildable)
    index.db
    cache/
```

- `wiki/` — ordinary markdown files. Edit them in any editor. Claude writes and updates them via MCP.
- `.llmwiki/` — SQLite search index and processed artifacts. Delete it anytime; `llmwiki reindex` rebuilds from the source files.

By default, indexing, storage, and file writes happen on your machine. No cloud services required.

## How Claude interacts with the workspace

Once connected, Claude has these tools:

| Tool | Description |
|------|-------------|
| `guide` | Explains how the wiki works, lists what's in the workspace |
| `search` | Browse files (`list`) or full-text search (`search`) |
| `read` | Read documents — PDFs with page ranges, glob batch reads |
| `write` | Create wiki pages, edit with `str_replace`, append. SVG/CSV assets |
| `delete` | Delete documents by path or glob pattern |

All writes go to disk first, then update the search index. If Claude creates `/wiki/concepts/attention.md`, that file appears on disk immediately.

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Next.js    │────▶│   FastAPI    │────▶│   SQLite     │
│   Frontend   │     │   Backend    │     │   (local)    │
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
                     ┌──────┴───────┐
                     │  MCP Server  │◀──── Claude Desktop / Code
                     │   (stdio)    │
                     └──────────────┘
                            │
                     ┌──────┴───────┐
                     │  Filesystem  │  ← source of truth
                     └──────────────┘
```

The filesystem is the source of truth. SQLite is a derived index — it accelerates search and stores extracted page data, but it can always be rebuilt from the files. A background file watcher picks up changes you make outside the app.

## Document processing

All processing runs locally. No API keys required for basic usage.

| Format | Parser | Notes |
|--------|--------|-------|
| PDF | pdf-oxide | Rust-based text extraction. Works well for text-heavy papers. Scanned PDFs still benefit from real OCR. |
| Markdown/Text | native | Indexed and chunked directly |
| HTML | webmd | Strips nav/ads, extracts clean markdown |
| Excel/CSV | openpyxl | Sheet-by-sheet extraction |
| Images | native | Stored as-is, viewable inline |
| Word/PowerPoint | LibreOffice | Optional. Install LibreOffice for office conversion; without it, these formats are stored but not extracted. |

Set `MISTRAL_API_KEY` for higher-quality PDF OCR with better table and layout detection. pdf-oxide is the free default and handles most text-heavy documents well enough.

## Limitations and tradeoffs

- **One workspace = one MCP server.** If you work across multiple research projects, each gets its own folder and its own MCP entry. This is intentional — it keeps context and file access scoped.
- **PDF table extraction is rough.** pdf-oxide extracts prose reliably but tables come through as messy text. For financial filings or data-heavy PDFs, Mistral OCR is significantly better.
- **LibreOffice adds setup friction.** Office file conversion requires a local LibreOffice install. If you mostly work with PDFs and markdown, you can skip it entirely.
- **No vector search in local mode.** Full-text search uses SQLite FTS5 (porter stemming). It works well for keyword queries but does not do semantic/embedding search. The hosted version at llmwiki.app uses PGroonga for ranked search.

## Local Kubernetes MCP server

The MCP image can run a no-auth, local SQLite workspace over streamable HTTP. This is intended for a trusted local Kubernetes cluster.

Build the image from the repo root with the MCP Docker context:

```bash
docker build -t llmwiki-mcp:local ./mcp
```

Run it locally with a mounted workspace:

```bash
docker run --rm \
  -p 8080:8080 \
  -e MODE=local \
  -e WORKSPACE_PATH=/workspace \
  -v "$HOME/research:/workspace" \
  llmwiki-mcp:local

curl http://localhost:8080/health
```

For Kubernetes, no command override is needed. Set `MODE=local`, mount a volume at `WORKSPACE_PATH`, and expose port `8080`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llmwiki-mcp
spec:
  selector:
    matchLabels:
      app: llmwiki-mcp
  template:
    metadata:
      labels:
        app: llmwiki-mcp
    spec:
      containers:
        - name: mcp
          image: llmwiki-mcp:local
          env:
            - name: MODE
              value: local
            - name: WORKSPACE_PATH
              value: /workspace
            # Set this to the URL clients use. It is used for MCP host validation.
            - name: MCP_URL
              value: http://llmwiki-mcp:8080/mcp
          ports:
            - containerPort: 8080
          volumeMounts:
            - name: workspace
              mountPath: /workspace
      volumes:
        - name: workspace
          persistentVolumeClaim:
            claimName: llmwiki-workspace
---
apiVersion: v1
kind: Service
metadata:
  name: llmwiki-mcp
spec:
  selector:
    app: llmwiki-mcp
  ports:
    - name: http
      port: 8080
      targetPort: 8080
```

The health check is `GET /health`. The MCP streamable HTTP endpoint is served by the MCP library at `/mcp`, so in-cluster clients can use `http://llmwiki-mcp:8080/mcp`. `MCP_URL` must match the hostname clients use, or set `MCP_ALLOWED_HOSTS` to a comma-separated allow-list such as `llmwiki-mcp:*,192.168.2.43:*`. Otherwise the MCP transport rejects requests with `421 Misdirected Request` as DNS rebinding protection. No auth is enabled in `MODE=local`; keep this Service on a trusted network or access it through `kubectl port-forward`.

Release deploys that update `CyberLaboratory/k8` require a repository secret named `K8_DEPLOY_TOKEN` with read/write access to the k8 repository. The default `GITHUB_TOKEN` is scoped to this repository and cannot update that separate deployment repository.

## Self-hosting the multi-tenant version

If you want to run the hosted version (like [llmwiki.app](https://llmwiki.app)) with Postgres, Supabase auth, and S3:


# Hosted setup instructions

### Prerequisites

- Python 3.11+
- Node.js 20+
- A [Supabase](https://supabase.com) project
- An S3-compatible bucket

### Database

```bash
psql $DATABASE_URL -f supabase/migrations/001_initial.sql
```

### API

```bash
cd api
pip install -r requirements.txt
MODE=hosted DATABASE_URL=postgresql://... uvicorn main:app --port 8000
```

### MCP Server

```bash
cd mcp
pip install -r requirements.txt
MODE=hosted DATABASE_URL=postgresql://... python -m hosted
```

### Web

```bash
cd web
npm install
NEXT_PUBLIC_MODE=hosted \
NEXT_PUBLIC_SUPABASE_URL=https://your-ref.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key \
NEXT_PUBLIC_API_URL=http://localhost:8000 \
npm run dev
```

### Environment Variables

#### Web — client-side (`NEXT_PUBLIC_*`)

These are baked into the JS bundle at build time. When running in Docker/Kubernetes the `entrypoint.sh` script substitutes runtime values into the pre-built bundle, so a single image works across environments.

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_MODE` | `local` | `local` — no auth, proxy-based API access. `hosted` — Supabase auth required. |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | External API base URL. In hosted mode this is called directly from the browser. In local mode it is used only for direct-download links (the proxy handles everything else). |
| `NEXT_PUBLIC_SUPABASE_URL` | _(none)_ | Supabase project URL. Required in hosted mode. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | _(none)_ | Supabase anonymous key. Required in hosted mode. |
| `NEXT_PUBLIC_MCP_URL` | _(none)_ | MCP server base URL exposed to the browser (hosted mode). |
| `NEXT_PUBLIC_OPENREPLAY_KEY` | _(none)_ | OpenReplay session recording key (optional). |
| `NEXT_PUBLIC_SENTRY_DSN` | _(none)_ | Sentry DSN for client-side error tracking (optional). |

#### Web — server-side only

Set in the container environment (e.g. a Kubernetes ConfigMap). Never exposed to the browser.

| Variable | Default | Description |
|---|---|---|
| `API_URL` | `http://localhost:8000` | Internal API URL used by the `/v1/*` reverse-proxy route. In Kubernetes point this at the internal ClusterIP service (e.g. `http://llmwiki-api:8000`) rather than the external NodePort — this prevents FastAPI redirect responses from leaking the API host to the browser. |

#### API

| Variable | Default | Description |
|---|---|---|
| `MODE` | `local` | `local` — filesystem storage, no auth. `hosted` — Postgres + Supabase auth. |
| `WORKSPACE_PATH` | `.` | Root directory for local file storage (local mode). |
| `DATABASE_URL` | _(none)_ | PostgreSQL connection string. Required in hosted mode. |
| `SUPABASE_URL` | _(none)_ | Supabase project URL. Required in hosted mode. |
| `SUPABASE_JWT_SECRET` | _(none)_ | JWT secret for legacy HS256 Supabase projects (optional). |
| `APP_URL` | `http://localhost:3000` | Frontend URL — used for CORS allow-list. |
| `API_URL` | `http://localhost:8000` | The API's own base URL — used when constructing absolute redirect URLs. Should match what external clients use to reach the API. |
| `STAGE` | `dev` | Deployment stage label (`dev`, `prod`, etc.). |
| `VOYAGE_API_KEY` | _(none)_ | Voyage AI embeddings key. Required for semantic search in hosted mode. |
| `TURBOPUFFER_API_KEY` | _(none)_ | TurboPuffer vector database key (hosted mode, optional). |
| `EMBEDDING_MODEL` | `voyage-4-lite` | Embedding model name. |
| `EMBEDDING_DIM` | `512` | Embedding vector dimension — must match the chosen model. |
| `MISTRAL_API_KEY` | _(none)_ | Mistral AI key for high-quality PDF OCR (optional). |
| `PDF_BACKEND` | `opendataloader` | PDF extraction backend: `opendataloader` (default, no key needed) or `mistral` (requires `MISTRAL_API_KEY`). |
| `AWS_ACCESS_KEY_ID` | _(none)_ | AWS credentials for S3 document storage (hosted mode). |
| `AWS_SECRET_ACCESS_KEY` | _(none)_ | AWS secret key. |
| `AWS_REGION` | `us-east-1` | AWS region for S3. |
| `S3_BUCKET` | `supavault-documents` | S3 bucket name for document storage. |
| `CONVERTER_URL` | _(none)_ | URL of the document converter service for Office files (optional). |
| `CONVERTER_SECRET` | _(none)_ | Shared secret for the converter service. |
| `QUOTA_MAX_PAGES` | `500` | Per-user page ingestion limit. |
| `QUOTA_MAX_PAGES_PER_DOC` | `300` | Max pages per single document. |
| `QUOTA_MAX_STORAGE_BYTES` | `1073741824` | Per-user storage cap in bytes (default 1 GB). |
| `GLOBAL_OCR_ENABLED` | `true` | Master switch for OCR processing. |
| `GLOBAL_MAX_PAGES` | `1000000` | Hard page cap across all users. |
| `GLOBAL_MAX_USERS` | `10000` | Hard user cap. |
| `LOGFIRE_TOKEN` | _(none)_ | Logfire observability token (optional). |
| `SENTRY_DSN` | _(none)_ | Sentry DSN for server-side error tracking (optional). |

#### MCP server

The Docker image defaults to hosted mode and dispatches based on `MODE`. Use `MODE=local` for the no-auth SQLite HTTP server, or `MODE=hosted` for Supabase auth and Postgres.

| Variable | Default | Description |
|---|---|---|
| `MODE` | `hosted` | `local` - no auth, `SqliteVaultFS`, workspace mounted at `WORKSPACE_PATH`. `hosted` - Supabase auth and `PostgresVaultFS`. |
| `WORKSPACE_PATH` | `/workspace` | Root directory for local MCP file storage in `MODE=local`. Mount a PVC or host path here in Kubernetes. |
| `PORT` | `8080` | Uvicorn listen port. The server binds `0.0.0.0:$PORT`. |
| `MCP_URL` | _(none)_ | The MCP server's own base URL (used by hosted auth/resource metadata). |



## Why this beats a static notes folder

Personal wikis usually fail on maintenance, not intent. Someone has to update links, fix stale summaries, merge overlapping pages, and keep citations aligned with the source material. That work scales with the number of sources, and people stop doing it.

LLM Wiki offloads that editing work. You choose the source material and direct the analysis. Claude handles the repetitive bookkeeping — updating cross-references, keeping summaries current, flagging contradictions, touching the 15 pages that a single new source affects.

## License

Apache 2.0
