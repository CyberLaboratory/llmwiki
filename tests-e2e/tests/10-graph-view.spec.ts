import { test, expect } from '@playwright/test'
import { openWiki } from './helpers'

test('toggling Graph switches to the graph view', async ({ page }) => {
  await openWiki(page)

  await page.getByRole('button', { name: /Knowledge graph/i }).click()
  await expect(page).toHaveURL(/\/graph\b/, { timeout: 10_000 })

  // GraphViewer renders an SVG or canvas; either is fine as a smoke check
  const graphSurface = page.locator('svg, canvas').first()
  await expect(graphSurface).toBeVisible({ timeout: 15_000 })
})
