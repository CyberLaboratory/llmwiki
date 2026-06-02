"""Sphinx configuration for llmwiki docs.

Produces an HTML site plus an AI-friendly `llms.txt` / `llms-full.txt`
bundle so the docs are equally consumable by humans and LLMs.
"""

from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

project = "llmwiki"
author = "llmwiki contributors"
copyright = "2026, llmwiki contributors"
release = os.environ.get("LLMWIKI_DOCS_VERSION", "dev")

extensions = [
    "myst_parser",
    "autodoc2",
    "sphinx.ext.napoleon",
    "sphinx.ext.viewcode",
    "sphinx.ext.intersphinx",
    "sphinx_copybutton",
    "sphinx_llms_txt",
]

# MyST — Markdown everywhere.
myst_enable_extensions = [
    "colon_fence",
    "deflist",
    "linkify",
    "tasklist",
    "fieldlist",
]
source_suffix = {".md": "markdown", ".rst": "restructuredtext"}

# autodoc2 — pulls docstrings from the three Python packages and renders
# them as Markdown so MyST can format them inline.
autodoc2_packages = [
    {"path": "../api", "module": "api"},
    {"path": "../mcp", "module": "mcp"},
    {"path": "../converter", "module": "converter"},
]
autodoc2_render_plugin = "myst"
autodoc2_hidden_objects = ["dunder", "private"]

# Napoleon — accept Google + NumPy docstring styles for hand-written
# docstrings that don't use plain reST.
napoleon_google_docstring = True
napoleon_numpy_docstring = True

intersphinx_mapping = {
    "python": ("https://docs.python.org/3", None),
    "fastapi": ("https://fastapi.tiangolo.com/", None),
}

templates_path = ["_templates"]
exclude_patterns = ["_build", "Thumbs.db", ".DS_Store", "apidocs/api/api.__pycache__*"]

# HTML output — Furo: clean, dark-mode-friendly, well-suited for API docs.
html_theme = "furo"
html_title = "llmwiki"
html_static_path = ["_static"] if (Path(__file__).parent / "_static").exists() else []

# sphinx-llms-txt — emits /llms.txt (index) and /llms-full.txt (entire
# corpus as plain text) at build time. This is the de-facto standard for
# LLM-readable documentation.
llms_txt_full_max_size = None  # no cap; include everything
llms_txt_title = "llmwiki documentation"
llms_txt_summary = (
    "API reference and architecture notes for the llmwiki stack — "
    "FastAPI backend, MCP server, and converter worker."
)
