import { test, expect } from '@playwright/test'
import { openWiki, uniqueName } from './helpers'

test('right-click → Rename updates the wiki note title in the tree', async ({ page }) => {
  await openWiki(page)

  const originalTitle = uniqueName('rename-src')
  const renamedTitle = uniqueName('rename-dst')

  // Seed: create a note we can rename
  await page.getByTestId('new-wiki-note-button').click()
  let dialog = page.getByRole('dialog')
  await dialog.locator('input').first().fill(originalTitle)
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(dialog).toBeHidden()

  const node = page.locator('[data-testid="wiki-tree-node"]', { hasText: originalTitle }).first()
  await expect(node).toBeVisible({ timeout: 10_000 })

  await node.click({ button: 'right' })
  await page.getByRole('menuitem', { name: /Rename/ }).click()

  dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Rename note')).toBeVisible()
  const input = dialog.locator('input').first()
  await input.fill(renamedTitle)
  await dialog.getByRole('button', { name: 'Rename' }).click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })

  await expect(
    page.locator('[data-testid="wiki-tree-node"]', { hasText: renamedTitle }).first(),
  ).toBeVisible({ timeout: 10_000 })
})
