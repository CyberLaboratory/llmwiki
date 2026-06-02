# docs — Sphinx site for the llmwiki Python services

Builds an HTML site + AI-friendly `llms.txt` / `llms-full.txt` bundle
covering `api/`, `mcp/`, and `converter/`. Deployed to GitHub Pages via
`.github/workflows/docs.yml` on every push to `master` that touches one of
those trees.

## Local build

```bash
python -m venv .venv && source .venv/bin/activate   # or .venv\Scripts\activate
pip install -r docs/requirements.txt
sphinx-build -b html docs docs/_build/html
# open docs/_build/html/index.html
```

`docs/requirements.txt` pulls in the runtime requirements of each
documented package so `autodoc2` can import them. If a new top-level
package is added to the repo, register it in two places:

1. `autodoc2_packages` in [`conf.py`](conf.py)
2. The `toctree` in [`index.md`](index.md)

## Stack

- **Sphinx + MyST-Parser** — Markdown-first authoring.
- **sphinx-autodoc2** — Python API reference, rendered as Markdown.
- **Furo** — theme.
- **sphinx-llms-txt** — emits `/llms.txt` and `/llms-full.txt` so LLM
  agents can ingest the docs as plain text. See <https://llmstxt.org/>.

## One-time GitHub Pages setup

In the repo settings → Pages, set **Source** to *GitHub Actions*. The
`docs` workflow handles the rest.
