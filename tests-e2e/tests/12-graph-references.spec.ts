import { test, expect } from './fixtures'
import { FIXTURE_WIKI_SLUG } from './helpers'

/**
 * The references service parses [text](path.md) links in wiki note content
 * and turns each into an edge in document_references. The graph view reads
 * those edges via GET /v1/knowledge-bases/{kb}/graph.
 *
 * This test:
 *   1. Triggers a rebuild so we know the graph reflects current content.
 *   2. Asserts the graph endpoint returns at least one node and one edge.
 *   3. Opens the Graph view and confirms the SVG renders connected lines.
 */
test('graph rebuild produces edges and the Graph view renders them', async ({ page, request }) => {
  // 1. Resolve KB id by slug
  const kbs = await (await request.get('/v1/knowledge-bases')).json()
  const kb = kbs.find((k: { slug: string }) => k.slug === FIXTURE_WIKI_SLUG)
  expect(kb, `KB "${FIXTURE_WIKI_SLUG}" exists`).toBeTruthy()

  // 2. Rebuild references
  const rebuild = await request.post(`/v1/knowledge-bases/${kb.id}/graph/rebuild`)
  expect(rebuild.ok(), 'graph rebuild succeeds').toBeTruthy()

  // 3. Fetch graph and assert non-trivial shape
  const graphResp = await request.get(`/v1/knowledge-bases/${kb.id}/graph`)
  expect(graphResp.ok(), 'GET /graph succeeds').toBeTruthy()
  const graph = await graphResp.json()

  expect(Array.isArray(graph.nodes), 'graph.nodes is an array').toBe(true)
  expect(Array.isArray(graph.edges), 'graph.edges is an array').toBe(true)
  expect(graph.nodes.length, 'at least one node').toBeGreaterThan(0)
  expect(graph.edges.length, 'at least one edge').toBeGreaterThan(0)

  // 4. Visit the Graph view and verify it renders
  await page.goto(`/wikis/${FIXTURE_WIKI_SLUG}/graph`)
  await expect(page.locator('svg, canvas').first()).toBeVisible({ timeout: 15_000 })

  // SVG-based graphs draw edges as <line> or <path> elements. Either is acceptable.
  const edgeCount = await page.locator('svg line, svg path[d]').count()
  expect(edgeCount, 'svg renders at least one drawn element').toBeGreaterThan(0)
})
