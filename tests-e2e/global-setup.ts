import type { FullConfig } from '@playwright/test'

/**
 * Idempotently ensures the e2e sandbox wiki exists and has at least one
 * bootstrap note. Lets the suite run against a fresh instance without any
 * manual setup, and keeps production wikis (e.g. container-reviews) clean.
 */
async function globalSetup(_config: FullConfig) {
  const BASE_URL = process.env.LLMWIKI_BASE_URL ?? 'http://llmwiki.lan:30300'
  const SLUG = process.env.LLMWIKI_FIXTURE_SLUG ?? 'e2e-tests'
  const NAME = 'E2E Tests'
  const DESCRIPTION = 'Sandbox for automated end-to-end Playwright tests.'

  // 1. Create the KB if it doesn't exist
  const kbs = await (await fetch(`${BASE_URL}/v1/knowledge-bases`)).json()
  let kb = kbs.find((k: { slug: string }) => k.slug === SLUG)
  if (!kb) {
    const resp = await fetch(`${BASE_URL}/v1/knowledge-bases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: NAME, description: DESCRIPTION }),
    })
    if (!resp.ok) throw new Error(`failed to create KB: ${resp.status} ${await resp.text()}`)
    kb = await resp.json()
    console.log(`[global-setup] created KB ${kb.slug} (${kb.id})`)
  }

  // 2. Ensure a bootstrap wiki note exists so tree-view tests have content
  const docs = await (await fetch(`${BASE_URL}/v1/knowledge-bases/${kb.id}/documents`)).json()
  const wikiNotes = docs.filter(
    (d: { path: string; file_type: string; archived: boolean }) =>
      d.path.startsWith('/wiki/') && d.file_type === 'md' && !d.archived,
  )
  // Seed: at least three cross-linked notes are needed so 03-tree-navigation
  // has a second node to click and 12-graph-references has real edges to
  // count after a rebuild. The seed set is created once and survives across
  // runs (the global-setup is idempotent: it only seeds when wikiNotes is
  // empty), but every seed file deliberately links to every other so the
  // graph stays populated even if other notes come and go.
  const seedFiles = [
    {
      filename: 'welcome.md',
      content: [
        '# Welcome',
        '',
        'This wiki is a sandbox used by the Playwright e2e suite.',
        'Notes prefixed with `e2e-` are created and (mostly) cleaned up by tests.',
        '',
        'See [About](./about.md) and [Reference](./reference.md), or the',
        '**E2E Evidence** note for the latest run results.',
      ].join('\n'),
    },
    {
      filename: 'about.md',
      content: [
        '# About this sandbox',
        '',
        'Created and maintained by [global-setup.ts](./welcome.md).',
        '',
        'See also: [Reference](./reference.md).',
      ].join('\n'),
    },
    {
      filename: 'reference.md',
      content: [
        '# Reference',
        '',
        'Back to [Welcome](./welcome.md) — also see [About](./about.md).',
      ].join('\n'),
    },
  ]

  const existingNames = new Set(
    wikiNotes.map((d: { filename: string }) => d.filename),
  )
  let created = 0
  for (const seed of seedFiles) {
    if (existingNames.has(seed.filename)) continue
    const resp = await fetch(
      `${BASE_URL}/v1/knowledge-bases/${kb.id}/documents/note`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...seed, path: '/wiki/' }),
      },
    )
    if (!resp.ok) {
      throw new Error(`failed to seed ${seed.filename}: ${resp.status} ${await resp.text()}`)
    }
    created++
  }
  if (created > 0) {
    console.log(`[global-setup] seeded ${created} wiki note(s) in ${kb.slug}`)
  }

  // Rebuild references so the seed links are visible as graph edges from
  // the first run (12-graph-references will rebuild again, but having edges
  // present at suite start is a useful invariant).
  await fetch(`${BASE_URL}/v1/knowledge-bases/${kb.id}/graph/rebuild`, { method: 'POST' })
}

export default globalSetup
