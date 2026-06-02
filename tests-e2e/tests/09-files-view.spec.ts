import { test, expect } from './fixtures'
import { openWiki } from './helpers'

test('toggling Sources switches to the files view', async ({ page }) => {
  await openWiki(page)

  await page.getByRole('button', { name: /^Sources$/ }).click()
  await expect(page).toHaveURL(/\/files\b/, { timeout: 10_000 })

  // The files grid sets up its own breadcrumb starting with "Files"
  await expect(page.getByText(/^Files$/).first()).toBeVisible({ timeout: 10_000 })
})
