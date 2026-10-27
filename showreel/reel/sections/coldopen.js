// 1. Cold open: "Experts retire." over her real hands at the bench, slow motion, graded low.
// Technique: masked word rise; "retire." then comes apart letter by letter, defocusing as it drifts.
import { R } from '../main.js'
import { footage } from '../lib/footage.js'
import { line, rise } from '../lib/type.js'
import { clamp, inCubic, inQuint, inOutSine, mix, outExpo, prog } from '../lib/ease.js'

export const FREEZE = 4.5 // footage time the cold open slows into and section 2 freezes on

export default function coldOpen(T) {
  const s = { id: 'coldopen', z: 1 }
  let foot, words, vignette, glow, typeLine
  s.build = (root) => {
    foot = footage(root, { dir: '/data/plates/vase60', fps: 60, count: 312 })
    vignette = R.el('div', 'abs', root)
    vignette.style.cssText = 'inset:0;background:radial-gradient(120% 90% at 50% 55%, rgba(4,5,6,0) 35%, rgba(4,5,6,0.92) 100%)'
    glow = R.el('div', 'abs', root)
    glow.style.cssText = 'inset:0;background:linear-gradient(180deg, rgba(4,5,6,0.55) 0%, rgba(4,5,6,0) 40%, rgba(4,5,6,0) 70%, rgba(4,5,6,0.6) 100%)'
    const c = R.el('div', 'center', root)
    const l = line(c, ['Experts', { t: 'retire.', letters: true }], { size: 214, style: 'text-shadow:0 0 60px rgba(0,0,0,0.45)' })
    words = l.words
    typeLine = l.el
  }
  s.render = (t) => {
    const b0 = T.bar(0), b1 = T.bar(1), b2 = T.bar(2), b3 = T.bar(3)
    // Footage: 0 → FREEZE s over the whole section, easing into the freeze so section 2 can hold it.
    const u = clamp(t / b3)
    const ft = FREEZE * (1 - Math.pow(1 - u, 1.6)) / 1
    foot.set(ft)
    foot.camera(mix(735, 720, u), mix(555, 575, u), mix(1.95, 2.25, inOutSine(u)))
    const fadeIn = prog(t, 0.38, b0 + 0.3 - 0.38, (x) => x * x)
    foot.grade({ brightness: 0.6 * fadeIn, saturate: 0.6, contrast: 1.18 })

    // The line breathes: a slow push across the whole section.
    typeLine.style.transform = `scale(${mix(1, 1.06, inOutSine(u))})`
    // "Experts" on the first downbeat, "retire." two beats later.
    rise(words[0], prog(t, b0, 0.7, outExpo))
    const tR = T.bar(0, 2)
    rise(words[1], prog(t, tR, 0.7, outExpo))
    // "retire." comes apart from its last letter back, through bar 2 into bar 3.
    const L = words[1].letters
    L.forEach((el, i) => {
      const k = L.length - 1 - i
      const p = prog(t, b2 + 0.15 + k * 0.2, 1.7, inCubic)
      el.style.opacity = String(1 - p)
      el.style.filter = p > 0.001 ? `blur(${p * 16}px)` : 'none'
      el.style.transform = `translate(${p * 46}px, ${-p * 14}px)`
    })
    // "Experts" leaves on the way into bar 3 (ease-in exit).
    const out = prog(t, b3 - 0.38, 0.38, inQuint)
    words[0].mask.style.opacity = String(1 - out)
    words[0].mask.style.filter = out > 0.001 ? `blur(${out * 10}px)` : 'none'
    words[0].inner.style.transform += ` translateY(${-out * 8}%)`
  }
  return s
}
