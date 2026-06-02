import { test, expect } from './fixtures'
import { openWiki } from './helpers'

test('clicking a wiki tree node loads its page and updates ?p=', async ({ page }) => {
  await openWiki(page)

  // Pick a node that has a non-empty wiki path
  const nodes = page.locator('[data-testid="wiki-tree-node"][data-wiki-path]:not([data-wiki-path=""])')
  await nodes.first().waitFor({ state: 'visible' })

  const count = await nodes.count()
  expect(count).toBeGreaterThan(0)

  // Capture the doc number of the page the suite starts on so we can
  // detect a real navigation (not just "we're already there").
  const startUrl = page.url()
  const startP = new URL(startUrl, 'http://x').searchParams.get('p')

  // Click a node that isn't the currently-active one
  let clickedNew = false
  for (let i = 0; i < count; i++) {
    const node = nodes.nth(i)
    const wikiPath = await node.getAttribute('data-wiki-path')
    if (!wikiPath) continue
    await node.click()
    await page.waitForURL(/\?p=\d+/, { timeout: 5_000 }).catch(() => {})
    const nextP = new URL(page.url(), 'http://x').searchParams.get('p')
    if (nextP && nextP !== startP) {
      clickedNew = true
      break
    }
  }
  expect(clickedNew, 'tree click should navigate to a different page').toBe(true)

  // ?p= reflects the new page; h1 + article container render
  await expect(page).toHaveURL(/\?p=\d+/)
  await expect(page.locator('.wiki-content').first()).toBeAttached({ timeout: 10_000 })
  await expect(page.locator('main h1').first()).toBeVisible({ timeout: 10_000 })
})
