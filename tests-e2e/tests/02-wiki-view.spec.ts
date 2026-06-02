import { test, expect } from './fixtures'
import { FIXTURE_WIKI_SLUG, openWiki } from './helpers'

test('opening a wiki renders sidenav and a markdown page', async ({ page }) => {
  await openWiki(page, FIXTURE_WIKI_SLUG)

  // Sidenav search button
  await expect(page.getByRole('button', { name: /Search/ }).first()).toBeVisible()

  // The wiki tree should render at least one node
  const firstNode = page.locator('[data-testid="wiki-tree-node"]').first()
  await expect(firstNode).toBeVisible()

  // A markdown article should render — verify the page <h1> + article container
  await expect(page.locator('main h1').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.wiki-content').first()).toBeAttached({ timeout: 15_000 })
})
