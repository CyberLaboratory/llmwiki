#!/usr/bin/env node
// One-shot cleanup: remove the artifacts the e2e suite previously left
// behind in the production `container-reviews` wiki. After this runs you
// should never need to run it again — the suite now targets the
// dedicated `e2e-tests` KB.

const BASE_URL = process.env.LLMWIKI_BASE_URL ?? 'http://llmwiki.lan:30300'
const PROD_SLUG = process.env.LLMWIKI_PROD_SLUG ?? 'container-reviews'

const kbs = await (await fetch(`${BASE_URL}/v1/knowledge-bases`)).json()
const kb = kbs.find((k) => k.slug === PROD_SLUG)
if (!kb) {
  console.error(`KB "${PROD_SLUG}" not found`)
  process.exit(1)
}

const docs = await (await fetch(`${BASE_URL}/v1/knowledge-bases/${kb.id}/documents`)).json()

const isE2EArtifact = (d) =>
  d.path.startsWith('/wiki/e2e-evidence/') ||
  (d.path === '/wiki/' && d.filename === 'e2e-evidence.md') ||
  d.filename.startsWith('e2e-') ||
  d.path.includes('/e2efolder-')

const targets = docs.filter(isE2EArtifact)
console.log(`Found ${targets.length} artifacts in ${kb.name}.`)

let removed = 0
for (const d of targets) {
  const r = await fetch(`${BASE_URL}/v1/documents/${d.id}`, { method: 'DELETE' })
  if (r.ok) {
    removed++
    console.log(`  ✓ ${d.path}${d.filename}`)
  } else {
    console.warn(`  ✗ ${d.path}${d.filename}: ${r.status}`)
  }
}
console.log(`\nRemoved ${removed}/${targets.length}.`)
