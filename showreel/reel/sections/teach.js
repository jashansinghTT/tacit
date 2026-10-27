// 6. Teach. The lesson Tacit wrote from the capture, as panes floating in depth: the lesson in
// English, the same lesson in Spanish, and its 3D twin. Ends by pushing into the twin's hand.
// Technique: z-space panes with parallax and depth fade; a zoom-through into the next section.
import { R } from '../main.js'
import { line, rise } from '../lib/type.js'
import { inCubic, inQuint, mix, outExpo, prog } from '../lib/ease.js'

const PANES = [
  { src: '/data/captures/stills/lesson_en.png', x: 380, y: -40, z: -200, ry: -18 },
  { src: '/data/captures/stills/lesson_es.png', x: 760, y: -230, z: -980, ry: -24 },
  { src: '/data/captures/stills/lesson_3d.png', x: 170, y: 170, z: 40, ry: -12 },
]
const SCALE = 0.7
// Where the twin's hand sits in the lesson_3d still (CSS px of the 1920×1080 page).
const TWIN_HAND = [795, 625]

export default function teach(T) {
  const s = { id: 'teach', z: 6 }
  let cam, panes, marker, word, sub, glow
  const b16 = T.bar(16), b17 = T.bar(17), b18 = T.bar(18)
  const PUSH = 0.42
  s.blur = [[b18 - PUSH, b18, 6]]
  s.build = (root) => {
    glow = R.el('div', 'abs', root)
    glow.style.cssText = 'inset:0;background:radial-gradient(60% 60% at 62% 45%, rgba(60,215,255,0.10), rgba(4,5,6,0) 70%)'
    cam = R.el('div', 'abs', root)
    cam.style.cssText = 'inset:0;perspective:1500px;perspective-origin:60% 45%'
    const world = R.el('div', 'abs', cam)
    world.style.cssText = 'inset:0;transform-style:preserve-3d'
    panes = PANES.map((p, i) => {
      const box = R.el('div', 'abs', world)
      box.style.cssText = 'left:0;top:0;width:1920px;height:1080px;transform-origin:50% 50%;border-radius:22px;overflow:hidden;' +
        'box-shadow:0 0 0 2px rgba(255,255,255,0.10),0 60px 140px -40px rgba(0,0,0,0.9),0 0 80px -20px rgba(60,215,255,0.25)'
      const img = R.el('img', 'plate', box)
      img.src = p.src
      img.style.cssText = 'left:0;top:0;width:1920px;height:1080px'
      R.wait(img.decode())
      if (i === 2) {
        marker = R.el('div', 'abs', box)
        marker.style.cssText = `left:${TWIN_HAND[0]}px;top:${TWIN_HAND[1]}px;width:1px;height:1px`
      }
      return box
    })
    const wbox = R.el('div', 'abs', root)
    wbox.style.cssText = 'left:104px;bottom:70px;display:flex;flex-direction:column;gap:6px'
    word = line(wbox, ['Teach.'], { size: 290, style: 'text-shadow:0 10px 60px rgba(0,0,0,0.6)' })
    sub = line(wbox, [{ t: 'in nine languages.', serif: true, grad: true }], { size: 92, style: 'margin-left:10px' })
  }
  s.render = (t) => {
    const beat = T.beat
    const at = [b16, b16 + 2 * beat, b17]
    const dolly = prog(t, b16, b18 - b16, (x) => x)
    panes.forEach((el, i) => {
      const p = PANES[i]
      const k = prog(t, at[i], 0.75, outExpo)
      const x = p.x + (1 - k) * 900
      const z = p.z - (1 - k) * 700 + dolly * 260
      const ry = p.ry + (1 - k) * -30 + dolly * 6
      el.style.opacity = String(Math.min(1, k * 1.4))
      el.style.filter = `brightness(${mix(0.5, 1, Math.min(1, (z + 1000) / 1000))})`
      el.style.transform = `translate3d(${x}px, ${p.y}px, ${z}px) rotateY(${ry}deg) scale(${SCALE})`
      el.style.zIndex = String(Math.round(z + 2000))
    })
    // The push: the whole camera zooms into the twin's hand, ease-in, into the cut.
    const push = prog(t, b18 - PUSH, PUSH, inQuint)
    cam.style.transform = 'none'
    if (push > 0) {
      const r = marker.getBoundingClientRect()
      cam.style.transformOrigin = `${r.left}px ${r.top}px`
      cam.style.transform = `scale(${mix(1, 7, inCubic(push))})`
    }
    rise(word.words[0], prog(t, b16 + 0.05, 0.65, outExpo))
    rise(sub.words[0], prog(t, b17 + 0.05, 0.65, outExpo))
    const out = prog(t, b18 - 0.5, 0.35, inQuint)
    for (const l of [word, sub]) {
      l.el.style.opacity = String(1 - out)
      l.el.style.transform = `translateY(${out * 40}px)`
    }
    glow.style.opacity = String(1 - push)
  }
  return s
}
