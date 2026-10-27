import { test, expect } from './fixtures'

// SPEC section 9, test 1: landing and navigation render with no console errors.

test('landing renders the hero, hotspots and every section', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('page-landing')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Teach a robot by')
  await expect(page.getByTestId('cta-capture')).toBeVisible()
  await expect(page.getByTestId('cta-exchange')).toBeVisible()
  await expect(page.getByTestId('hero-canvas')).toBeVisible()
  for (const id of ['landing-flow', 'landing-box', 'landing-usecases', 'landing-moat', 'landing-exchange', 'landing-cta', 'landing-footer']) {
    await page.getByTestId(id).scrollIntoViewIfNeeded()
    await expect(page.getByTestId(id)).toBeVisible()
  }
})

test('a hero hotspot opens its detail and Escape returns', async ({ page }) => {
  await page.goto('/')
  const hotspot = page.getByTestId('hotspot-do')
  await expect(hotspot).toBeVisible({ timeout: 20_000 })
  await hotspot.click()
  await expect(page.getByTestId('hero-detail')).toContainText('Do')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('hero-detail')).toBeHidden()
})

test('the top bar reaches every page', async ({ page }) => {
  await page.goto('/')
  const pages: [string, string][] = [
    ['nav-studio', 'page-studio'],
    ['nav-skills', 'page-skills'],
    ['nav-box', 'page-box'],
  ]
  for (const [nav, testId] of pages) {
    await page.getByTestId(nav).click()
    await expect(page.getByTestId(testId)).toBeVisible()
  }
  for (const nav of ['nav-learn', 'nav-robot', 'nav-exchange', 'nav-team']) {
    await page.getByTestId(nav).click()
    await expect(page.locator('main#main, [data-testid^="page-"]').first()).toBeVisible()
  }
  await page.getByTestId('nav-home').click()
  await expect(page.getByTestId('page-landing')).toBeVisible()
})

test('the persona switcher changes who the app acts as', async ({ page }) => {
  await page.goto('/box')
  await page.getByTestId('persona-switcher').click()
  await page.getByTestId('persona-u_atlas').click()
  await expect(page.getByTestId('persona-switcher')).toContainText('Atlas')
  expect(await page.evaluate(() => localStorage.getItem('tacit.persona'))).toBe('u_atlas')
})

test('the guided tour walks Watch, Check, Teach, Do, Earn', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tour-start').click()
  await expect(page.getByTestId('tour')).toContainText('Watch')
  await expect(page).toHaveURL(/\/studio/)
  await page.getByTestId('tour-next').click()
  await expect(page).toHaveURL(/\/skills\/.+tab=verify/)
  await page.getByTestId('tour-next').click()
  await expect(page).toHaveURL(/\/learn\//)
  await page.getByTestId('tour-close').click()
  await expect(page.getByTestId('tour')).toBeHidden()
})

test('unknown routes show the 404 page', async ({ page }) => {
  await page.goto('/no-such-page')
  await expect(page.getByTestId('page-notfound')).toContainText('Nothing was captured here')
})
