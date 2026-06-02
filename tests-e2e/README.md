# llmwiki end-to-end tests

Playwright suite that runs against a **live llmwiki instance** (default
`http://llmwiki.lan:30300`). One spec per major feature.

The suite targets a **dedicated sandbox wiki** (default slug `e2e-tests`)
so production wikis stay clean. The `global-setup.ts` hook creates the
sandbox KB on first run and seeds three cross-linked notes so all specs
have content to work with.

## Setup

```bash
cd tests-e2e
npm install
npm run install-browsers   # one-time chromium download
```

## Run

```bash
npm test                   # headless — also writes evidence/<spec>.<status>.png per test
npm run test:headed        # watch the browser
npm run test:ui            # Playwright UI mode
npm run report             # open the last HTML report
npm run upload-evidence    # publish evidence/ PNGs into the live wiki
```

The `upload-evidence` step uploads every screenshot in `evidence/` to
`/wiki/e2e-evidence/` and creates (or overwrites) a wiki note
`e2e-evidence.md` that lists each test with its status and inlines the
screenshot. Open the wiki to see the latest run at a glance.

Point at a different instance or sandbox wiki:

```bash
LLMWIKI_BASE_URL=http://staging.example.com npm test
LLMWIKI_FIXTURE_SLUG=my-other-wiki npm test       # tests
LLMWIKI_KB_SLUG=my-other-wiki npm run upload-evidence  # upload target
```

## Conventions

- **One spec per feature.** File names are numbered to make the run order
  predictable (`01-…`, `02-…`).
- **Workers = 1.** The live instance is shared — parallel tests would race on
  the wiki tree.
- **Test data is prefixed `e2e-`.** Each run uses unique titles via
  `uniqueName()` so reruns don't collide. Cleanup is left to the operator; a
  files-view filter on `e2e-` makes pruning trivial.
- **No teardown of pre-existing data.** Tests never delete content they didn't
  create.

## Adding a test when shipping a feature

Per the project policy in [../CLAUDE.md](../CLAUDE.md), every new user-facing
feature ships with a spec in `tests/`:

1. Add `tests/NN-<feature>.spec.ts`.
2. Use `data-testid` attributes on new interactive elements rather than CSS
   classes — they're the contract between source and tests.
3. Run `npm test` against the live instance and confirm it passes before
   committing.
