// The trainee's tracked hands over their own (mirrored) camera view. The step video uses the
// shared overlay in components/overlay; this one only adds mirroring and a softer style.
import type { HandFrame } from '@/lib/api'
import { FINGERTIPS, HAND_CONNECTIONS } from '@/lib/geometry'

export interface Fit {
  scale: number
  ox: number
  oy: number
  w: number
  mirror: boolean
}

/** object-fit: cover mapping from source pixels into a w × h box. */
export function coverFit(srcW: number, srcH: number, w: number, h: number, mirror: boolean): Fit {
  const scale = Math.max(w / srcW, h / srcH)
  return { scale, ox: (w - srcW * scale) / 2, oy: (h - srcH * scale) / 2, w, mirror }
}

export const HAND_COLOR = { left: '#3cd7ff', right: '#a78bfa' } as const

export function drawHands(ctx: CanvasRenderingContext2D, hands: HandFrame[] | undefined, fit: Fit, glow = 1) {
  if (!hands?.length) return
  for (const h of hands) {
    if (!h.lm2d || h.lm2d.length < 21) continue
    const color = HAND_COLOR[h.side] ?? HAND_COLOR.right
    const pts = h.lm2d.map(([x, y]) => {
      const sx = fit.ox + x * fit.scale
      return [fit.mirror ? fit.w - sx : sx, fit.oy + y * fit.scale] as const
    })
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur = 8 + 10 * glow
    ctx.lineWidth = 2.75
    ctx.beginPath()
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.moveTo(pts[a][0], pts[a][1])
      ctx.lineTo(pts[b][0], pts[b][1])
    }
    ctx.stroke()
    ctx.shadowBlur = 0
    for (let i = 0; i < 21; i++) {
      const tip = FINGERTIPS.includes(i)
      ctx.fillStyle = tip ? '#ffffff' : color
      ctx.beginPath()
      ctx.arc(pts[i][0], pts[i][1], tip ? 3.4 : 2.3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}

/** Size a canvas's backing store to its CSS box at the device pixel ratio; returns the CSS size. */
export function fitCanvas(canvas: HTMLCanvasElement): { w: number; h: number; dpr: number } {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
  }
  return { w, h, dpr }
}
