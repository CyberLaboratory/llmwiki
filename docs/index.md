# llmwiki

API reference for the three Python services that make up the llmwiki
backend.

```{toctree}
:maxdepth: 2
:caption: Reference

apidocs/index
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

<!-- These files are emitted by sphinx-llms-txt at build time and live
     at the site root; MyST can't resolve them as cross-references, so
     we link via raw HTML. -->
- <a href="llms.txt"><code>llms.txt</code></a> — index of every page with a short summary.
- <a href="llms-full.txt"><code>llms-full.txt</code></a> — the entire docs corpus as one
  plain-text document, suitable for dropping into a context window.

Both follow the [llms.txt convention](https://llmstxt.org/).
