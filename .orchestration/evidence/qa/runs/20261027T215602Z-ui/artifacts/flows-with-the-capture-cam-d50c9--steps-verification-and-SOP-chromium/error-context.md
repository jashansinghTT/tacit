# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: flows.spec.ts >> with the capture camera >> F2 sample video is processed into a ready skill with steps, verification and SOP
- Location: e2e/flows.spec.ts:194:3

# Error details

```
Error: apiRequestContext.fetch: read ECONNRESET
Call log:
  - → GET http://127.0.0.1:8710/api/skills/sk_72a50bcd
    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.8078.4 Safari/537.36
    - accept: */*
    - accept-encoding: gzip,deflate,br
    - X-Tacit-User: u_maria

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
    - generic [ref=e47]:
      - generic [ref=e48]: Studio
      - heading "Your skill is ready" [level=1] [ref=e49]
      - paragraph [ref=e50]: Every stage runs on the box. Each one says which model and chip did the work.
    - generic [ref=e51]:
      - generic [ref=e52]:
        - generic [ref=e53]:
          - generic [ref=e54]:
            - generic [ref=e55]: job job_ce6562e2
            - heading "Processing on the box" [level=2] [ref=e56]
          - generic [ref=e57]: Done in 148.3 s
        - generic [ref=e62]:
          - generic [ref=e63]:
            - generic [ref=e64]:
              - generic [ref=e65]: Decode → perceive → events → steps → write → verify → twin → narrate
              - generic [ref=e69]: 100%
            - meter "Job progress" [ref=e71]
          - list [ref=e73]:
            - listitem [ref=e74]:
              - generic [ref=e80]:
                - generic [ref=e81]:
                  - generic [ref=e82]: Decode
                  - generic [ref=e83]: 6.98 s
                - generic [ref=e84]: 1280x720, 44.5 s
            - listitem [ref=e86]:
              - generic [ref=e92]:
                - generic [ref=e93]:
                  - generic [ref=e94]: Perceive
                  - generic [ref=e95]: 65.2 s
                - generic [ref=e96]:
                  - generic [ref=e97]:
                    - generic [ref=e98]: MediaPipe
                    - generic [ref=e99]: CPU
                  - generic [ref=e103]:
                    - generic [ref=e104]: HaMeR
                    - generic [ref=e105]: chip 0
                  - generic [ref=e107]:
                    - generic [ref=e108]: Gaze-LLE
                    - generic [ref=e109]: chip 0
                  - generic [ref=e111]:
                    - generic [ref=e112]: RF-DETR
                    - generic [ref=e113]: chip 0
                  - generic [ref=e115]: 445 frames
            - listitem [ref=e116]:
              - generic [ref=e122]:
                - generic [ref=e123]:
                  - generic [ref=e124]: Steps
                  - generic [ref=e125]: 36.0 ms
                - generic [ref=e126]: "5 steps; objects: vase"
            - listitem [ref=e128]:
              - generic [ref=e134]:
                - generic [ref=e135]:
                  - generic [ref=e136]: Write
                  - generic [ref=e137]: 10.2 s
                - generic [ref=e138]:
                  - generic [ref=e139]:
                    - generic [ref=e140]: gpt-oss-20b
                    - generic [ref=e141]: chip 2
                  - generic [ref=e143]: "\"QA Arranging dried stems in a vase\""
            - listitem [ref=e144]:
              - generic [ref=e150]:
                - generic [ref=e151]:
                  - generic [ref=e152]: Verify
                  - generic [ref=e153]: 4.13 s
                - generic [ref=e154]:
                  - generic [ref=e155]:
                    - generic [ref=e156]: VGGT-1B
                    - generic [ref=e157]: chip 0
                  - generic [ref=e159]: "score 0.90: verified"
            - listitem [ref=e160]:
              - generic [ref=e166]:
                - generic [ref=e167]:
                  - generic [ref=e168]: Twin
                  - generic [ref=e169]: 144 ms
                - generic [ref=e170]: 445 frames, 60000 points
            - listitem [ref=e172]:
              - generic [ref=e178]:
                - generic [ref=e179]:
                  - generic [ref=e180]: Narrate
                  - generic [ref=e181]: 61.6 s
                - generic [ref=e182]:
                  - generic [ref=e183]:
                    - generic [ref=e184]: S2 Pro
                    - generic [ref=e185]: chip 1
                  - generic [ref=e187]: 3 of 6 lines now, the rest in the background
            - listitem [ref=e188]:
              - generic [ref=e192]:
                - generic [ref=e193]:
                  - generic [ref=e194]: Ready
                  - generic [ref=e195]: 6.0 ms
                - generic [ref=e196]: 5 steps, verification verified
      - generic [ref=e198]:
        - generic [ref=e199]:
          - heading "What you captured" [level=2] [ref=e202]
          - generic [ref=e204]:
            - generic [ref=e205]:
              - term [ref=e206]: Steps closed
              - definition [ref=e207]: –
            - generic [ref=e208]:
              - term [ref=e209]: Answers
              - definition [ref=e210]: –
            - generic [ref=e211]:
              - term [ref=e212]: Length
              - definition [ref=e213]: –
        - generic [ref=e216]:
          - link "Open the skill" [ref=e217] [cursor=pointer]:
            - /url: /skills/sk_72a50bcd
          - button "Capture another" [ref=e220] [cursor=pointer]
  - status:
    - generic [ref=e224]:
      - generic [ref=e228]:
        - generic [ref=e229]: Skill ready
        - generic [ref=e230]: Open it to see the steps, twin, SOP and verification.
      - button "Dismiss" [ref=e231] [cursor=pointer]
```

