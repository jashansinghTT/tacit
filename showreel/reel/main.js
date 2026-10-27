// The reel as a pure function of time. render.mjs calls window.reel.seek(t) for every frame and
// screenshots the stage; nothing here reads the wall clock.
import { buildTimeline } from './timeline.js'

const stage = document.getElementById('stage')
const pending = []

/** Shared helpers handed to every section. */
export const R = {
  W: 1920,
  H: 1080,
  DPR: window.devicePixelRatio || 1,
  stage,
  /** Await an image (or any promise) before the frame is shot. */
  wait(p) { pending.push(p) },
  el(tag, cls, parent, html) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (html !== undefined) e.innerHTML = html
    if (parent) parent.appendChild(e)
    return e
  },
  /** A full-stage canvas at device resolution; draw in CSS pixels. */
  canvas(parent) {
    const c = R.el('canvas', 'fx', parent)
    c.width = R.W * R.DPR
    c.height = R.H * R.DPR
    const g = c.getContext('2d')
    g.setTransform(R.DPR, 0, 0, R.DPR, 0, 0)
    return { c, g, clear() { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.setTransform(R.DPR, 0, 0, R.DPR, 0, 0) } }
  },
  /** An <img> whose source can change per frame; set() waits for the decode. */
  plate(parent, cls = 'plate') {
    const img = R.el('img', cls, parent)
    img.decoding = 'sync'
    let cur = null
    return {
      img,
      set(src) {
        if (src === cur) return
        cur = src
        img.src = src
        R.wait(img.decode().catch(() => console.error('decode failed ' + src)))
      },
    }
  },
  async json(path) { return (await fetch(path)).json() },
  async bin(path) { return (await fetch(path)).arrayBuffer() },
}

let T = null

async function init() {
  await document.fonts.load('600 100px Geist')
  await document.fonts.load('400 100px Geist Mono')
  await document.fonts.load('italic 400 100px "Instrument Serif"')
  T = await buildTimeline(R)
  for (const s of T.sections) {
    s.layer = R.el('div', 'layer', stage)
    s.layer.dataset.section = s.id
    s.layer.style.zIndex = String(s.z ?? 1)
    if (s.load) await s.load(R, T)
    s.build(s.layer, R, T)
  }
  await document.fonts.ready
  window.reel.duration = T.duration
  window.reel.loaded = true
}

window.reel = {
  loaded: false,
  duration: 0,
  async seek(t) {
    for (const s of T.sections) {
      const on = t >= s.start - (s.pre ?? 0) && t < s.end + (s.post ?? 0)
      s.layer.classList.toggle('on', on)
      if (on) s.render(t, s, R, T)
    }
    while (pending.length) await pending.shift()
    // Let layout and paint settle before the screenshot.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  },
  /** Motion-blur sub-frames wanted for the frame at t (1 = none). */
  blurSamples(t) {
    let n = 1
    for (const s of T.sections) {
      for (const [a, b, k] of s.blur ?? []) if (t >= a && t < b) n = Math.max(n, k ?? 6)
    }
    return n
  },
  sections() { return T.sections.map(({ id, start, end }) => ({ id, start, end })) },
}

init().catch((e) => console.error('init failed', e.stack || e))
