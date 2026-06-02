import { test, expect } from './fixtures'
import { openWiki, uniqueName, titleMatcher } from './helpers'

// Covers the feature added in commit eccd02f: Pencil button on wiki view
// swaps in NoteEditor for the active doc.
test('Edit button swaps wiki view into NoteEditor and autosaves', async ({ page }) => {
  await openWiki(page)

  // Create a fresh note so we can safely mutate it
  const initialTitle = uniqueName('edit')
  await page.getByTestId('new-wiki-note-button').click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('input').first().fill(initialTitle)
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(dialog).toBeHidden()

  // Edit button should be visible on the wiki view
  const editBtn = page.getByTestId('edit-wiki-note-button')
  await expect(editBtn).toBeVisible({ timeout: 10_000 })
  await editBtn.click()

  // NoteEditor renders a title input (non-embedded mode)
  const titleInput = page.locator('input[placeholder="Untitled"]').first()
  await expect(titleInput).toBeVisible({ timeout: 10_000 })
  await expect(titleInput).toHaveValue(titleMatcher(initialTitle))

  // Type into the markdown editor surface (Tiptap ProseMirror)
  const editorBody = page.locator('.ProseMirror').first()
  await editorBody.click()
  const marker = `e2e edit marker ${Date.now()}`
  await editorBody.type(marker)

  // Autosave debounce is 1.5s; status flips to "Saved" once the PUT succeeds
  await expect(page.getByText(/^Saved$/)).toBeVisible({ timeout: 10_000 })

  // Go back to read view; the typed text should now be in the rendered markdown
  await page.getByRole('button', { name: /Back to page/i }).first().click()
  await expect(page.locator('.wiki-content')).toContainText(marker, { timeout: 10_000 })
})
