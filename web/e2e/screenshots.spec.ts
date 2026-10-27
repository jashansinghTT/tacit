import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test, expect, REAL, openReadySkill, capturedSkillId, markTestSkill } from './fixtures'

// Full-page screenshots of every page this card owns, into .orchestration/evidence/web/<mode>/.
const out = fileURLToPath(new URL(`../../.orchestration/evidence/web/${REAL ? 'real' : 'mock'}/`, import.meta.url))
mkdirSync(out, { recursive: true })

async function settle(page: import('@playwright/test').Page, ms = 2500) {
  // scroll through so in-view animations and lazy media run, then back to the top
  const h = await page.evaluate(() => document.body.scrollHeight)
  for (let y = 0; y < h; y += 700) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y)
    await page.waitForTimeout(100)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(ms)
}

const STATIC: [string, string, string][] = [
  ['landing', '/', 'page-landing'],
  ['studio', '/studio', 'page-studio'],
  ['skills', '/skills', 'page-skills'],
  ['box', '/box', 'page-box'],
  ['notfound', '/no-such-page', 'page-notfound'],
]

for (const [name, path, testId] of STATIC) {
  test(`screenshot ${name}`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByTestId(testId)).toBeVisible()
    await settle(page, name === 'landing' ? 5000 : 2500)
    await page.screenshot({ path: `${out}${name}.png`, fullPage: true })
  })
}

test('screenshot skill tabs', async ({ page }) => {
  test.setTimeout(180_000)
  await openReadySkill(page)
  for (const tab of ['overview', 'twin', 'sop', 'verify', 'answer']) {
    if (tab !== 'overview') await page.getByTestId(`tab-${tab}`).click()
    await page.waitForTimeout(tab === 'twin' || tab === 'verify' ? 6000 : 2500)
    await page.screenshot({ path: `${out}skill-${tab}.png`, fullPage: true })
  }
})

test('screenshot the tour and a hero detail', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('hotspot-check').click({ timeout: 20_000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${out}landing-hero-detail.png` })
  await page.keyboard.press('Escape')
  await page.getByTestId('tour-start').click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${out}tour-watch.png` })
})

test('screenshot a live capture', async ({ page }) => {
  test.setTimeout(REAL ? 180_000 : 60_000)
  await page.goto('/studio')
  await page.getByTestId('capture-start').click()
  await expect(page.getByTestId('coach-question').first()).toBeVisible({ timeout: REAL ? 120_000 : 30_000 })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${out}studio-live.png`, fullPage: true })
  await page.getByTestId('capture-stop').click()
  await expect(page.getByTestId('processing-panel')).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${out}studio-processing.png`, fullPage: true })
  await markTestSkill(page, await capturedSkillId(page), 'screenshot capture')
})
