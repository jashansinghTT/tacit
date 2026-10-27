# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: flows.spec.ts >> with the practice camera >> F4 learn: narration plays, practice scores with a hint, tutor answers by text and voice
- Location: e2e/flows.spec.ts:337:3

# Error details

```
Error: heard "waiting for the voice chip…"

expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 0.5
Received:    0
```

# Test source

```ts
  315 |       await expect
  316 |         .poll(async () => (await api<{ status: string }>(page, `/api/skills/${skillId}`)).status, { timeout: 15 * 60_000, intervals: [3000] })
  317 |         .toMatch(/ready|failed/)
  318 |     })
  319 |     const sk = await api<{ status: string; qa: { answer: string | null; step_index: number | null }[]; steps: { index: number; why: string; why_source: string }[] }>(
  320 |       page,
  321 |       `/api/skills/${skillId}`,
  322 |     )
  323 |     expect(sk.status).toBe('ready')
  324 |     const kept = sk.qa.find((q) => q.answer && overlap(q.answer, answerText) >= 0.5)
  325 |     expect(kept, `answer not kept: ${JSON.stringify(sk.qa)}`).toBeTruthy()
  326 |     const step = sk.steps.find((s) => s.index === kept!.step_index)
  327 |     expect(step?.why_source, 'the answer is not attached to a step').toBe('expert')
  328 |     await open.click()
  329 |     await run.shot('captured-skill')
  330 |     await run.finish()
  331 |     expect(run.consoleErrors, `console errors:\n${run.consoleErrors.join('\n')}`).toEqual([])
  332 |   })
  333 | })
  334 | 
  335 | // ------------------------------------------------------------------------------------ F4
  336 | test.describe('with the practice camera', () => {
  337 |   test('F4 learn: narration plays, practice scores with a hint, tutor answers by text and voice', async ({ playwright, baseURL }, info) => {
  338 |     // A browser of its own: the trainee's camera (practice.y4m) and a spoken question (question.wav).
  339 |     const browser = await playwright.chromium.launch({ args: fakeArgs('practice.y4m', 'question.wav') })
  340 |     const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, permissions: ['camera', 'microphone'] })
  341 |     const page = await context.newPage()
  342 |     const run = new Run(page, info)
  343 |     try {
  344 |       await learnFlow(page, run)
  345 |     } catch (e) {
  346 |       await run.shot('failure').catch(() => {})
  347 |       throw e
  348 |     } finally {
  349 |       await run.finish()
  350 |       await browser.close()
  351 |     }
  352 |     expect(run.consoleErrors, `console errors:\n${run.consoleErrors.join('\n')}`).toEqual([])
  353 |   })
  354 | })
  355 | 
  356 | async function learnFlow(page: Page, run: Run) {
  357 |   await persona(page, 'u_sam')
  358 |   await trackMedia(page)
  359 |   const skillId = await sharedSkill(page)
  360 |   const sk = await api<{ quiz: { answer: number }[]; steps: unknown[] }>(page, `/api/skills/${skillId}`)
  361 |   await page.goto(`/learn/${skillId}`)
  362 |   await expect(page.getByTestId('lesson-title')).toBeVisible({ timeout: 20_000 })
  363 |   await run.shot('lesson')
  364 |   // Narration (S2 Pro): watch mode voices the intro, then each step.
  365 |   await page.getByTestId('play-intro').click().catch(() => {})
  366 |   const unblock = page.getByTestId('narration-unblock')
  367 |   if (await unblock.isVisible().catch(() => false)) await unblock.click()
  368 |   await run.time('narration starts playing', 3, async () => {
  369 |     await expect.poll(() => playedAudio(page, '/media/tts/'), { timeout: 20_000, message: 'no narration played' }).toBeGreaterThan(0.3)
  370 |   })
  371 |   await run.shot('narration')
  372 |   // Practice on the fake camera: a live match score and a hint.
  373 |   await page.getByTestId('seg-practise').click()
  374 |   await page.getByTestId('practice-start').click()
  375 |   await expect(page.getByTestId('practice-stage')).toHaveAttribute('data-state', /live|running|tracking/, { timeout: 20_000 })
  376 |   await run.time('first practice score', 5, async () => {
  377 |     await expect(page.getByTestId('score-ring')).toContainText(/\d/, { timeout: 30_000 })
  378 |   })
  379 |   await run.time('practice hint shown', 10, async () => {
  380 |     await expect(page.getByTestId('practice-hint')).toBeVisible({ timeout: 45_000 })
  381 |   })
  382 |   await page.waitForTimeout(3000)
  383 |   run.note(`practice: score ${(await page.getByTestId('score-ring').innerText()).replace(/\s+/g, ' ')}; hint "${(await page.getByTestId('practice-hint').innerText()).trim()}"`)
  384 |   await run.shot('practice')
  385 |   await page.getByTestId('practice-stop').click()
  386 |   // Tutor by text: streamed text, then spoken sentences.
  387 |   const answers = page.getByTestId('tutor-answer')
  388 |   const n0 = await answers.count()
  389 |   await page.getByTestId('tutor-input').fill('Why does the first step matter?')
  390 |   const heardBefore = await playedAudio(page, '/media/tts/')
  391 |   await page.getByTestId('tutor-send').click()
  392 |   await run.time('tutor text: first words', 3, async () => {
  393 |     await expect(answers.nth(n0).getByTestId('tutor-answer-text')).not.toBeEmpty({ timeout: 30_000 })
  394 |   })
  395 |   await run.time('tutor text: answer complete', 30, async () => {
  396 |     await expect(answers.nth(n0)).toHaveAttribute('data-status', 'done', { timeout: 120_000 })
  397 |   })
  398 |   await run.time('tutor text: answer spoken', 15, async () => {
  399 |     await expect.poll(() => playedAudio(page, '/media/tts/'), { timeout: 120_000, message: 'the tutor answer was not spoken' }).toBeGreaterThan(heardBefore + 0.3)
  400 |   })
  401 |   await run.shot('tutor-text')
  402 |   // Tutor by voice: the fake microphone plays question.wav.
  403 |   const questionText = fs.readFileSync(path.join(MEDIA, 'question.txt'), 'utf8').trim()
  404 |   await page.getByTestId('tutor-mic').click()
  405 |   await expect(page.getByTestId('tutor-recording')).toBeVisible()
  406 |   await page.waitForTimeout(7000)
  407 |   if (await page.getByTestId('tutor-recording').isVisible().catch(() => false)) await page.getByTestId('tutor-mic').click()
  408 |   await run.time('tutor voice: question transcribed', 5, async () => {
  409 |     await expect(answers).toHaveCount(n0 + 2, { timeout: 60_000 })
  410 |     await expect(page.getByTestId('tutor-question').last()).not.toBeEmpty({ timeout: 60_000 })
  411 |     await expect(page.getByTestId('tutor-question').last()).not.toContainText(/transcribing|listening/i, { timeout: 90_000 })
  412 |   })
  413 |   const asked = (await page.getByTestId('tutor-question').last().innerText()).trim()
  414 |   run.note(`voice question heard as: ${asked}`)
> 415 |   expect(overlap(asked, questionText), `heard "${asked}"`).toBeGreaterThanOrEqual(0.5)
      |                                                            ^ Error: heard "waiting for the voice chip…"
  416 |   await run.time('tutor voice: answer complete', 30, async () => {
  417 |     await expect(answers.last()).toHaveAttribute('data-status', 'done', { timeout: 120_000 })
  418 |   })
  419 |   await expect(answers.last().getByTestId('tutor-answer-text')).not.toBeEmpty()
  420 |   await run.shot('tutor-voice')
  421 |   // Quiz and certificate.
  422 |   await page.getByTestId('rail-quiz').click()
  423 |   for (const [qi, q] of sk.quiz.entries()) await page.getByTestId(`quiz-q-${qi}-c-${q.answer}`).click()
  424 |   await page.getByTestId('quiz-submit').click()
  425 |   await expect(page.getByTestId('quiz-result')).toHaveAttribute('data-passed', 'true', { timeout: 20_000 })
  426 |   await expect(page.getByTestId('certificate-image')).toBeVisible({ timeout: 20_000 })
  427 |   await run.shot('certificate')
  428 | }
  429 | 
  430 | // ------------------------------------------------------------------------------------ F5, F6, F7
  431 | test.describe('the rest', () => {
  432 |   test('F5 robot lab: train, evaluate at least 80% over 20 trials, GR00T run streams frames', async ({ page }, info) => {
  433 |     test.setTimeout(40 * 60_000)
  434 |     const run = new Run(page, info)
  435 |     await persona(page, 'u_priya')
  436 |     const skillId = await sharedSkill(page)
  437 |     await page.goto(`/robot/${skillId}`)
  438 |     await expect(page.getByTestId('sim-viewer')).toBeVisible({ timeout: 30_000 })
  439 |     await expect(page.getByTestId('robot-program')).toBeVisible()
  440 |     await page.waitForTimeout(1500)
  441 |     await run.shot('robot-lab')
  442 |     await page.getByTestId('mode-train').click()
  443 |     await page.getByTestId('run-train').click()
  444 |     await run.time('train the policy (UI)', 300, async () => {
  445 |       await expect(page.getByTestId('train-progress')).toHaveAttribute('data-status', /done|failed/, { timeout: 30 * 60_000 })
  446 |     })
  447 |     await expect(page.getByTestId('train-progress')).toHaveAttribute('data-status', 'done')
  448 |     await expect(page.getByTestId('loss-chart')).toBeVisible()
  449 |     await run.shot('trained')
  450 |     await page.getByTestId('mode-evaluate').click()
  451 |     await page.getByTestId('run-evaluate').click()
  452 |     // The score reads "17/20" (or a percentage).
  453 |     const score = /(\d+)\s*\/\s*(\d+)|(\d+)\s*%/
  454 |     await run.time('evaluate 20 trials (UI)', 180, async () => {
  455 |       await expect(page.getByTestId('trial-cell')).toHaveCount(20, { timeout: 10 * 60_000 })
  456 |       await expect(page.getByTestId('eval-score')).toContainText(score, { timeout: 10 * 60_000 })
  457 |     })
  458 |     await page.waitForTimeout(2000)
  459 |     const m = (await page.getByTestId('eval-score').innerText()).match(score)
  460 |     const pct = m?.[3] ? Number(m[3]) : m ? (100 * Number(m[1])) / Number(m[2]) : 0
  461 |     run.note(`evaluation shows ${(await page.getByTestId('eval-score').innerText()).trim()} (${pct.toFixed(0)}%)`)
  462 |     await run.shot('evaluated')
  463 |     expect(pct, 'policy success rate shown').toBeGreaterThanOrEqual(80)
  464 |     await page.getByTestId('mode-gr00t').click()
  465 |     await page.getByTestId('run-gr00t').click()
  466 |     await run.time('GR00T camera frames appear', 10, async () => {
  467 |       for (const cam of ['exterior', 'wrist']) {
  468 |         await expect
  469 |           .poll(async () => page.getByTestId(`camera-${cam}`).locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth), { timeout: 60_000 })
  470 |           .toBeGreaterThan(0)
  471 |       }
  472 |     })
  473 |     await expect(page.getByTestId('gr00t-latency')).toContainText(/\d+\s*ms/, { timeout: 30_000 })
  474 |     await page.waitForTimeout(5000)
  475 |     run.note(`GR00T latency panel: ${(await page.getByTestId('gr00t-latency').innerText()).replace(/\s+/g, ' ')}`)
  476 |     await run.shot('gr00t-run')
  477 |     await run.finish()
  478 |     expect(run.consoleErrors, `console errors:\n${run.consoleErrors.join('\n')}`).toEqual([])
  479 |   })
  480 | 
  481 |   test('F6 exchange: list, license as buyer, download the pack, earnings show the royalty', async ({ page }, info) => {
  482 |     const run = new Run(page, info)
  483 |     await persona(page, 'u_maria')
  484 |     const skillId = await sharedSkill(page)
  485 |     const expert = (await api<{ expert: { id: string } }>(page, `/api/skills/${skillId}`)).expert.id
  486 |     const before = await api<{ total: number }>(page, '/api/earnings', { user: expert })
  487 |     await page.goto('/')
  488 |     await page.evaluate((e) => localStorage.setItem('tacit.persona', e), expert)
  489 |     await page.goto(`/exchange/sell/${skillId}`)
  490 |     await expect(page.getByTestId('sell-steps')).toBeVisible({ timeout: 20_000 })
  491 |     await run.shot('sell-check')
  492 |     // Walk the wizard: check, consent (the expert confirms), prices, split, market, review.
  493 |     for (const step of ['check', 'consent', 'prices', 'split', 'market']) {
  494 |       await expect(page.getByTestId(`sell-step-${step}`)).toBeVisible({ timeout: 15_000 })
  495 |       if (step === 'consent') {
  496 |         await page.getByTestId('consent-confirm').click()
  497 |         await run.shot('sell-consent')
  498 |       }
  499 |       await expect(page.getByTestId('sell-next')).toBeEnabled({ timeout: 15_000 })
  500 |       await page.getByTestId('sell-next').click()
  501 |     }
  502 |     await expect(page.getByTestId('sell-step-review')).toBeVisible({ timeout: 15_000 })
  503 |     await run.shot('sell-review')
  504 |     await run.time('publish the listing', 3, async () => {
  505 |       await page.getByTestId('sell-publish').click()
  506 |       await expect(page.getByTestId('sell-published')).toBeVisible({ timeout: 20_000 })
  507 |     })
  508 |     await page.getByTestId('open-listing').click()
  509 |     await expect(page).toHaveURL(/\/exchange\/lst_/)
  510 |     const listingId = page.url().split('/exchange/')[1].split(/[?#]/)[0]
  511 |     remember('listings', listingId)
  512 |     run.note(`listing ${listingId}`)
  513 |     // The buyer licenses it.
  514 |     await page.evaluate(() => localStorage.setItem('tacit.persona', 'u_atlas'))
  515 |     await page.reload()
```