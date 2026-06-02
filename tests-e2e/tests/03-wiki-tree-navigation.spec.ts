import { test, expect } from '@playwright/test'
import { openWiki } from './helpers'

test('clicking a wiki tree node loads its page and updates ?p=', async ({ page }) => {
  await openWiki(page)

  // Pick a node that has a non-empty wiki path
  const nodes = page.locator('[data-testid="wiki-tree-node"][data-wiki-path]:not([data-wiki-path=""])')
  await nodes.first().waitFor({ state: 'visible' })

  const count = await nodes.count()
  expect(count).toBeGreaterThan(0)

  // Click the last visible doc-bearing node (anything but the auto-selected first)
  const target = nodes.nth(Math.min(count - 1, 1))
  const targetTitle = (await target.innerText()).trim()
  await target.click()

  // URL should carry a ?p= page number
  await expect(page).toHaveURL(/\?p=\d+/, { timeout: 10_000 })

  // The clicked title should appear as the h1 in the article
  await expect(page.locator('.wiki-content').first()).toBeVisible()
  await expect(page.locator('h1', { hasText: new RegExp(targetTitle.split('\n')[0], 'i') }).first())
    .toBeVisible({ timeout: 10_000 })
})
