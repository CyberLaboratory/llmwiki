import { test, expect } from '@playwright/test'
import { FIXTURE_WIKI_SLUG, openWiki } from './helpers'

test('opening a wiki renders sidenav and a markdown page', async ({ page }) => {
  await openWiki(page, FIXTURE_WIKI_SLUG)

  // Sidenav search button
  await expect(page.getByRole('button', { name: /Search/ }).first()).toBeVisible()

  // The wiki tree should render at least one node
  const firstNode = page.locator('[data-testid="wiki-tree-node"]').first()
  await expect(firstNode).toBeVisible()

  // A markdown article container should render
  await expect(page.locator('.wiki-content').first()).toBeVisible({ timeout: 15_000 })
})
