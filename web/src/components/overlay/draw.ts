// Draws one analysis frame (Tracks frame or live `analysis` message) over a video.
// Coordinates arrive in source-video pixels; `fit` maps them into the displayed rect.
import type { GazeFrame, HandFrame, ObjectDet, PoseFrame, Box } from '@/lib/api'
import { HAND_CONNECTIONS, POSE_CONNECTIONS, POSE_UPPER } from '@/lib/geometry'

export interface OverlayFrame {
  hands?: HandFrame[]
  pose?: PoseFrame | null
  head?: { bbox: Box } | null
  gaze?: GazeFrame | null
  objects?: ObjectDet[]
}

export interface OverlayLayers {
  hands: boolean
  gaze: boolean
  objects: boolean
  pose: boolean
}

export const ALL_LAYERS: OverlayLayers = { hands: true, gaze: true, objects: true, pose: true }

export interface Fit {
  scale: number
  ox: number
  oy: number
}

/** object-fit: contain mapping from source pixels to the canvas. */
export function containFit(srcW: number, srcH: number, dstW: number, dstH: number): Fit {
  const scale = Math.min(dstW / srcW, dstH / srcH)
  return { scale, ox: (dstW - srcW * scale) / 2, oy: (dstH - srcH * scale) / 2 }
}

