import type { Page, Locator } from '@playwright/test'

/** Existing wiki used as the canonical fixture. Must exist on the live instance. */
export const FIXTURE_WIKI_SLUG = process.env.LLMWIKI_FIXTURE_SLUG ?? 'container-reviews'

/** Prefix for any note this suite creates. Use to spot/clean up test data. */
export const E2E_PREFIX = 'e2e-'

/** Build a unique e2e- prefixed string so parallel runs don't collide. */
export function uniqueName(label: string): string {
  return `${E2E_PREFIX}${label}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

/**
 * Local-mode API derives note titles from the filename slug, replacing
 * hyphens with spaces and title-casing. This regex matches both the
 * original slug AND the displayed form, so tests can locate a note by
 * the unique name they generated without caring which form is rendered.
 */
export function titleMatcher(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/-/g, '[-\\s]')
  return new RegExp(escaped, 'i')
}

/** Navigate to a wiki and wait for the sidenav tree (or empty state) to render. */
export async function openWiki(page: Page, slug: string = FIXTURE_WIKI_SLUG): Promise<void> {
  await page.goto(`/wikis/${slug}`)
  // KBSidenav renders this header text once loaded
  await page.getByRole('button', { name: /Search/ }).first().waitFor({ state: 'visible' })
}

/** Click the first wiki tree node that has a path (skips folders without docs). */
export async function clickFirstWikiNode(page: Page): Promise<string> {
  const node = page.locator('[data-testid="wiki-tree-node"]').first()
  await node.waitFor({ state: 'visible' })
  const title = (await node.innerText()).trim()
  await node.click()
  return title
}

/** Right-click a wiki tree node by visible title to open its context menu. */
export async function openNodeContextMenu(page: Page, title: string): Promise<void> {
  const node = page.locator('[data-testid="wiki-tree-node"]', { hasText: title }).first()
  await node.waitFor({ state: 'visible' })
  await node.click({ button: 'right' })
}
