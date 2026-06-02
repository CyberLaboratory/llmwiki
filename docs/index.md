# llmwiki

API reference for the three Python services that make up the llmwiki
backend.

```{toctree}
:maxdepth: 2
:caption: Reference

apidocs/api/api
apidocs/mcp/mcp
apidocs/converter/converter
```

## Services at a glance

- **`api/`** — FastAPI backend. Routes live under `api.routes.*`,
  domain logic under `api.services.*` and `api.domain.*`.
- **`mcp/`** — Model Context Protocol server exposing read/search/reference
  tools over the same data model.
- **`converter/`** — Background worker that converts uploaded files
  (PDF, HTML, etc.) into wiki notes.

## For LLM consumers

Two machine-readable views of this site are published alongside the HTML:

- [`llms.txt`](llms.txt) — index of every page with a short summary.
- [`llms-full.txt`](llms-full.txt) — the entire docs corpus as one
  plain-text document, suitable for dropping into a context window.

Both follow the [llms.txt convention](https://llmstxt.org/).
