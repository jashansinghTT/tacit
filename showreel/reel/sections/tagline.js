// 10. Tagline on the final lift, over the landing page's 3D hero: the Franka mirroring an expert's
// ghost hands. Words land one per beat; focus racks from the type to the scene. Then, on the last bar
// before the lockup, a recap: eight flash-cuts on the half-beat, each a real frame of an earlier
// section (borrowed from that section at the given time).
// Technique: rack focus and a slow push, then a beat-cut sizzle.
import { R } from '../main.js'
import { sequence } from '../lib/seq.js'
import { line, rise } from '../lib/type.js'
import { inOutCubic, inOutSine, mix, outExpo, prog } from '../lib/ease.js'

export const HERO_FRAMES = 220

export default function tagline(T) {
  const s = { id: 'tagline', z: 10 }
  let hero, plate, l1, l2, shade, flash, typeBox
  const b25 = T.bar(25), b27 = T.bar(27), b28 = T.bar(28)
  // The recap: [section, time] per half-beat of bar 27.
  const RECAP = [['hands', 19.45], ['watch', 28.3], ['check', 33.6], ['check', 37.4],
    ['teach', 41.05], ['do', 50.4], ['earn', 54.6], ['box', 59.6]]
  s.borrow = (t) => {
    if (t < b27 || t >= b28) return []
    const k = Math.min(RECAP.length - 1, Math.floor((t - b27) / (T.beat / 2)))
    return [{ id: RECAP[k][0], at: RECAP[k][1] }]
  }
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
    typeBox = box
    flash = R.el('div', 'abs', root)
    flash.style.cssText = 'inset:0;background:#e6faff;opacity:0'
  }
  s.render = (t) => {
    hero.set(Math.max(0, t - b25))
    const push = prog(t, b25, b28 + 1.2 - b25, inOutSine)
    hero.camera(960, 560, mix(1.0, 1.09, push))
    const focus = prog(t, b25 + 2 * beat, 0.9, inOutCubic)
    plate.style.filter = `blur(${mix(9, 0, focus)}px) brightness(${mix(0.55, 1, focus)})`
    const words = [...l1.words, ...l2.words]
    const at = [0, 1, 1.5, 2.5, 3, 3.5].map((k) => b25 + k * beat)
    words.forEach((w, i) => rise(w, prog(t, at[i], 0.65, outExpo)))
    // After the focus pull the type softens slightly, so the scene leads.
    const soft = prog(t, b25 + 2 * beat + 0.4, 1.0, inOutCubic)
    for (const l of [l1, l2]) l.el.style.opacity = String(mix(1, 0.92, soft))
    // The recap bar: the scene and type step aside for the borrowed shots (lower layers); a flash
    // marks each cut.
    const recap = t >= b27 && t < b28
    plate.style.opacity = shade.style.opacity = typeBox.style.opacity = recap ? '0' : '1'
    if (recap) {
      const since = (t - b27) % (T.beat / 2)
      flash.style.opacity = String(0.22 * Math.exp(-since * 22))
    } else flash.style.opacity = '0'
    s.layer.style.opacity = t >= b28 ? '0' : '1'
  }
  return s
}
