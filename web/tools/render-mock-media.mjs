// Renders the mock-mode media into public/mock/: the sample videos (frames of the procedural
// scene via Chromium, encoded with ffmpeg), keyframes, thumbnails and avatars.
//   node tools/render-mock-media.mjs            (all)
//   node tools/render-mock-media.mjs --still 9.5   (one frame to public/mock/still.jpg)
import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public/mock')
const args = process.argv.slice(2)
const stillAt = args.includes('--still') ? Number(args[args.indexOf('--still') + 1]) : null

const server = await createServer({ root, configFile: join(root, 'vite.config.ts'), server: { port: 5799, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://127.0.0.1:5799/tools/mock-render.html')
await page.waitForFunction(() => window.ready === true)

const frame = async (t, fake, q = 0.86) => {
  const url = await page.evaluate(([t, fake, q]) => window.renderFrame(t, fake, q), [t, fake, q])
  return Buffer.from(url.split(',')[1], 'base64')
}

try {
  if (stillAt !== null) {
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'still.jpg'), await frame(stillAt, args.includes('--fake')))
    console.log('wrote', join(out, 'still.jpg'))
  } else {
    for (const d of ['samples', 'skills/sk_sort', 'avatars', 'certs']) mkdirSync(join(out, d), { recursive: true })
    const tmp = join(root, 'node_modules/.tmp/mock-frames')
    for (const [name, fake, dur, fps] of [['sort', false, 38.2, 30], ['fake', true, 12, 24]]) {
      rmSync(tmp, { recursive: true, force: true })
      mkdirSync(tmp, { recursive: true })
      const n = Math.round(dur * fps)
      for (let i = 0; i < n; i++) {
        writeFileSync(join(tmp, `f${String(i).padStart(5, '0')}.jpg`), await frame(i / fps, fake, 0.9))
        if (i % 120 === 0) process.stdout.write(`${name} ${i}/${n}\r`)
      }
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(tmp, 'f%05d.jpg'),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-preset', 'slow', '-movflags', '+faststart',
        join(out, `samples/${name}.mp4`)])
      writeFileSync(join(out, `samples/${name}.jpg`), await frame(fake ? 4 : 9.6, fake, 0.82))
      console.log(`\nencoded ${name}.mp4`)
    }
    const mids = [2.5, 8.6, 15.2, 21.6, 27.8, 34]
    for (let i = 0; i < mids.length; i++) writeFileSync(join(out, `skills/sk_sort/kf_0${i + 1}.jpg`), await frame(mids[i], false, 0.82))
    rmSync(tmp, { recursive: true, force: true })
  }
} finally {
  await browser.close()
  await server.close()
}
