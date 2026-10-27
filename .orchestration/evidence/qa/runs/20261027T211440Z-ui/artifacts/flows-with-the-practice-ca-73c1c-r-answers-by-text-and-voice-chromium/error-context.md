# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: flows.spec.ts >> with the practice camera >> F4 learn: narration plays, practice scores with a hint, tutor answers by text and voice
- Location: e2e/flows.spec.ts:346:3

# Error details

```
Error: heard "transcribing on chip 1…"

expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 0.5
Received:    0
```

# Test source

```ts
  323 |     await run.time('process the capture (UI)', 180, async () => {
  324 |       await expect
  325 |         .poll(async () => (await api<{ status: string }>(page, `/api/skills/${skillId}`)).status, { timeout: 15 * 60_000, intervals: [3000] })
  326 |         .toMatch(/ready|failed/)
  327 |     })
  328 |     const sk = await api<{ status: string; qa: { answer: string | null; step_index: number | null }[]; steps: { index: number; why: string; why_source: string }[] }>(
  329 |       page,
  330 |       `/api/skills/${skillId}`,
  331 |     )
  332 |     expect(sk.status).toBe('ready')
  333 |     const kept = sk.qa.find((q) => q.answer && overlap(q.answer, answerText) >= 0.5)
  334 |     expect(kept, `answer not kept: ${JSON.stringify(sk.qa)}`).toBeTruthy()
  335 |     const step = sk.steps.find((s) => s.index === kept!.step_index)
  336 |     expect(step?.why_source, 'the answer is not attached to a step').toBe('expert')
  337 |     await open.click()
  338 |     await run.shot('captured-skill')
  339 |     await run.finish()
  340 |     expect(run.consoleErrors, `console errors:\n${run.consoleErrors.join('\n')}`).toEqual([])
  341 |   })
  342 | })
  343 | 
  344 | // ------------------------------------------------------------------------------------ F4
  345 | test.describe('with the practice camera', () => {
  346 |   test('F4 learn: narration plays, practice scores with a hint, tutor answers by text and voice', async ({ playwright, baseURL }, info) => {
  347 |     // A browser of its own: the trainee's camera (practice.y4m) and a spoken question (question.wav).
  348 |     const browser = await playwright.chromium.launch({ args: fakeArgs('practice.y4m', 'question.wav') })
  349 |     const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, permissions: ['camera', 'microphone'] })
  350 |     const page = await context.newPage()
  351 |     const run = new Run(page, info)
  352 |     try {
  353 |       await learnFlow(page, run)
  354 |     } catch (e) {
  355 |       await run.shot('failure').catch(() => {})
  356 |       throw e
  357 |     } finally {
  358 |       await run.finish()
  359 |       await browser.close()
  360 |     }
  361 |     expect(run.consoleErrors, `console errors:\n${run.consoleErrors.join('\n')}`).toEqual([])
  362 |   })
  363 | })
  364 | 
  365 | async function learnFlow(page: Page, run: Run) {
  366 |   await persona(page, 'u_sam')
  367 |   await trackMedia(page)
  368 |   const skillId = await sharedSkill(page)
  369 |   const sk = await api<{ quiz: { answer: number }[]; steps: unknown[] }>(page, `/api/skills/${skillId}`)
  370 |   await page.goto(`/learn/${skillId}`)
  371 |   await expect(page.getByTestId('lesson-title')).toBeVisible({ timeout: 20_000 })
  372 |   await run.shot('lesson')
  373 |   // Narration (S2 Pro): watch mode voices the intro, then each step.
  374 |   await page.getByTestId('play-intro').click().catch(() => {})
  375 |   const unblock = page.getByTestId('narration-unblock')
  376 |   if (await unblock.isVisible().catch(() => false)) await unblock.click()
  377 |   await run.time('narration starts playing', 3, async () => {
  378 |     await expect.poll(() => playedAudio(page, '/media/tts/'), { timeout: 20_000, message: 'no narration played' }).toBeGreaterThan(0.3)
  379 |   })
  380 |   await run.shot('narration')
  381 |   // Practice on the fake camera: a live match score and a hint.
  382 |   await page.getByTestId('seg-practise').click()
  383 |   await page.getByTestId('practice-start').click()
  384 |   await expect(page.getByTestId('practice-stage')).toHaveAttribute('data-state', /live|running|tracking/, { timeout: 20_000 })
  385 |   await run.time('first practice score', 5, async () => {
  386 |     await expect(page.getByTestId('score-ring')).toContainText(/\d/, { timeout: 30_000 })
  387 |   })
  388 |   await run.time('practice hint shown', 10, async () => {
  389 |     await expect(page.getByTestId('practice-hint')).toBeVisible({ timeout: 45_000 })
  390 |   })
  391 |   await page.waitForTimeout(3000)
  392 |   run.note(`practice: score ${(await page.getByTestId('score-ring').innerText()).replace(/\s+/g, ' ')}; hint "${(await page.getByTestId('practice-hint').innerText()).trim()}"`)
  393 |   await run.shot('practice')
  394 |   await page.getByTestId('practice-stop').click()
  395 |   // Tutor by text: streamed text, then spoken sentences.
  396 |   const answers = page.getByTestId('tutor-answer')
  397 |   const n0 = await answers.count()
  398 |   await page.getByTestId('tutor-input').fill('Why does the first step matter?')
  399 |   const heardBefore = await playedAudio(page, '/media/tts/')
  400 |   await page.getByTestId('tutor-send').click()
  401 |   await run.time('tutor text: first words', 3, async () => {
  402 |     await expect(answers.nth(n0).getByTestId('tutor-answer-text')).not.toBeEmpty({ timeout: 30_000 })
  403 |   })
  404 |   await run.time('tutor text: answer complete', 30, async () => {
  405 |     await expect(answers.nth(n0)).toHaveAttribute('data-status', 'done', { timeout: 120_000 })
  406 |   })
  407 |   await run.time('tutor text: answer spoken', 15, async () => {
  408 |     await expect.poll(() => playedAudio(page, '/media/tts/'), { timeout: 120_000, message: 'the tutor answer was not spoken' }).toBeGreaterThan(heardBefore + 0.3)
  409 |   })
  410 |   await run.shot('tutor-text')
  411 |   // Tutor by voice: the fake microphone plays question.wav.
  412 |   const questionText = fs.readFileSync(path.join(MEDIA, 'question.txt'), 'utf8').trim()
  413 |   await page.getByTestId('tutor-mic').click()
  414 |   await expect(page.getByTestId('tutor-recording')).toBeVisible()
  415 |   await page.waitForTimeout(7000)
  416 |   if (await page.getByTestId('tutor-recording').isVisible().catch(() => false)) await page.getByTestId('tutor-mic').click()
  417 |   await run.time('tutor voice: question transcribed', 5, async () => {
  418 |     await expect(answers).toHaveCount(n0 + 2, { timeout: 60_000 })
  419 |     await expect(page.getByTestId('tutor-question').last()).not.toBeEmpty({ timeout: 60_000 })
  420 |   })
  421 |   const asked = (await page.getByTestId('tutor-question').last().innerText()).trim()
  422 |   run.note(`voice question heard as: ${asked}`)
> 423 |   expect(overlap(asked, questionText), `heard "${asked}"`).toBeGreaterThanOrEqual(0.5)
      |                                                            ^ Error: heard "transcribing on chip 1…"
  424 |   await run.time('tutor voice: answer complete', 30, async () => {
  425 |     await expect(answers.last()).toHaveAttribute('data-status', 'done', { timeout: 120_000 })
  426 |   })
  427 |   await expect(answers.last().getByTestId('tutor-answer-text')).not.toBeEmpty()
  428 |   await run.shot('tutor-voice')
  429 |   // Quiz and certificate.
  430 |   await page.getByTestId('rail-quiz').click()
  431 |   for (const [qi, q] of sk.quiz.entries()) await page.getByTestId(`quiz-q-${qi}-c-${q.answer}`).click()
  432 |   await page.getByTestId('quiz-submit').click()
  433 |   await expect(page.getByTestId('quiz-result')).toHaveAttribute('data-passed', 'true', { timeout: 20_000 })
  434 |   await expect(page.getByTestId('certificate-image')).toBeVisible({ timeout: 20_000 })
  435 |   await run.shot('certificate')
  436 | }
  437 | 
  438 | // ------------------------------------------------------------------------------------ F5, F6, F7
  439 | test.describe('the rest', () => {
  440 |   test('F5 robot lab: train, evaluate at least 80% over 20 trials, GR00T run streams frames', async ({ page }, info) => {
  441 |     const run = new Run(page, info)
  442 |     await persona(page, 'u_priya')
  443 |     const skillId = await sharedSkill(page)
  444 |     await page.goto(`/robot/${skillId}`)
  445 |     await expect(page.getByTestId('sim-viewer')).toBeVisible({ timeout: 30_000 })
  446 |     await expect(page.getByTestId('robot-program')).toBeVisible()
  447 |     await page.waitForTimeout(1500)
  448 |     await run.shot('robot-lab')
  449 |     await page.getByTestId('mode-train').click()
  450 |     await page.getByTestId('run-train').click()
  451 |     await run.time('train the policy (UI)', 300, async () => {
  452 |       await expect(page.getByTestId('train-progress')).toHaveAttribute('data-status', /done|failed/, { timeout: 30 * 60_000 })
  453 |     })
  454 |     await expect(page.getByTestId('train-progress')).toHaveAttribute('data-status', 'done')
  455 |     await expect(page.getByTestId('loss-chart')).toBeVisible()
  456 |     await run.shot('trained')
  457 |     await page.getByTestId('mode-evaluate').click()
  458 |     await page.getByTestId('run-evaluate').click()
  459 |     await run.time('evaluate 20 trials (UI)', 180, async () => {
  460 |       await expect(page.getByTestId('trial-cell')).toHaveCount(20, { timeout: 30 * 60_000 })
  461 |       await expect(page.getByTestId('eval-score')).toContainText(/\d+\s*%/, { timeout: 30 * 60_000 })
  462 |     })
  463 |     await expect.poll(async () => (await page.getByTestId('eval-score').innerText()).trim(), { timeout: 30 * 60_000 }).toMatch(/\d+\s*%/)
  464 |     await page.waitForTimeout(2000)
  465 |     const pct = Number((await page.getByTestId('eval-score').innerText()).match(/(\d+)\s*%/)?.[1] ?? 0)
  466 |     run.note(`evaluation shows ${pct}%`)
  467 |     await run.shot('evaluated')
  468 |     expect(pct, 'policy success rate shown').toBeGreaterThanOrEqual(80)
  469 |     await page.getByTestId('mode-gr00t').click()
  470 |     await page.getByTestId('run-gr00t').click()
  471 |     await run.time('GR00T camera frames appear', 10, async () => {
  472 |       for (const cam of ['exterior', 'wrist']) {
  473 |         await expect
  474 |           .poll(async () => page.getByTestId(`camera-${cam}`).locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth), { timeout: 60_000 })
  475 |           .toBeGreaterThan(0)
  476 |       }
  477 |     })
  478 |     await expect(page.getByTestId('gr00t-latency')).toContainText(/\d+\s*ms/, { timeout: 30_000 })
  479 |     await page.waitForTimeout(5000)
  480 |     run.note(`GR00T latency panel: ${(await page.getByTestId('gr00t-latency').innerText()).replace(/\s+/g, ' ')}`)
  481 |     await run.shot('gr00t-run')
  482 |     await run.finish()
  483 |     expect(run.consoleErrors, `console errors:\n${run.consoleErrors.join('\n')}`).toEqual([])
  484 |   })
  485 | 
  486 |   test('F6 exchange: list, license as buyer, download the pack, earnings show the royalty', async ({ page }, info) => {
  487 |     const run = new Run(page, info)
  488 |     await persona(page, 'u_maria')
  489 |     const skillId = await sharedSkill(page)
  490 |     const expert = (await api<{ expert: { id: string } }>(page, `/api/skills/${skillId}`)).expert.id
  491 |     const before = await api<{ total: number }>(page, '/api/earnings', { user: expert })
  492 |     await page.goto('/')
  493 |     await page.evaluate((e) => localStorage.setItem('tacit.persona', e), expert)
  494 |     await page.goto(`/exchange/sell/${skillId}`)
  495 |     await expect(page.getByTestId('sell-steps')).toBeVisible({ timeout: 20_000 })
  496 |     await run.shot('sell-check')
  497 |     // Walk the wizard: check, consent (the expert confirms), prices, split, market, review.
  498 |     for (const step of ['check', 'consent', 'prices', 'split', 'market']) {
  499 |       await expect(page.getByTestId(`sell-step-${step}`)).toBeVisible({ timeout: 15_000 })
  500 |       if (step === 'consent') {
  501 |         await page.getByTestId('consent-confirm').click()
  502 |         await run.shot('sell-consent')
  503 |       }
  504 |       await expect(page.getByTestId('sell-next')).toBeEnabled({ timeout: 15_000 })
  505 |       await page.getByTestId('sell-next').click()
  506 |     }
  507 |     await expect(page.getByTestId('sell-step-review')).toBeVisible({ timeout: 15_000 })
  508 |     await run.shot('sell-review')
  509 |     await run.time('publish the listing', 3, async () => {
  510 |       await page.getByTestId('sell-publish').click()
  511 |       await expect(page.getByTestId('sell-published')).toBeVisible({ timeout: 20_000 })
  512 |     })
  513 |     await page.getByTestId('open-listing').click()
  514 |     await expect(page).toHaveURL(/\/exchange\/lst_/)
  515 |     const listingId = page.url().split('/exchange/')[1].split(/[?#]/)[0]
  516 |     remember('listings', listingId)
  517 |     run.note(`listing ${listingId}`)
  518 |     // The buyer licenses it.
  519 |     await page.evaluate(() => localStorage.setItem('tacit.persona', 'u_atlas'))
  520 |     await page.reload()
  521 |     await expect(page.getByTestId('license-panel')).toBeVisible({ timeout: 20_000 })
  522 |     await expect(page.getByTestId('verification-certificate')).toBeVisible()
  523 |     await run.shot('listing')
```