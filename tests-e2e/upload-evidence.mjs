#!/usr/bin/env node
// Publish the latest e2e evidence into the live wiki.
//
//   1. Upload every PNG in evidence/ as binary files under /wiki/e2e-evidence/.
//      (These don't appear in the tree directly — wiki tree only renders .md.)
//   2. Create/overwrite a markdown note `/wiki/e2e-evidence.md` that lists
//      every test with its status and inlines its screenshot. WikiContent
//      resolves relative image paths by filename, so simple ![](name.png)
//      references render the uploaded PNGs.
//
// Usage:
//   node upload-evidence.mjs
//   LLMWIKI_BASE_URL=http://staging.example.com node upload-evidence.mjs
//   LLMWIKI_KB_SLUG=my-wiki node upload-evidence.mjs

import { readdir, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const BASE_URL = process.env.LLMWIKI_BASE_URL ?? 'http://llmwiki.lan:30300'
const KB_SLUG = process.env.LLMWIKI_KB_SLUG ?? 'container-reviews'
const EVIDENCE_DIR = resolve(process.cwd(), 'evidence')
const PNG_PATH = '/wiki/e2e-evidence/'
const NOTE_PATH = '/wiki/'
const NOTE_FILENAME = 'e2e-evidence.md'

async function jsonOrThrow(resp, label) {
  if (!resp.ok) throw new Error(`${label}: ${resp.status} ${await resp.text()}`)
  return resp.json()
}

async function main() {
  const kbs = await jsonOrThrow(await fetch(`${BASE_URL}/v1/knowledge-bases`), 'kb list')
  const kb = kbs.find((k) => k.slug === KB_SLUG)
  if (!kb) throw new Error(`KB with slug "${KB_SLUG}" not found`)
  console.log(`Target: ${kb.name} (${kb.id})`)

  // Existing docs: used to delete & re-upload the same filenames
  const docs = await jsonOrThrow(
    await fetch(`${BASE_URL}/v1/knowledge-bases/${kb.id}/documents`),
    'doc list',
  )
  const existingPngs = new Map(
    docs.filter((d) => d.path === PNG_PATH).map((d) => [d.filename, d.id]),
  )
  const existingNote = docs.find((d) => d.path === NOTE_PATH && d.filename === NOTE_FILENAME)

  // PNGs
  let pngs
  try {
    pngs = (await readdir(EVIDENCE_DIR)).filter((f) => f.endsWith('.png')).sort()
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`No evidence/ directory at ${EVIDENCE_DIR} — run the suite first.`)
      process.exit(1)
    }
    throw err
  }
  if (pngs.length === 0) {
    console.error('evidence/ is empty.')
    process.exit(1)
  }

  // ── Upload PNGs (replace any existing copies first) ────────────
  for (const file of pngs) {
    const prevId = existingPngs.get(file)
    if (prevId) {
      const del = await fetch(`${BASE_URL}/v1/documents/${prevId}`, { method: 'DELETE' })
      if (!del.ok) console.warn(`  (delete previous ${file} failed: ${del.status})`)
    }

    const buf = await readFile(join(EVIDENCE_DIR, file))
    const fd = new FormData()
    fd.append('file', new Blob([buf], { type: 'image/png' }), file)
    fd.append('path', PNG_PATH)
    fd.append('knowledge_base_id', kb.id)

    const r = await fetch(`${BASE_URL}/v1/upload`, { method: 'POST', body: fd })
    if (!r.ok) {
      console.error(`  ✗ ${file}: ${r.status} ${await r.text()}`)
      continue
    }
    console.log(`  ✓ ${file} (${buf.length} bytes)`)
  }

  // ── Build the summary markdown note ────────────────────────────
  // Collect every other wiki md file so we can cross-link from the
  // evidence note. Each [text](path.md) link becomes an edge in the
  // graph once we POST /graph/rebuild below.
  const otherWikiNotes = docs.filter(
    (d) =>
      d.file_type === 'md' &&
      d.path.startsWith('/wiki/') &&
      !(d.path === NOTE_PATH && d.filename === NOTE_FILENAME),
  )

  const lines = [
    '# E2E Evidence — latest run',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Run against: ${BASE_URL}`,
    '',
    `${pngs.length} test${pngs.length === 1 ? '' : 's'} captured.`,
    '',
    '---',
    '',
    '## Screenshots',
    '',
  ]
  for (const file of pngs) {
    // Filename like `06-note-edit.passed.png` → "06 note edit" + status badge
    const m = file.match(/^(\d+)-(.+?)\.(passed|failed|interrupted|timedOut|unknown)\.png$/)
    if (!m) {
      lines.push(`### ${file}`, '', `![${file}](${file})`, '')
      continue
    }
    const [, num, slug, status] = m
    const heading = slug.replace(/-/g, ' ')
    const badge = status === 'passed' ? '✅ PASSED' : `❌ ${status.toUpperCase()}`
    lines.push(
      `### ${num}. ${heading} — ${badge}`,
      '',
      `![${file}](${file})`,
      '',
    )
  }

  if (otherWikiNotes.length > 0) {
    lines.push(
      '## References',
      '',
      'Each link below produces a graph edge from this note. After this',
      'file is saved the API extracts references and the Graph view',
      'renders this note as a hub connected to every other wiki page.',
      '',
    )
    for (const doc of otherWikiNotes) {
      // Build a relative wiki path: doc.path is `/wiki/...`, strip the
      // `/wiki/` prefix and prepend `./` so refs resolves it correctly.
      const rel = (doc.path + doc.filename).replace(/^\/wiki\//, './')
      const label = doc.title || doc.filename.replace(/\.md$/, '')
      lines.push(`- [${label}](${rel})`)
    }
    lines.push('')
  }

  const noteContent = lines.join('\n')

  // Notes can't be PUT created — they're POST-new-then-PUT-content.
  // If a previous note exists, overwrite via PUT /content; else POST new.
  if (existingNote) {
    const r = await fetch(`${BASE_URL}/v1/documents/${existingNote.id}/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: noteContent }),
    })
    if (!r.ok) console.error(`  ✗ note update: ${r.status} ${await r.text()}`)
    else console.log(`  ✓ updated existing note ${NOTE_PATH}${NOTE_FILENAME}`)
  } else {
    const r = await fetch(`${BASE_URL}/v1/knowledge-bases/${kb.id}/documents/note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: NOTE_FILENAME,
        path: NOTE_PATH,
        content: noteContent,
      }),
    })
    if (!r.ok) console.error(`  ✗ note create: ${r.status} ${await r.text()}`)
    else console.log(`  ✓ created note ${NOTE_PATH}${NOTE_FILENAME}`)
  }

  // ── Rebuild the references graph so the new links become edges ─
  const rebuild = await fetch(
    `${BASE_URL}/v1/knowledge-bases/${kb.id}/graph/rebuild`,
    { method: 'POST' },
  )
  if (!rebuild.ok) {
    console.warn(`  ! graph rebuild failed: ${rebuild.status} ${await rebuild.text()}`)
  } else {
    const result = await rebuild.json().catch(() => ({}))
    const parts = Object.entries(result).map(([k, v]) => `${k}=${v}`).join(', ')
    console.log(`  ✓ graph rebuilt (${parts || 'ok'})`)
  }

  const docNum = (await jsonOrThrow(
    await fetch(`${BASE_URL}/v1/knowledge-bases/${kb.id}/documents`),
    'final doc list',
  )).find((d) => d.path === NOTE_PATH && d.filename === NOTE_FILENAME)?.document_number

  console.log(`\nBrowse:  ${BASE_URL}/wikis/${KB_SLUG}${docNum != null ? `?p=${docNum}` : ''}`)
  console.log(`Graph:   ${BASE_URL}/wikis/${KB_SLUG}/graph`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
