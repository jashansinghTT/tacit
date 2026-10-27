// 2D overlay drawing for the lesson player: hand skeletons, the gaze target and part boxes,
// mapped from source pixels into an element that shows the media with object-fit: contain.
import type { Box, GazeFrame, HandFrame, ObjectDet } from '@/lib/api'
import { FINGERTIPS, HAND_CONNECTIONS } from '@/lib/geometry'

export interface Fit {
  scale: number
  ox: number
  oy: number
  w: number
  h: number
  mirror: boolean
}

export function containFit(srcW: number, srcH: number, boxW: number, boxH: number, mirror = false): Fit {
  const scale = Math.min(boxW / srcW, boxH / srcH)
  return { scale, ox: (boxW - srcW * scale) / 2, oy: (boxH - srcH * scale) / 2, w: boxW, h: boxH, mirror }
}

function px(fit: Fit, x: number, y: number): [number, number] {
  const sx = fit.ox + x * fit.scale
  return [fit.mirror ? fit.w - sx : sx, fit.oy + y * fit.scale]
}

export const HAND_COLOR = { left: '#3cd7ff', right: '#a78bfa' } as const

export function drawHands(ctx: CanvasRenderingContext2D, hands: HandFrame[] | undefined, fit: Fit, opts: { alpha?: number; width?: number } = {}) {
  if (!hands?.length) return
  const alpha = opts.alpha ?? 1
  const width = opts.width ?? 2.25
  for (const h of hands) {
    if (!h.lm2d || h.lm2d.length < 21) continue
    const color = HAND_COLOR[h.side] ?? HAND_COLOR.right
    const pts = h.lm2d.map(([x, y]) => px(fit, x, y))
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.shadowColor = color
    ctx.shadowBlur = 10
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.moveTo(...pts[a])
      ctx.lineTo(...pts[b])
    }
    ctx.stroke()
    ctx.shadowBlur = 0
    for (let i = 0; i < 21; i++) {
      const tip = FINGERTIPS.includes(i)
      ctx.beginPath()
      ctx.fillStyle = tip ? '#ffffff' : color
      ctx.arc(pts[i][0], pts[i][1], tip ? 3 : 2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}

export function drawGaze(ctx: CanvasRenderingContext2D, gaze: GazeFrame | null | undefined, fit: Fit, t: number) {
  if (!gaze || gaze.inout < 0.5) return
  const [x, y] = px(fit, gaze.x, gaze.y)
  const pulse = 1 + 0.12 * Math.sin(t * 5)
  ctx.save()
  ctx.strokeStyle = '#ffc857'
  ctx.fillStyle = 'rgb(255 200 87 / 0.16)'
  ctx.lineWidth = 1.5
  ctx.shadowColor = '#ffc857'
  ctx.shadowBlur = 12
  ctx.beginPath()
  ctx.arc(x, y, 14 * pulse, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.beginPath()
  ctx.arc(x, y, 3, 0, Math.PI * 2)
  ctx.fillStyle = '#ffc857'
  ctx.fill()
  if (gaze.target) label(ctx, x + 18, y - 18, `looks at ${gaze.target}`, '#ffc857')
  ctx.restore()
}

function label(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
  ctx.font = '500 11px "Geist Mono Variable", ui-monospace, monospace'
  const w = ctx.measureText(text).width + 10
  ctx.fillStyle = 'rgb(8 9 11 / 0.82)'
  ctx.beginPath()
  ctx.roundRect(x, y - 9, w, 18, 4)
  ctx.fill()
  ctx.fillStyle = color
  ctx.fillText(text, x + 5, y + 4)
}

/** Part boxes as corner brackets; the parts this step uses are bright, the rest faint. */
export function drawObjects(ctx: CanvasRenderingContext2D, objects: ObjectDet[] | undefined, fit: Fit, highlight: string[] = []) {
  if (!objects?.length) return
  const hl = highlight.map((s) => s.toLowerCase())
  for (const o of objects) {
    const on = hl.some((h) => o.label.toLowerCase().includes(h) || h.includes(o.label.toLowerCase()))
    if (!on && o.score < 0.5) continue
    const [x1, y1] = px(fit, o.box[0], o.box[1])
    const [x2, y2] = px(fit, o.box[2], o.box[3])
    const l = Math.min(x1, x2)
    const r = Math.max(x1, x2)
    const color = on ? '#7cf5c4' : 'rgb(236 238 241 / 0.35)'
    bracket(ctx, [l, y1, r, y2], color, on ? 1.75 : 1)
    if (on) label(ctx, l, y1 - 12, o.label, '#7cf5c4')
  }
}

function bracket(ctx: CanvasRenderingContext2D, [x1, y1, x2, y2]: Box, color: string, width: number) {
  const k = Math.min(14, (x2 - x1) / 4, (y2 - y1) / 4)
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(x1, y1 + k)
  ctx.lineTo(x1, y1)
  ctx.lineTo(x1 + k, y1)
  ctx.moveTo(x2 - k, y1)
  ctx.lineTo(x2, y1)
  ctx.lineTo(x2, y1 + k)
  ctx.moveTo(x2, y2 - k)
  ctx.lineTo(x2, y2)
  ctx.lineTo(x2 - k, y2)
  ctx.moveTo(x1 + k, y2)
  ctx.lineTo(x1, y2)
  ctx.lineTo(x1, y2 - k)
  ctx.stroke()
  ctx.restore()
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
