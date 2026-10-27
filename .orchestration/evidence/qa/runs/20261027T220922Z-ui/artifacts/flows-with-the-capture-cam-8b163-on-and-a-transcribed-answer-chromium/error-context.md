# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: flows.spec.ts >> with the capture camera >> F3 live capture with the fake camera gets a spoken coach question and a transcribed answer
- Location: e2e/flows.spec.ts:253:3

# Error details

```
Error: transcript "M
them before I place them in the tray.
28.9 s
Whisper 13313 ms" vs "Because the parts on the left are already sorted, so I check them before I place them in the tray."

expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 0.5
Received:    0.4166666666666667
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - link "Skip to content" [ref=e4] [cursor=pointer]:
    - /url: "#main"
  - banner [ref=e5]:
    - generic [ref=e6]:
      - link "Tacit home" [ref=e7] [cursor=pointer]:
        - /url: /
        - generic [ref=e8]: tacit
      - navigation "Main" [ref=e18]:
        - link "Studio" [ref=e19] [cursor=pointer]:
          - /url: /studio
        - link "Skills" [ref=e21] [cursor=pointer]:
          - /url: /skills
        - link "Learn" [ref=e22] [cursor=pointer]:
          - /url: /learn
        - link "Robot Lab" [ref=e23] [cursor=pointer]:
          - /url: /robot
        - link "Exchange" [ref=e24] [cursor=pointer]:
          - /url: /exchange
        - link "Team" [ref=e25] [cursor=pointer]:
          - /url: /team
        - link "Box" [ref=e26] [cursor=pointer]:
          - /url: /box
      - generic [ref=e27]:
        - link "9/9 models · 4 chips" [ref=e28] [cursor=pointer]:
          - /url: /box
        - button "Show me" [ref=e33] [cursor=pointer]
        - button "Maria Chen Expert" [ref=e37] [cursor=pointer]:
          - generic [ref=e39]:
            - generic [ref=e40]: Maria Chen
            - generic [ref=e41]: Expert
  - main [ref=e45]:
    - generic [ref=e46]:
      - generic [ref=e47]:
        - generic [ref=e48]: Studio · Watch
        - heading "Capture a skill" [level=1] [ref=e49]
        - paragraph [ref=e50]: Work as you always do. Tacit tracks your hands in 3D, where you look and which parts you touch, and asks you why at each step.
        - generic [ref=e51]: Recording · 00:29.3
      - button "Stop and process" [ref=e55] [cursor=pointer]
    - generic [ref=e58]:
      - generic [ref=e61]:
        - generic [ref=e62]:
          - generic "Live camera" [ref=e63]
          - generic:
            - generic: REC
            - generic: 00:29.3
          - generic:
            - text: look
            - generic: · right hand
          - generic: Coach:Why did you look at your right hand before picking up the vase?
        - generic [ref=e64]:
          - group "Overlay layers" [ref=e65]:
            - button "Hands" [pressed] [ref=e66] [cursor=pointer]
            - button "Gaze" [pressed] [ref=e72] [cursor=pointer]
            - button "Parts" [pressed] [ref=e76] [cursor=pointer]
            - button "Body" [pressed] [ref=e81] [cursor=pointer]
          - generic [ref=e85]: /home/jashan/tacit/data/e2e/capture.y4m
        - generic [ref=e89]:
          - generic [ref=e90]:
            - generic [ref=e91]: Steps
            - generic [ref=e92]: 1 closed
          - generic "1. Push the item held in the right hand into the vase on your right" [ref=e95]:
            - generic [ref=e97]:
              - generic [ref=e98]: "01"
              - generic [ref=e99]: Push the item held in the right hand into the vase on your right
      - generic [ref=e100]:
        - generic [ref=e101]:
          - generic [ref=e103]:
            - generic [ref=e104]: per frame, live
            - heading "Latency" [level=2] [ref=e105]
          - generic [ref=e110]:
            - list [ref=e111]:
              - listitem [ref=e112]:
                - generic [ref=e113]:
                  - generic [ref=e114]:
                    - generic [ref=e115]: MediaPipe · hands, pose, face
                    - generic [ref=e116]: CPU
                  - generic [ref=e120]: 11.7 ms
              - listitem [ref=e123]:
                - generic [ref=e124]:
                  - generic [ref=e125]:
                    - generic [ref=e126]: HaMeR · 3D hands · 2 hands
                    - generic [ref=e127]: chip 0
                  - generic [ref=e129]: 85.2 ms
              - listitem [ref=e132]:
                - generic [ref=e133]:
                  - generic [ref=e134]:
                    - generic [ref=e135]: Gaze-LLE · gaze target
                    - generic [ref=e136]: chip 0
                  - generic [ref=e138]: 33.6 ms
              - listitem [ref=e141]:
                - generic [ref=e142]:
                  - generic [ref=e143]:
                    - generic [ref=e144]: RF-DETR · parts
                    - generic [ref=e145]: chip 0
                  - generic [ref=e147]: 20.4 ms
            - generic [ref=e150]:
              - generic [ref=e151]:
                - generic [ref=e152]: "65"
                - generic [ref=e153]: total · ms
              - generic [ref=e154]:
                - generic [ref=e155]: "10.5"
                - generic [ref=e156]: analysed · fps
              - generic [ref=e157]:
                - generic [ref=e158]: "123"
                - generic [ref=e159]: round trip · ms
              - generic [ref=e160]:
                - generic [ref=e161]: "89"
                - generic [ref=e162]: skipped · frames
        - generic [ref=e163]:
          - generic [ref=e164]:
            - generic [ref=e165]:
              - generic [ref=e166]: asks why at each step
              - heading "Coach" [level=2] [ref=e167]
            - generic [ref=e169]:
              - generic [ref=e170]: chip 2
              - generic [ref=e172]: chip 1
          - generic [ref=e174]:
            - generic [ref=e175]:
              - generic [ref=e181]:
                - text: Why did you choose your right hand to pick up the vase?
                - generic [ref=e182]:
                  - generic [ref=e183]: 11.2 s
                  - button "replay" [ref=e184] [cursor=pointer]
              - generic [ref=e189]:
                - generic [ref=e190]: M
                - generic [ref=e191]:
                  - text: them before I place them in the tray.
                  - generic [ref=e192]:
                    - generic [ref=e193]: 28.9 s
                    - generic [ref=e194]: Whisper 13313 ms
              - generic [ref=e200]:
                - text: Why did you look at your right hand before picking up the vase?
                - generic [ref=e201]:
                  - generic [ref=e202]: 27.6 s
                  - button "replay" [ref=e203] [cursor=pointer]
            - generic [ref=e208]:
              - status [ref=e209]:
                - paragraph [ref=e214]:
                  - generic [ref=e215]: "Coach:"
                  - text: Why did you look at your right hand before picking up the vase?
              - generic [ref=e216]:
                - button "Stop" [pressed] [ref=e218] [cursor=pointer]
                - generic [ref=e242]:
                  - switch "Hands-free answers" [checked] [ref=e243] [cursor=pointer]
                  - text: Hands-free
              - paragraph [ref=e245]: Hands-free listens after each question and stops when you go quiet. Questions by gpt-oss-20b (chip 2), voice by S2 Pro and transcripts by Whisper (chip 1).
              - generic [ref=e246]:
                - textbox "Type an answer" [ref=e247]:
                  - /placeholder: Or type an answer
                - button "Send answer" [disabled] [ref=e248]
        - generic [ref=e252]:
          - generic [ref=e254]:
            - generic [ref=e255]: grasps, releases and gaze shifts
            - heading "Events" [level=2] [ref=e256]
          - list [ref=e258]:
            - listitem [ref=e259]:
              - generic [ref=e260]: lookright hand
              - generic [ref=e261]: 28.4 s
            - listitem [ref=e262]:
              - generic [ref=e263]: releaseright hand · vase on your right
              - generic [ref=e264]: 28.4 s
            - listitem [ref=e265]:
              - generic [ref=e266]: lookleft hand
              - generic [ref=e267]: 27.8 s
            - listitem [ref=e268]:
              - generic [ref=e269]: lookright hand
              - generic [ref=e270]: 27.2 s
            - listitem [ref=e271]:
              - generic [ref=e272]: lookleft hand
              - generic [ref=e273]: 26.7 s
            - listitem [ref=e274]:
              - generic [ref=e275]: lookvase
              - generic [ref=e276]: 26.2 s
            - listitem [ref=e277]:
              - generic [ref=e278]: lookworkbench
              - generic [ref=e279]: 25.6 s
            - listitem [ref=e280]:
              - generic [ref=e281]: lookvase
              - generic [ref=e282]: 25.0 s
            - listitem [ref=e283]:
              - generic [ref=e284]: lookright hand
              - generic [ref=e285]: 24.0 s
            - listitem [ref=e286]:
              - generic [ref=e287]: lookvase
              - generic [ref=e288]: 23.4 s
            - listitem [ref=e289]:
              - generic [ref=e290]: graspright hand · vase on your right
              - generic [ref=e291]: 22.1 s
            - listitem [ref=e292]:
              - generic [ref=e293]: lookright hand
              - generic [ref=e294]: 21.2 s
            - listitem [ref=e295]:
              - generic [ref=e296]: releaseright hand · vase on your right
              - generic [ref=e297]: 21.2 s
            - listitem [ref=e298]:
              - generic [ref=e299]: lookworkbench
              - generic [ref=e300]: 18.1 s
            - listitem [ref=e301]:
              - generic [ref=e302]: lookvase
              - generic [ref=e303]: 17.2 s
            - listitem [ref=e304]:
              - generic [ref=e305]: graspright hand · vase on your right
              - generic [ref=e306]: 16.0 s
            - listitem [ref=e307]:
              - generic [ref=e308]: lookright hand
              - generic [ref=e309]: 15.2 s
            - listitem [ref=e310]:
              - generic [ref=e311]: lookworkbench
              - generic [ref=e312]: 14.5 s
            - listitem [ref=e313]:
              - generic [ref=e314]: lookright hand
              - generic [ref=e315]: 13.1 s
            - listitem [ref=e316]:
              - generic [ref=e317]: lookworkbench
              - generic [ref=e318]: 12.6 s
            - listitem [ref=e319]:
              - generic [ref=e320]: releaseright hand · vase on your right
              - generic [ref=e321]: 12.4 s
            - listitem [ref=e322]:
              - generic [ref=e323]: lookright hand
              - generic [ref=e324]: 10.9 s
            - listitem [ref=e325]:
              - generic [ref=e326]: lookworkbench
              - generic [ref=e327]: 10.2 s
            - listitem [ref=e328]:
              - generic [ref=e329]: lookright hand
              - generic [ref=e330]: 9.7 s
            - listitem [ref=e331]:
              - generic [ref=e332]: lookvase
              - generic [ref=e333]: 8.9 s
            - listitem [ref=e334]:
              - generic [ref=e335]: graspright hand · vase on your right
              - generic [ref=e336]: 6.7 s
            - listitem [ref=e337]:
              - generic [ref=e338]: lookright hand
              - generic [ref=e339]: 6.4 s
            - listitem [ref=e340]:
              - generic [ref=e341]: lookvase
              - generic [ref=e342]: 5.9 s
            - listitem [ref=e343]:
              - generic [ref=e344]: lookworkbench
              - generic [ref=e345]: 5.0 s
            - listitem [ref=e346]:
              - generic [ref=e347]: lookright hand
              - generic [ref=e348]: 1.2 s
  - status
```