const COLORS = {
  left: '#3cd7ff',
  right: '#a78bfa',
  gaze: '#ffc857',
  object: '#7cf5c4',
  pose: 'rgba(236,238,241,0.45)',
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function corners(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, len: number) {
  ctx.beginPath()
  ctx.moveTo(x1, y1 + len)
  ctx.lineTo(x1, y1)
  ctx.lineTo(x1 + len, y1)
  ctx.moveTo(x2 - len, y1)
  ctx.lineTo(x2, y1)
  ctx.lineTo(x2, y1 + len)
  ctx.moveTo(x2, y2 - len)
  ctx.lineTo(x2, y2)
  ctx.lineTo(x2 - len, y2)
  ctx.moveTo(x1 + len, y2)
  ctx.lineTo(x1, y2)
  ctx.lineTo(x1, y2 - len)
  ctx.stroke()
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  f: OverlayFrame | null | undefined,
  fit: Fit,
  layers: OverlayLayers = ALL_LAYERS,
  opts: { time?: number; highlightObject?: string | null; dpr?: number } = {},
) {
  if (!f) return
  const X = (x: number) => fit.ox + x * fit.scale
  const Y = (y: number) => fit.oy + y * fit.scale
  const s = Math.max(0.6, Math.min(1.6, fit.scale * 1.4))
  const t = opts.time ?? performance.now() / 1000
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Upper-body pose, faint, under everything else.
  if (layers.pose && f.pose?.lm2d?.length) {
    const p = f.pose.lm2d
    ctx.strokeStyle = COLORS.pose
    ctx.lineWidth = 1.5 * s
    ctx.setLineDash([4 * s, 4 * s])
    for (const [a, b] of POSE_CONNECTIONS) {
      if (!p[a] || !p[b] || (p[a][2] ?? 1) < 0.3 || (p[b][2] ?? 1) < 0.3) continue
      ctx.beginPath()
      ctx.moveTo(X(p[a][0]), Y(p[a][1]))
      ctx.lineTo(X(p[b][0]), Y(p[b][1]))
      ctx.stroke()
    }
    ctx.setLineDash([])
    ctx.fillStyle = COLORS.pose
    for (const i of POSE_UPPER) {
      if (!p[i] || (p[i][2] ?? 1) < 0.3) continue
      ctx.beginPath()
      ctx.arc(X(p[i][0]), Y(p[i][1]), 2 * s, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Part and object boxes with labels.
  if (layers.objects && f.objects?.length) {
    ctx.font = `500 ${Math.round(11 * s)}px "Geist Mono Variable", ui-monospace, monospace`
    for (const o of f.objects) {
      const [x1, y1, x2, y2] = o.box
      const hl = opts.highlightObject && o.label === opts.highlightObject
      const color = hl ? '#ffffff' : COLORS.object
      ctx.strokeStyle = color
      ctx.globalAlpha = hl ? 1 : 0.85
      ctx.lineWidth = (hl ? 2 : 1.25) * s
      ctx.fillStyle = hl ? 'rgba(255,255,255,0.06)' : 'rgba(124,245,196,0.05)'
      ctx.fillRect(X(x1), Y(y1), X(x2) - X(x1), Y(y2) - Y(y1))
      corners(ctx, X(x1), Y(y1), X(x2), Y(y2), Math.min(12 * s, (X(x2) - X(x1)) / 3))
      const label = `${o.label} ${Math.round(o.score * 100)}`
      const w = ctx.measureText(label).width + 10 * s
      const h = 16 * s
      ctx.globalAlpha = 1
      ctx.fillStyle = 'rgba(4,5,6,0.78)'
      roundRect(ctx, X(x1), Y(y1) - h - 3 * s, w, h, 3 * s)
      ctx.fill()
      ctx.fillStyle = color
      ctx.fillText(label, X(x1) + 5 * s, Y(y1) - 3 * s - 4.5 * s)
    }
    ctx.globalAlpha = 1
  }

  // Gaze: head box, then a ray to the target with a pulsing reticle.
  if (layers.gaze && f.gaze && f.head?.bbox) {
    const [hx1, hy1, hx2, hy2] = f.head.bbox
    const cx = X((hx1 + hx2) / 2)
    const cy = Y(hy1 + (hy2 - hy1) * 0.42)
    const gx = X(f.gaze.x)
    const gy = Y(f.gaze.y)
    ctx.strokeStyle = COLORS.gaze
    ctx.lineWidth = 1.25 * s
    ctx.globalAlpha = 0.7
    corners(ctx, X(hx1), Y(hy1), X(hx2), Y(hy2), 8 * s)
    ctx.globalAlpha = 1
    const grad = ctx.createLinearGradient(cx, cy, gx, gy)
    grad.addColorStop(0, 'rgba(255,200,87,0.05)')
    grad.addColorStop(1, 'rgba(255,200,87,0.95)')
    ctx.strokeStyle = grad
    ctx.lineWidth = 2 * s
    ctx.shadowColor = COLORS.gaze
    ctx.shadowBlur = 10 * s
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(gx, gy)
    ctx.stroke()
    ctx.shadowBlur = 0
    const pulse = 1 + 0.25 * Math.sin(t * 5)
    ctx.strokeStyle = COLORS.gaze
    ctx.lineWidth = 1.5 * s
    ctx.beginPath()
    ctx.arc(gx, gy, 9 * s * pulse, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = COLORS.gaze
    ctx.beginPath()
    ctx.arc(gx, gy, 2.5 * s, 0, Math.PI * 2)
    ctx.fill()
    if (f.gaze.target) {
      ctx.font = `500 ${Math.round(11 * s)}px "Geist Mono Variable", ui-monospace, monospace`
      const label = `looking at ${f.gaze.target}`
      const w = ctx.measureText(label).width + 10 * s
      ctx.fillStyle = 'rgba(4,5,6,0.78)'
      roundRect(ctx, gx + 12 * s, gy - 8 * s, w, 16 * s, 3 * s)
      ctx.fill()
      ctx.fillStyle = COLORS.gaze
      ctx.fillText(label, gx + 17 * s, gy + 3.5 * s)
    }
  }

  // Hands: glowing skeletons, left cyan and right violet.
  if (layers.hands && f.hands?.length) {
    for (const h of f.hands) {
      if (!h.lm2d || h.lm2d.length < 21) continue
      const color = h.side === 'left' ? COLORS.left : COLORS.right
      const pts = h.lm2d.map(([x, y]) => [X(x), Y(y)] as const)
      ctx.strokeStyle = color
      ctx.shadowColor = color
      ctx.shadowBlur = 12 * s
      ctx.lineWidth = 2.5 * s
      ctx.beginPath()
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.moveTo(pts[a][0], pts[a][1])
        ctx.lineTo(pts[b][0], pts[b][1])
      }
      ctx.stroke()
      ctx.shadowBlur = 0
      for (let i = 0; i < 21; i++) {
        const tip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20
        ctx.fillStyle = i === 0 ? color : '#ffffff'
        ctx.beginPath()
        ctx.arc(pts[i][0], pts[i][1], (tip ? 3.2 : 2.2) * s, 0, Math.PI * 2)
        ctx.fill()
      }
      // side label at the wrist
      ctx.font = `600 ${Math.round(10 * s)}px "Geist Mono Variable", ui-monospace, monospace`
      ctx.fillStyle = color
      ctx.fillText(h.side === 'left' ? 'L' : 'R', pts[0][0] + 6 * s, pts[0][1] + 14 * s)
    }
  }
  ctx.restore()
}
