import { test, expect } from './fixtures'
import { openWiki, uniqueName, titleMatcher } from './helpers'

test('creating a wiki note adds it to the tree and opens it', async ({ page }) => {
  await openWiki(page)

  const title = uniqueName('create')

  await page.getByTestId('new-wiki-note-button').click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('New wiki note')).toBeVisible()

  await dialog.locator('input').first().fill(title)
  await dialog.getByRole('button', { name: 'Create' }).click()

  // After creation the dialog closes and the new note becomes active
  await expect(dialog).toBeHidden({ timeout: 10_000 })

  // The new title appears in the tree (local mode normalizes hyphens → spaces)
  await expect(
    page.locator('[data-testid="wiki-tree-node"]', { hasText: titleMatcher(title) }).first(),
  ).toBeVisible({ timeout: 10_000 })
})
