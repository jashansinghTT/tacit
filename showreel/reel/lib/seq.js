// An app capture (an image sequence) as a full-stage plate with a 2D camera. Fractional frames
// cross-fade between neighbours, so a sequence can play slower than it was captured.
import { R } from '../main.js'

export function sequence(parent, { dir, count, fps = 30, w = 1920, h = 1080 }) {
  const box = R.el('div', 'abs', parent)
  box.style.cssText = 'inset:0;overflow:hidden'
  const inner = R.el('div', 'abs', box)
  inner.style.cssText = `left:0;top:0;width:${w}px;height:${h}px;transform-origin:0 0`
  const a = R.plate(inner)
  const b = R.plate(inner)
  for (const p of [a, b]) p.img.style.cssText = `left:0;top:0;width:${w}px;height:${h}px`
  const src = (i) => `${dir}/f_${String(Math.max(0, Math.min(count - 1, i))).padStart(5, '0')}.jpg`
  return {
    box,
    /** Show time st (s into the sequence). */
    set(st) {
      const x = Math.max(0, Math.min(count - 1, st * fps))
      const i = Math.floor(x)
      const f = x - i
      a.set(src(i))
      b.set(src(i + 1))
      b.img.style.opacity = f > 0.02 && i + 1 < count ? String(f) : '0'
    },
    /** Camera: plate point (px, py) at stage point (sx, sy), scaled by k. */
    camera(px, py, k, sx = R.W / 2, sy = R.H / 2) {
      const s = (R.W / w) * k
      inner.style.transform = `translate(${sx - px * s}px, ${sy - py * s}px) scale(${s})`
    },
  }
}
