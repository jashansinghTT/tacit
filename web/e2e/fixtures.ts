import { test as base, expect, type Page } from '@playwright/test'

/** True when the suite runs against the real backend instead of the in-app mock. */
export const REAL = Boolean(process.env.TACIT_E2E_BASE)

// Console noise that is not an app error (headless GPU and media quirks).
const IGNORED = [/GPU stall due to ReadPixels/i, /WebGL: INVALID_/i, /Automatic fallback to software WebGL/i, /AudioContext was not allowed to start/i]

/**
 * `test` with a `consoleErrors` fixture: every console error or uncaught exception on the page is
 * collected, and the test fails at the end if there were any.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('console', (m) => {
        if (m.type() === 'error' && !IGNORED.some((re) => re.test(m.text()))) errors.push(m.text())
      })
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
      await use(errors)
      expect(errors, `console errors on ${page.url()}`).toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** Opens the first ready skill from the Skills page and returns its id. */
export async function openReadySkill(page: Page): Promise<string> {
  await page.goto('/skills')
  await page.getByTestId('seg-ready').click()
  const card = page.locator('[data-testid^="skill-card-"]').first()
  await expect(card).toBeVisible()
  const id = ((await card.getAttribute('data-testid')) ?? '').replace('skill-card-', '')
  await card.click()
  await expect(page.getByTestId('page-skill')).toBeVisible()
  return id
}
