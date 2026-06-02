import { test as base, expect } from '@playwright/test'
import * as path from 'node:path'
import * as fs from 'node:fs'

/**
 * Custom test that writes a final full-page screenshot to
 * `evidence/<spec-slug>.<status>.png` after every test, regardless of
 * pass/fail. These files are the artifacts uploaded back into the live
 * wiki under /e2e-evidence/ so the latest run is always inspectable in-app.
 *
 * Uses an auto-fixture (rather than a plain `test.afterEach`) so the hook
 * applies to tests across all spec files that import this `test`.
 */
export const test = base.extend<{ _evidenceCapture: void }>({
  _evidenceCapture: [
    async ({ page }, use, testInfo) => {
      await use()

      const evidenceDir = path.resolve(process.cwd(), 'evidence')
      fs.mkdirSync(evidenceDir, { recursive: true })

      const specFile = path.basename(testInfo.file).replace(/\.spec\.ts$/, '')
      const status = testInfo.status ?? 'unknown'
      const file = path.join(evidenceDir, `${specFile}.${status}.png`)

      try {
        await page.screenshot({ path: file, fullPage: true })
      } catch {
        /* page already closed */
      }
    },
    { auto: true },
  ],
})

export { expect }
