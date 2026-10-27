import { chromium } from '@playwright/test'
const S = process.argv[2], base = process.argv[3] ?? 'http://127.0.0.1:5712'
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${process.cwd()}/e2e/.media/capture.mjpeg`, `--use-file-for-fake-audio-capture=${process.cwd()}/e2e/.media/answer.wav`, '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(base + '/studio', { waitUntil: 'networkidle' })
await page.getByTestId('capture-start').click()
await page.waitForTimeout(Number(process.env.LIVE_MS ?? 13000))
await page.screenshot({ path: `${S}/studio-live.png` })
await page.getByTestId('capture-stop').click()
await page.waitForTimeout(4000)
await page.screenshot({ path: `${S}/studio-processing.png` })
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
await browser.close()