# Test source

```ts
  208 |     await page.getByTestId(`sample-${sample!.id}`).click()
  209 |     await run.shot('sample-picked')
  210 |     const t0 = Date.now()
  211 |     // Tag the new skill as a QA test skill the moment it exists, so a failed run never leaves it in the demo.
  212 |     const created = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/skills' && r.request().method() === 'POST')
  213 |     await page.getByTestId('sample-offline').click()
  214 |     const skillId = ((await (await created).json()) as { skill_id: string }).skill_id
  215 |     await qaTitle(page, skillId)
  216 |     fs.mkdirSync(RUN_DIR, { recursive: true })
  217 |     fs.writeFileSync(path.join(RUN_DIR, 'shared-skill.txt'), skillId)
  218 |     await expect(page.getByTestId('processing-panel')).toBeVisible({ timeout: 20_000 })
  219 |     await run.shot('processing')
  220 |     await run.time('process the sample (UI)', 300, async () => {
  221 |       await expect
  222 |         .poll(async () => (await api<{ status: string }>(page, `/api/skills/${skillId}`)).status, { timeout: 30 * 60_000, intervals: [3000] })
  223 |         .toMatch(/^(ready|failed)$/)
  224 |     })
  225 |     run.note(`processing took ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  226 |     expect((await api<{ status: string }>(page, `/api/skills/${skillId}`)).status).toBe('ready')
  227 |     // The page must follow the job to the end (also across a backend restart, which re-runs it under a new id).
  228 |     const open = page.getByTestId('open-skill')
  229 |     await expect(open, 'the Studio does not show the finished job').toHaveText(/^Open the skill$/, { timeout: 60_000 })
  230 |     await run.shot('processed')
  231 |     await open.click()
  232 |     await expect(page).toHaveURL(new RegExp(`/skills/${skillId}`))
  233 |     await page.reload()
  234 |     const steps = page.getByTestId('steps-list').locator('[data-testid^="step-"]')
  235 |     await expect(steps.first()).toBeVisible()
  236 |     expect(await steps.count(), 'steps shown').toBeGreaterThanOrEqual(3)
  237 |     await run.shot('skill-overview')
  238 |     const sk = await api<{ verification: { status: string; score: number }; steps: unknown[]; sop_markdown: string }>(page, `/api/skills/${skillId}`)
  239 |     run.note(`skill ${skillId}: ${sk.steps.length} steps, verification ${sk.verification.status} ${sk.verification.score}`)
  240 |     await expect(page.getByText(/verified/i).first()).toBeVisible()
  241 |     await page.getByTestId('tab-sop').click()
  242 |     await expect(page.getByTestId('sop-panel')).toBeVisible()
  243 |     await expect(page.getByTestId('sop-panel')).toContainText(sk.sop_markdown.split('\n').find((l) => l.startsWith('#'))!.replace(/^#+\s*/, '').slice(0, 20))
  244 |     await run.shot('skill-sop')
  245 |     await page.getByTestId('tab-verify').click()
  246 |     await expect(page.getByTestId('verify-summary')).toBeVisible()
  247 |     await run.shot('skill-verify')
  248 |     await run.finish()
  249 |     expect(run.consoleErrors, `console errors:\n${run.consoleErrors.join('\n')}`).toEqual([])
  250 |   })
  251 | 
  252 |   // ---------------------------------------------------------------------------------- F3
  253 |   test('F3 live capture with the fake camera gets a spoken coach question and a transcribed answer', async ({ page }, info) => {
  254 |     test.setTimeout(30 * 60_000)
  255 |     const run = new Run(page, info)
  256 |     await persona(page, 'u_maria')
  257 |     const answerText = fs.readFileSync(path.join(MEDIA, 'answer.txt'), 'utf8').trim()
  258 |     await page.goto('/studio?source=webcam')
  259 |     await page.getByTestId('camera-preview').click()
  260 |     await run.time('camera preview', 5, async () => {
  261 |       await expect.poll(async () => page.locator('video').first().evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 10_000 }).toBeGreaterThan(0)
  262 |     })
  263 |     const created = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/skills' && r.request().method() === 'POST')
  264 |     await page.getByTestId('capture-start').click()
  265 |     const skillId = ((await (await created).json()) as { skill_id: string }).skill_id
  266 |     await qaTitle(page, skillId)
  267 |     await expect(page.getByTestId('overlay-canvas')).toBeVisible({ timeout: 15_000 })
  268 |     await expect(page.getByTestId('latency-hud')).toBeVisible()
  269 |     await page.waitForTimeout(3000)
  270 |     await run.shot('live-analysis')
  271 |     // Timeline for the record: questions, voices still coming, answers, and whether the mic is recording.
  272 |     const timeline: string[] = []
  273 |     const t0 = Date.now()
  274 |     const probe = setInterval(() => {
  275 |       void page
  276 |         .evaluate(() => ({
  277 |           q: document.querySelectorAll('[data-testid="coach-question"]').length,
  278 |           coming: [...document.querySelectorAll('[data-testid="coach-question"]')].filter((e) => /voice coming/.test(e.textContent ?? '')).length,
  279 |           a: document.querySelectorAll('[data-testid="expert-answer"]').length,
  280 |           rec: document.querySelector('[data-testid="talk-button"]')?.getAttribute('aria-pressed') === 'true',
  281 |         }))
  282 |         .then((x) => {
  283 |           const line = `q=${x.q} voice_coming=${x.coming} answers=${x.a} mic=${x.rec ? 'REC' : '-'}`
  284 |           if (timeline.at(-1)?.split(' ').slice(1).join(' ') !== line) timeline.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${line}`)
  285 |         })
  286 |         .catch(() => {})
  287 |     }, 500)
  288 |     const question = page.getByTestId('coach-question').first()
  289 |     await run.time('first coach question (from start)', 60, async () => {
  290 |       await expect(question).toBeVisible({ timeout: 120_000 })
  291 |     })
  292 |     run.note(`coach asked: ${await question.innerText()}`)
  293 |     await run.shot('coach-question')
  294 |     const answer = page.getByTestId('expert-answer').first()
  295 |     try {
  296 |       await run.time('mic picks up the spoken answer (from question)', 30, async () => {
  297 |         await expect(answer).toBeVisible({ timeout: 90_000 })
  298 |       })
  299 |       await run.time('answer transcribed (from end of speech)', 5, async () => {
  300 |         await expect(answer).not.toContainText(/Transcribing/i, { timeout: 90_000 })
  301 |       })
  302 |     } finally {
  303 |       clearInterval(probe)
  304 |       run.note(`capture timeline:\n${timeline.join('\n')}`)
  305 |     }
  306 |     const heard = await answer.innerText()
  307 |     run.note(`transcript: ${heard}`)
> 308 |     expect(overlap(heard, answerText), `transcript "${heard}" vs "${answerText}"`).toBeGreaterThanOrEqual(0.5)
      |                                                                                    ^ Error: transcript "M
  309 |     await run.shot('answer')
  310 |     await page.getByTestId('capture-stop').click()
  311 |     await expect(page.getByTestId('processing-panel')).toBeVisible({ timeout: 20_000 })
  312 |     const open = page.getByTestId('open-skill')
  313 |     await expect(open).toBeVisible({ timeout: 60_000 })
  314 |     await run.time('process the capture (UI)', 180, async () => {
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
```