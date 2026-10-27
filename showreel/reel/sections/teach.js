// 6. Teach. The lesson's 3D twin (cropped out of the Lesson page: just the twin, no page chrome or
// names), with the nine languages the lesson can be taught in flashing over it on the half-beat, as
// the Lesson page names them. Ends by pushing into the twin's hand.
// Technique: a beat-cut word flash over a slow push; zoom-through into the next section.
import { R } from '../main.js'
import { line, rise } from '../lib/type.js'
import { inCubic, inOutSine, inQuint, mix, outExpo, prog } from '../lib/ease.js'

// The Lesson page's language selector, in its order (GET /api/learn/lessons/... lists the same nine).
const LANGS = [
  ['English', 'latin'], ['Español', 'latin'], ['Français', 'latin'], ['Deutsch', 'latin'], ['Português', 'latin'],
  ['हिन्दी', 'deva'], ['中文', 'cjk'], ['日本語', 'cjk'], ['한국어', 'cjk'],
]
const FONT = {
  latin: "'Instrument Serif', serif",
  deva: "'Noto Serif Devanagari', serif",
  cjk: "'Noto Serif CJK JP', 'Noto Serif CJK KR', serif",
}
// The twin viewport inside the lesson_3d still (CSS px) and her hand within it.
const VIEW = { cx: 830, cy: 520 } // centre of the crop: the 3D scene only, no page chrome or caption
const HAND = [760, 560]

export default function teach(T) {
  const s = { id: 'teach', z: 6 }
  let cam, plate, marker, word, sub, names, glow
  const b16 = T.bar(16), b18 = T.bar(18)
  const beat = T.beat
  const PUSH = 0.5
  s.blur = [[b18 - PUSH, b18, 6]]
  const k = 2.6 // the crop's scale: 738x415 of the page fills the frame
  s.build = (root) => {
    cam = R.el('div', 'abs', root)
    cam.style.cssText = 'inset:0;overflow:hidden'
    plate = R.el('div', 'abs', cam)
    plate.style.cssText = 'left:0;top:0;width:1920px;height:1080px;transform-origin:0 0'
    const img = R.el('img', 'plate', plate)
    img.src = '/data/captures/stills/lesson_3d_close.png'
    img.style.cssText = 'left:0;top:0;width:1920px;height:1080px'
    R.wait(img.decode())
    marker = R.el('div', 'abs', plate)
    marker.style.cssText = `left:${HAND[0]}px;top:${HAND[1]}px;width:1px;height:1px`
    glow = R.el('div', 'abs', root)
    glow.style.cssText = 'inset:0;background:radial-gradient(60% 45% at 50% 42%, rgba(4,5,6,0.72), rgba(4,5,6,0.55) 60%, rgba(4,5,6,0.88) 100%)'
    names = LANGS.map(([n, script]) => {
      const el = R.el('div', 'abs', root, n)
      el.style.cssText = `left:0;right:0;top:360px;text-align:center;font-family:${FONT[script]};font-style:${script === 'latin' ? 'italic' : 'normal'};` +
        `font-size:${script === 'latin' ? 230 : 190}px;line-height:1;color:#eceef1;white-space:nowrap;letter-spacing:-0.01em;text-shadow:0 0 40px rgba(4,5,6,0.9),0 10px 70px rgba(0,0,0,0.8)`
      return el
    })
    const wbox = R.el('div', 'abs', root)
    wbox.style.cssText = 'left:104px;bottom:70px;display:flex;flex-direction:column;gap:6px'
    word = line(wbox, ['Teach.'], { size: 290, style: 'text-shadow:0 10px 60px rgba(0,0,0,0.6)' })
    sub = line(wbox, [{ t: 'in nine languages.', serif: true, grad: true }], { size: 92, style: 'margin-left:10px' })
  }
  s.render = (t) => {
    // The twin fills the frame and drifts in.
    const drift = prog(t, b16, b18 - b16, inOutSine)
    const sc = k * mix(1.0, 1.08, drift)
    const { cx, cy } = VIEW
    plate.style.transform = `translate(${960 - cx * sc}px, ${540 - cy * sc}px) scale(${sc})`
    plate.style.opacity = String(prog(t, b16, 0.35))
    // Language names, one per half-beat, each a hard cut with a quick settle.
    const t0 = b16 + beat
    names.forEach((el, i) => {
      const a = t0 + i * (beat / 2), b = a + beat / 2
      const on = t >= a && t < b
      el.style.display = on ? 'block' : 'none'
      if (on) {
        const q = prog(t, a, 0.18, outExpo)
        el.style.transform = `scale(${mix(1.08, 1, q)})`
        el.style.opacity = String(mix(0.4, 1, q))
      }
    })
    // The push: zoom into the twin's hand and carry it to the centre, where Do picks it up.
    const push = prog(t, b18 - PUSH, PUSH)
    cam.style.transform = 'none'
    if (push > 0) {
      const r = marker.getBoundingClientRect()
      const e = inCubic(push)
      cam.style.transformOrigin = `${r.left}px ${r.top}px`
      cam.style.transform = `translate(${(960 - r.left) * e}px, ${(540 - r.top) * e}px) scale(${mix(1, 5, e)})`
    }
    glow.style.opacity = String(1 - push)
    rise(word.words[0], prog(t, b16 + 0.05, 0.65, outExpo))
    rise(sub.words[0], prog(t, t0 + 9 * (beat / 2), 0.65, outExpo))
    const out = prog(t, b18 - 0.5, 0.35, inQuint)
    for (const l of [word, sub]) {
      l.el.style.opacity = String(1 - out)
      l.el.style.transform = `translateY(${out * 40}px)`
    }
  }
  return s
}
