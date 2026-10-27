import { test, expect } from './fixtures'

// SPEC section 9, test 7 (UI half): the Box page shows the chips and their models.

test('the box page shows four chips and their models', async ({ page }) => {
  await page.goto('/box')
  await expect(page.getByTestId('chip-map')).toBeVisible()
  for (const id of [0, 1, 2, 3]) await expect(page.getByTestId(`chip-${id}`)).toBeVisible()
  for (const id of [0, 1, 2, 3]) await expect(page.getByTestId(`chip-panel-${id}`)).toBeVisible()
  await expect(page.getByTestId('model-HaMeR')).toBeVisible()
  await expect(page.getByTestId('model-gpt-oss-20b')).toBeVisible()
  await page.getByTestId('chip-2').click()
  await expect(page.getByTestId('chip-2')).toHaveAttribute('aria-pressed', 'true')
})
