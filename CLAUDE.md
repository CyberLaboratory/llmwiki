# llmwiki — agent notes

## Live instance

Default deployment: **http://llmwiki.lan:30300** (LAN, unauthenticated).
Override with `LLMWIKI_BASE_URL` when targeting staging or another box.

Sandbox wiki slug for e2e tests: `e2e-tests`. Created and seeded
automatically by `tests-e2e/global-setup.ts` — never mutate production
wikis (e.g. `container-reviews`) from a test run.

## End-to-end test policy

**Every new user-facing feature ships with a Playwright spec in
[`tests-e2e/tests/`](tests-e2e/) that runs against the live instance.**

This is non-negotiable:

1. When you add a feature (a new button, dialog, route, editor mode, etc.),
   add a corresponding `NN-<feature>.spec.ts` in the same change.
2. The spec must hit the live URL — no mocks, no fixtures-in-memory. If a
   feature can't be exercised end-to-end, surface that as a blocker, don't
   skip the test.
3. Prefer `data-testid` attributes on new interactive elements. They are the
   stable contract between the app and the suite; class names and copy
   change too often.
4. Tests run with `workers: 1` and create their own data with the `e2e-`
   prefix (`uniqueName('feature')`). Never assume pre-existing user data is
   safe to mutate or delete.
5. Before finishing a feature, run `cd tests-e2e && npm test` and confirm
   the new spec — plus all existing ones — pass. If a regression breaks an
   older spec, fix it in the same change.
6. After the suite passes, run `npm run upload-evidence` to publish the
   per-test screenshots into the live wiki under
   `/wiki/e2e-evidence/`. The summary note `e2e-evidence.md` becomes the
   visible record of "what's been verified end-to-end as of the last run."

See [tests-e2e/README.md](tests-e2e/README.md) for setup, command reference,
and conventions.

## Repo layout cheat sheet

- `web/` — Next.js app (the UI under test).
- `api/` — FastAPI backend.
- `mcp/` — MCP server.
- `converter/` — file conversion worker.
- `tests/` — Python integration tests (api + mcp).
- `tests-e2e/` — Playwright suite against the live deployment.
- `supabase/migrations/` — schema migrations.

## When in doubt

- UI features: NoteEditor lives in `web/src/components/editor/NoteEditor.tsx`
  and is wired into both the Files view and the Wiki view.
- Wiki tree: rename/move via right-click context menu on each node in
  `KBSidenav`.
- The wiki read view (`WikiContent`) and the edit view (`NoteEditor`) are
  swapped by `KBDetail` based on the `wikiEditing` flag.
