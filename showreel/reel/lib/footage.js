// The vase footage as a camera-moved plate. Coordinates are the app's sample pixels (1280×720,
// the space the tracks are in); plates are 2560×1440 (2 plate px per sample px), so overlays drawn
// with toStage() line up with the picture exactly.
import { R } from '../main.js'

export const SRC_W = 1280
export const SRC_H = 720

export function footage(parent, { dir, fps, count }) {
  const box = R.el('div', 'abs', parent)
  box.style.cssText = 'inset:0;overflow:hidden'
  const a = R.plate(box)
  const b = R.plate(box)
  for (const p of [a, b]) p.img.style.cssText = 'width:2560px;height:1440px;transform-origin:0 0;'
  const cam = { cx: SRC_W / 2, cy: SRC_H / 2, zoom: 1 }
  const src = (i) => `${dir}/f_${String(Math.max(0, Math.min(count - 1, i))).padStart(5, '0')}.jpg`
  return {
    box,
    cam,
    /** Show footage time ft (s); fractional frames cross-fade between neighbours. */
    set(ft, { blend = true } = {}) {
      const x = ft * fps
      const i = Math.floor(x)
      const f = blend ? x - i : 0
      a.set(src(i))
      b.set(src(i + 1))
      b.img.style.opacity = f > 0.02 ? String(f) : '0'
    },
    /** Camera: sample point (cx, cy) at stage centre; zoom 1 fits the full frame to 1920 wide. */
    camera(cx, cy, zoom) {
      // Keep the view inside the picture (no black edges) whenever the frame covers the stage.
      if (zoom >= 1) {
        const hw = R.W / 2 / (1.5 * zoom)
        const hh = R.H / 2 / (1.5 * zoom)
        cx = Math.min(SRC_W - hw, Math.max(hw, cx))
        cy = Math.min(SRC_H - hh, Math.max(hh, cy))
      }
      Object.assign(cam, { cx, cy, zoom })
      const s = 0.75 * zoom
      const tx = R.W / 2 - 1.5 * zoom * cx
      const ty = R.H / 2 - 1.5 * zoom * cy
      for (const p of [a, b]) p.img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`
    },
    grade({ brightness = 1, saturate = 1, contrast = 1 } = {}) {
      box.style.filter = `brightness(${brightness}) saturate(${saturate}) contrast(${contrast})`
    },
    toStage(sx, sy) {
      return [R.W / 2 + (sx - cam.cx) * 1.5 * cam.zoom, R.H / 2 + (sy - cam.cy) * 1.5 * cam.zoom]
    },
  }
}
