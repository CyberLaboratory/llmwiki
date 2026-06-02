import { test, expect } from './fixtures'
import { openWiki, uniqueName, titleMatcher } from './helpers'

test('right-click → Move relocates the note under a new folder in the tree', async ({ page }) => {
  await openWiki(page)

  const title = uniqueName('move')
  const folder = uniqueName('folder').replace('e2e-', 'e2efolder-')

  // Seed
  await page.getByTestId('new-wiki-note-button').click()
  let dialog = page.getByRole('dialog')
  await dialog.locator('input').first().fill(title)
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(dialog).toBeHidden()

  const node = page.locator('[data-testid="wiki-tree-node"]', { hasText: titleMatcher(title) }).first()
  await expect(node).toBeVisible({ timeout: 10_000 })

  await node.click({ button: 'right' })
  await page.getByRole('menuitem', { name: /Move/ }).click()

  dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Move note')).toBeVisible()
  await dialog.locator('input').first().fill(folder)
  await dialog.getByRole('button', { name: 'Move' }).click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })

  // After the move the folder node should appear in the tree
  await expect(
    page.locator('[data-testid="wiki-tree-node"]', { hasText: titleMatcher(folder) }).first(),
  ).toBeVisible({ timeout: 10_000 })
})
