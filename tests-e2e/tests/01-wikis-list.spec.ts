import { test, expect } from '@playwright/test'
import { FIXTURE_WIKI_SLUG } from './helpers'

test('landing redirects to /wikis and lists at least the fixture wiki', async ({ page }) => {
  const resp = await page.goto('/')
  expect(resp?.ok()).toBeTruthy()
  await expect(page).toHaveURL(/\/wikis\b/)

  // Fixture wiki name (slug) should appear somewhere on the page
  await expect(page.locator('body')).toContainText(FIXTURE_WIKI_SLUG.replace(/-/g, ' '), {
    timeout: 10_000,
    ignoreCase: true,
  })
})
