// 10. Tagline on the final lift, over the landing page's 3D hero: the Franka mirroring an expert's
// ghost hands. Words land one per beat; focus racks from the type to the scene.
// Technique: rack focus (scene blurred behind sharp type, then pulled into focus) and a slow push.
import { R } from '../main.js'
import { sequence } from '../lib/seq.js'
import { line, rise } from '../lib/type.js'
import { inOutCubic, inOutSine, mix, outExpo, prog } from '../lib/ease.js'

export const HERO_FRAMES = 220

export default function tagline(T) {
  const s = { id: 'tagline', z: 10, post: 1.2 }
  let hero, plate, l1, l2, shade
  const b25 = T.bar(25), b26 = T.bar(26), b28 = T.bar(28)
  const beat = T.beat
  s.build = (root) => {
    plate = R.el('div', 'abs', root)
    plate.style.cssText = 'inset:0'
    hero = sequence(plate, { dir: '/data/captures/hero/frames', count: HERO_FRAMES, fps: 30 })
    shade = R.el('div', 'abs', root)
    shade.style.cssText = 'inset:0;background:linear-gradient(180deg, rgba(4,5,6,0.75) 0%, rgba(4,5,6,0.1) 45%, rgba(4,5,6,0) 70%)'
    const box = R.el('div', 'abs', root)
    box.style.cssText = 'left:150px;top:96px'
    l1 = line(box, ['Teach', 'a', 'robot'], { size: 168 })
    l2 = line(box, ['by', { t: 'showing', serif: true, grad: true }, 'it.'], { size: 168 })
  }
  s.render = (t) => {
    hero.set(Math.max(0, t - b25))
    const push = prog(t, b25, b28 + 1.2 - b25, inOutSine)
    hero.camera(960, 560, mix(1.0, 1.09, push))
    const focus = prog(t, b26, 0.9, inOutCubic)
    plate.style.filter = `blur(${mix(9, 0, focus)}px) brightness(${mix(0.55, 1, focus)})`
    const words = [...l1.words, ...l2.words]
    const at = [0, 1, 1.5, 2.5, 3, 3.5].map((k) => b25 + k * beat)
    words.forEach((w, i) => rise(w, prog(t, at[i], 0.65, outExpo)))
    // After the focus pull the type softens slightly, so the scene leads.
    const soft = prog(t, b26 + 0.4, 1.0, inOutCubic)
    for (const l of [l1, l2]) l.el.style.opacity = String(mix(1, 0.92, soft))
    // Into the end card: the scene falls to black, the type goes with it.
    const end = prog(t, b28, 0.8, inOutCubic)
    s.layer.style.opacity = String(1 - end)
  }
  return s
}
