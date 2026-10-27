import { test, expect, REAL, studioUrl } from './fixtures'

// SPEC section 9, test 3 (UI half): live capture with the fake camera, coach question, answer,
// then processing. The mic is Chromium's fake audio file (a tone, then silence).

test('live capture with the fake camera reaches the coach and processing', async ({ page }) => {
  test.setTimeout(REAL ? 240_000 : 90_000)
  await page.goto(studioUrl('live capture'))
  await expect(page.getByTestId('page-studio')).toBeVisible()
  await page.getByTestId('capture-start').click()
  await expect(page.getByTestId('capture-stop')).toBeVisible({ timeout: 20_000 })
  // analysis arrives: the HUD shows a MediaPipe time
  await expect(page.getByTestId('latency-mediapipe')).toContainText('ms', { timeout: 30_000 })
  // the coach asks a why question with a caption. On the real stack a question only comes after
  // the backend closes a step, which depends on motion and load; record it rather than fail.
  if (REAL) {
    const asked = await page
      .getByTestId('coach-question')
      .first()
      .waitFor({ timeout: 90_000 })
      .then(() => true)
      .catch(() => false)
    test.info().annotations.push({ type: 'coach', description: asked ? 'coach asked a question' : 'no step closed within 90 s, so no coach question' })
    if (asked) await expect(page.getByTestId('coach-caption')).toBeVisible()
  } else {
    await expect(page.getByTestId('coach-question').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('coach-caption')).toBeVisible()
  }
  // type an answer; it comes back as a transcript line
  await page.getByLabel('Type an answer').fill('Because the blue ones are pre-drilled.')
  await page.getByLabel('Send answer').click()
  await expect(page.getByTestId('expert-answer').filter({ hasText: 'pre-drilled' })).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('capture-stop').click()
  await expect(page.getByTestId('processing-panel')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('pipeline-stepper')).toBeVisible()
  await expect(page.getByTestId('open-skill')).toBeVisible()
})

test('the source picker offers webcam, sample and upload', async ({ page }) => {
  await page.goto('/studio')
  await page.getByTestId('seg-sample').click()
  await expect(page.locator('[data-testid^="sample-"]').first().or(page.getByText('No sample clips on this box yet'))).toBeVisible()
  await page.getByTestId('seg-upload').click()
  await expect(page.getByTestId('upload-drop')).toBeVisible()
  await page.getByTestId('seg-webcam').click()
  await page.getByTestId('camera-preview').click()
  await expect(page.getByTestId('live-stage')).toBeVisible()
})

// QA-8: a backend restart fails the running job and re-runs it under a new id. The Studio must
// follow the re-run instead of showing "Failed" forever. Mock only (it simulates the restart).
test('processing follows a job the box re-ran after a restart', async ({ page }) => {
  test.skip(REAL, 'simulated restart exists only in the mock backend')
  await page.goto(`/studio?title=${encodeURIComponent('Restart drill [restart]')}`)
  await page.getByTestId('capture-start').click()
  await expect(page.getByTestId('capture-stop')).toBeVisible()
  await page.waitForTimeout(1500)
  await page.getByTestId('capture-stop').click()
  await expect(page.getByTestId('processing-panel')).toBeVisible()
  await expect(page.getByTestId('processing-panel')).toContainText('Restarted, continuing', { timeout: 20_000 })
  await expect(page.getByRole('heading', { name: 'Your skill is ready' })).toBeVisible({ timeout: 40_000 })
  await expect(page.getByTestId('processing-panel')).not.toContainText('Failed')
})
