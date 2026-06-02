import { test, expect } from '@playwright/test'
import { openWiki } from './helpers'

test('clicking Search opens the command palette and shows results', async ({ page }) => {
  await openWiki(page)

  // The sidenav search button is the canonical entry point; the Ctrl+K hotkey
  // is a convenience binding that this test does not depend on.
  await page.getByRole('button', { name: /Search/ }).first().click()

  const palette = page.getByPlaceholder(/Jump to page/i)
  await expect(palette).toBeVisible({ timeout: 5_000 })

  // At least one of the standard groups should appear
  await expect(page.getByText(/Wiki|Sources|Actions/i).first()).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(palette).toBeHidden()
})
