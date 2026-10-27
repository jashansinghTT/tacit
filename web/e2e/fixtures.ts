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

/**
 * A skill a test may write to: on the mock any ready skill; on the real stack only a test ("QA ")
 * skill, so demo data is never touched. Returns null if there is none.
 */
export async function writableSkillId(page: Page): Promise<string | null> {
  if (!REAL) return null
  const res = await page.request.get('/api/skills?include_test=1&status=ready')
  const rows = (await res.json()) as { id: string; title: string; steps_count: number }[]
  return rows.find((r) => r.title.startsWith('QA ') && r.steps_count > 0)?.id ?? null
}

/** The Studio URL for a capture; on the real stack the skill is named "QA ..." from the start. */
export function studioUrl(what: string) {
  return REAL ? `/studio?title=${encodeURIComponent(`QA e2e ${what}`)}` : '/studio'
}