# Test source

```ts
  5   |  * and runs scripts/e2e/playwright.config.ts). Each test attaches its timings; report.py puts them in RESULTS.md.
  6   |  */
  7   | import { test, expect, type Page, type TestInfo, type ConsoleMessage, type Response } from '@playwright/test'
  8   | import { execFileSync } from 'node:child_process'
  9   | import fs from 'node:fs'
  10  | import path from 'node:path'
  11  | 
  12  | const MEDIA = process.env.QA_E2E_MEDIA ?? path.join(process.env.HOME ?? '', 'tacit/data/e2e')
  13  | const RUN_DIR = process.env.QA_UI_RUN_DIR ?? path.join(process.cwd(), 'qa-run')
  14  | const fakeArgs = (video: string, audio: string) => [
  15  |   '--use-fake-device-for-media-stream',
  16  |   '--use-fake-ui-for-media-stream',
  17  |   `--use-file-for-fake-video-capture=${path.join(MEDIA, video)}`,
  18  |   `--use-file-for-fake-audio-capture=${path.join(MEDIA, audio)}`,
  19  |   '--autoplay-policy=no-user-gesture-required',
  20  | ]
  21  | 
  22  | // ------------------------------------------------------------------------------------ helpers
  23  | type Timing = { step: string; s: number; limit_s: number | null; slow: boolean }
  24  | 
  25  | class Run {
  26  |   timings: Timing[] = []
  27  |   consoleErrors: string[] = []
  28  |   apiFailures: string[] = []
  29  |   constructor(
  30  |     readonly page: Page,
  31  |     readonly info: TestInfo,
  32  |   ) {
  33  |     page.on('console', (m: ConsoleMessage) => {
  34  |       if (m.type() === 'error') this.consoleErrors.push(`${m.text()} @ ${m.location().url}`)
  35  |     })
  36  |     page.on('pageerror', (e) => this.consoleErrors.push(`pageerror: ${e.message}`))
  37  |     page.on('response', (r: Response) => {
  38  |       const u = new URL(r.url())
  39  |       if ((u.pathname.startsWith('/api/') || u.pathname.startsWith('/media/')) && r.status() >= 400) this.apiFailures.push(`${r.status()} ${r.request().method()} ${u.pathname}`)
  40  |     })
  41  |   }
  42  |   async time<T>(step: string, limit_s: number | null, fn: () => Promise<T>): Promise<T> {
  43  |     const t0 = Date.now()
  44  |     try {
  45  |       return await fn()
  46  |     } finally {
  47  |       const s = (Date.now() - t0) / 1000
  48  |       this.timings.push({ step, s: Math.round(s * 1000) / 1000, limit_s, slow: limit_s != null && s > limit_s })
  49  |     }
  50  |   }
  51  |   note(text: string) {
  52  |     this.info.annotations.push({ type: 'note', description: text })
  53  |     void this.info.attach('note', { body: text, contentType: 'text/plain' })
  54  |   }
  55  |   async shot(name: string) {
  56  |     const dir = path.join(RUN_DIR, 'screens', this.info.title.split(' ')[0])
  57  |     fs.mkdirSync(dir, { recursive: true })
  58  |     await this.page.screenshot({ path: path.join(dir, `${name}.png`) })
  59  |   }
  60  |   async finish() {
  61  |     await this.info.attach('timings', { body: JSON.stringify(this.timings), contentType: 'application/json' })
  62  |     if (this.apiFailures.length) this.note(`API errors seen by the page: ${[...new Set(this.apiFailures)].join(', ')}`)
  63  |   }
  64  | }
  65  | 
  66  | async function persona(page: Page, id: 'u_maria' | 'u_sam' | 'u_priya' | 'u_atlas') {
  67  |   // Once per tab: later switches (localStorage + reload) must stick.
  68  |   await page.addInitScript((p) => {
  69  |     try {
  70  |       if (sessionStorage.getItem('qa.persona')) return
  71  |       sessionStorage.setItem('qa.persona', p)
  72  |       localStorage.setItem('tacit.persona', p)
  73  |       localStorage.setItem('tacit.tour.seen', '1')
  74  |     } catch {
  75  |       /* ignore */
  76  |     }
  77  |   }, id)
  78  | }
  79  | 
  80  | /** Records every media element that plays (narration uses `new Audio()`, outside the DOM). */
  81  | async function trackMedia(page: Page) {
  82  |   await page.addInitScript(() => {
  83  |     const w = window as unknown as { __qaMedia: HTMLMediaElement[] }
  84  |     w.__qaMedia = []
  85  |     const play = HTMLMediaElement.prototype.play
  86  |     HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
  87  |       if (!w.__qaMedia.includes(this)) w.__qaMedia.push(this)
  88  |       return play.call(this)
  89  |     }
  90  |   })
  91  | }
  92  | 
  93  | /** Seconds of audio actually played from `/media/` sources whose URL matches `re`. */
  94  | async function playedAudio(page: Page, re = '/media/'): Promise<number> {
  95  |   return page.evaluate((r) => {
  96  |     const w = window as unknown as { __qaMedia?: HTMLMediaElement[] }
  97  |     return (w.__qaMedia ?? []).filter((m) => (m.currentSrc || m.src).includes(r)).reduce((a, m) => a + (m.currentTime || 0), 0)
  98  |   }, re)
  99  | }
  100 | 
  101 | const words = (s: string) => new Set(s.toLowerCase().split(/\s+/).map((w) => w.replace(/[.,!?;:'"]/g, '')).filter((w) => w.length > 2))
  102 | const overlap = (a: string, b: string) => [...words(a)].filter((w) => words(b).has(w)).length / Math.max(1, words(b).size)
  103 | 
  104 | async function api<T>(page: Page, url: string, init?: { method?: string; data?: unknown; user?: string }): Promise<T> {
> 105 |   const r = await page.request.fetch(url, { method: init?.method ?? 'GET', data: init?.data, headers: { 'X-Tacit-User': init?.user ?? 'u_maria' } })
      |                                ^ Error: apiRequestContext.fetch: read ECONNRESET
  106 |   expect(r.ok(), `${init?.method ?? 'GET'} ${url} -> ${r.status()}`).toBeTruthy()
  107 |   return (await r.json()) as T
  108 | }
  109 | 
  110 | /** What this run made; scripts/e2e/teardown.py removes it after the run. */
  111 | function remember(kind: 'skills' | 'listings', id: string) {
  112 |   fs.mkdirSync(RUN_DIR, { recursive: true })
  113 |   const file = path.join(RUN_DIR, 'created.json')
  114 |   const made = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { skills: [], listings: [] }
  115 |   if (!made[kind].includes(id)) made[kind].push(id)
  116 |   fs.writeFileSync(file, JSON.stringify(made, null, 2))
  117 | }
  118 | 
  119 | async function qaTitle(page: Page, skillId: string) {
  120 |   remember('skills', skillId)
  121 |   const sk = await api<{ title: string }>(page, `/api/skills/${skillId}`)
  122 |   if (!sk.title.startsWith('QA ')) await api(page, `/api/skills/${skillId}`, { method: 'PATCH', data: { title: `QA ${sk.title}` } })
  123 | }
  124 | 
  125 | /** The skill the later flows share: the newest ready QA skill made from a sample (F2 makes one). */
  126 | async function sharedSkill(page: Page): Promise<string> {
  127 |   const fromEnv = process.env.QA_SKILL_ID
  128 |   if (fromEnv) return fromEnv
  129 |   const file = path.join(RUN_DIR, 'shared-skill.txt')
  130 |   if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim()
  131 |   const list = await api<{ id: string; title: string; status: string; source_kind: string }[]>(page, '/api/skills?status=ready&include_test=1')
  132 |   const qa = list.find((s) => s.title.startsWith('QA ') && s.source_kind !== 'live')
  133 |   expect(qa, 'no ready QA skill: run F2 first').toBeTruthy()
  134 |   return qa!.id
  135 | }
  136 | 
  137 | function zipNames(file: string): string[] {
  138 |   const out = execFileSync('python3', ['-c', 'import sys, zipfile; print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))', file])
  139 |   return out.toString().trim().split('\n')
  140 | }
  141 | 
  142 | // Not serial mode: a failing flow must not skip the others. workers=1 keeps them in file order.
  143 | 
  144 | // ------------------------------------------------------------------------------------ F1
  145 | // The config's browser has the capture camera (capture.y4m) and the spoken answer (answer.wav).
  146 | test.describe('with the capture camera', () => {
  147 |   test('F1 landing and navigation render with no console errors', async ({ page }, info) => {
  148 |     const run = new Run(page, info)
  149 |     await persona(page, 'u_maria')
  150 |     await run.time('landing page', 3, async () => {
  151 |       await page.goto('/')
  152 |       await expect(page.getByTestId('landing-hero')).toBeVisible()
  153 |     })
  154 |     await page.waitForLoadState('networkidle').catch(() => {})
  155 |     await run.shot('landing')
  156 |     for (const sec of ['landing-flow', 'landing-box', 'landing-moat', 'landing-exchange']) {
  157 |       await expect(page.getByTestId(sec), `landing section ${sec}`).toBeAttached()
  158 |     }
  159 |     const pages: [string, string][] = [
  160 |       ['studio', '/studio'],
  161 |       ['skills', '/skills'],
  162 |       ['learn', '/learn'],
  163 |       ['robot', '/robot'],
  164 |       ['exchange', '/exchange'],
  165 |       ['team', '/team'],
  166 |       ['box', '/box'],
  167 |     ]
  168 |     let lastHeading = ''
  169 |     for (const [key, url] of pages) {
  170 |       await run.time(`navigate to ${url}`, 2, async () => {
  171 |         await page.getByTestId(`nav-${key}`).first().click()
  172 |         await expect(page).toHaveURL(new RegExp(`${url}(\\?|$)`))
  173 |         // The new page's own heading, not the old page fading out.
  174 |         await expect(page.locator('h1')).toHaveCount(1)
  175 |         await expect(page.locator('h1')).not.toHaveText(lastHeading === '' ? /^$/ : lastHeading)
  176 |         await expect(page.locator('h1')).toBeVisible()
  177 |       })
  178 |       lastHeading = (await page.locator('h1').innerText()).trim()
  179 |       await page.waitForLoadState('networkidle').catch(() => {})
  180 |       await page.waitForTimeout(800)
  181 |       const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  182 |       expect(wide, `${url} scrolls horizontally by ${wide}px`).toBeLessThanOrEqual(1)
  183 |       await run.shot(key)
  184 |     }
  185 |     await page.setViewportSize({ width: 1280, height: 800 })
  186 |     await page.goto('/')
  187 |     const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  188 |     expect(wide, `landing scrolls horizontally at 1280 px by ${wide}px`).toBeLessThanOrEqual(1)
  189 |     await run.finish()
  190 |     expect(run.consoleErrors, `console errors:\n${run.consoleErrors.join('\n')}`).toEqual([])
  191 |   })
  192 | 
  193 |   // ---------------------------------------------------------------------------------- F2
  194 |   test('F2 sample video is processed into a ready skill with steps, verification and SOP', async ({ page }, info) => {
  195 |     test.setTimeout(40 * 60_000)
  196 |     const run = new Run(page, info)
  197 |     await persona(page, 'u_maria')
  198 |     const samples = await api<{ id: string; kind: string; title: string }[]>(page, '/api/samples')
  199 |     const sample = samples.find((s) => s.id === process.env.QA_SAMPLE) ?? samples.find((s) => s.kind === 'real')
  200 |     expect(sample, 'no real sample in /api/samples').toBeTruthy()
  201 |     await page.goto('/studio?source=sample')
  202 |     await page.getByTestId(`sample-${sample!.id}`).click()
  203 |     await run.shot('sample-picked')
  204 |     const t0 = Date.now()
  205 |     // Tag the new skill as a QA test skill the moment it exists, so a failed run never leaves it in the demo.
```