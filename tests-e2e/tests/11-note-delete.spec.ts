import { test, expect } from '@playwright/test'
import { openWiki, uniqueName } from './helpers'

test('right-click → Delete removes the wiki note from the tree', async ({ page }) => {
  await openWiki(page)

  const title = uniqueName('delete')

  // Seed: create a note we can safely delete
  await page.getByTestId('new-wiki-note-button').click()
  let dialog = page.getByRole('dialog')
  await dialog.locator('input').first().fill(title)
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(dialog).toBeHidden()

  const node = page.locator('[data-testid="wiki-tree-node"]', { hasText: title }).first()
  await expect(node).toBeVisible({ timeout: 10_000 })

  // Open context menu → Delete
  await node.click({ button: 'right' })
  await page.getByTestId('wiki-node-delete-menuitem').click()

  // Confirmation dialog
  dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Delete note')).toBeVisible()
  await expect(dialog.getByText(title, { exact: false })).toBeVisible()

  await page.getByTestId('wiki-node-delete-confirm').click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })

  // Node is gone from the tree
  await expect(
    page.locator('[data-testid="wiki-tree-node"]', { hasText: title }),
  ).toHaveCount(0, { timeout: 10_000 })
})
