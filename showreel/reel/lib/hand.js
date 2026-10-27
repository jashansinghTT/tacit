// Hand skeletons from the vase skill's real tracks (MediaPipe landmarks, 10 fps), interpolated to
// any time, projected and drawn as lit bones.
import { clamp, mix } from './ease.js'

// MediaPipe hand topology: [parent, child], ordered wrist outwards along each finger.
export const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
]
// Draw-on order: how far each joint is from the wrist along the chain (0..4).
export const DEPTH = [0, 1, 2, 3, 4, 1, 2, 3, 4, 2, 3, 4, 5, 3, 4, 5, 6, 2, 3, 4, 5]
export const TIPS = [4, 8, 12, 16, 20]

/** Index of the last track frame at or before t (frames sorted by t). */
function bracket(frames, t) {
  let lo = 0
  let hi = frames.length - 1
  if (t <= frames[0].t) return 0
  if (t >= frames[hi].t) return hi
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (frames[m].t <= t) lo = m
    else hi = m
  }
  return lo
}

const lerpPts = (a, b, u) => a.map((p, i) => p.map((v, k) => mix(v, b[i][k], u)))

/**
 * The hand of `side` at time t, linearly interpolated between analysed frames (only when both
 * neighbours have that hand; otherwise the nearest one). Returns {lm2d, world, cam_t} or null.
 */
export function handAt(tracks, side, t) {
  const f = tracks.frames
  const i = bracket(f, t)
  const a = f[i]
  const b = f[Math.min(i + 1, f.length - 1)]
  const ha = a.hands.find((h) => h.side === side)
  const hb = b.hands.find((h) => h.side === side)
  if (!ha && !hb) return null
  if (!ha || !hb || a === b) {
    const h = ha || hb
    return { lm2d: h.lm2d, world: h.world, cam_t: h.cam_t }
  }
  const u = clamp((t - a.t) / (b.t - a.t))
  return { lm2d: lerpPts(ha.lm2d, hb.lm2d, u), world: lerpPts(ha.world, hb.world, u), cam_t: lerpPts([ha.cam_t], [hb.cam_t], u)[0] }
}

/** Gaze (x, y in source pixels) and head box at time t, interpolated. */
export function gazeAt(tracks, t) {
  const f = tracks.frames
  const i = bracket(f, t)
  const a = f[i]
  const b = f[Math.min(i + 1, f.length - 1)]
  if (!a.gaze || !a.head) return null
  const u = b.gaze && b.head && b !== a ? clamp((t - a.t) / (b.t - a.t)) : 0
  const g = b.gaze && b.head ? b : a
  return {
    x: mix(a.gaze.x, g.gaze.x, u), y: mix(a.gaze.y, g.gaze.y, u), target: a.gaze.target,
    head: a.head.bbox.map((v, k) => mix(v, g.head.bbox[k], u)),
  }
}

/** Objects at time t (nearest frame). */
export function objectsAt(tracks, t) {
  const f = tracks.frames
  const i = bracket(f, t)
  const a = f[i]
  const b = f[Math.min(i + 1, f.length - 1)]
  return (t - a.t < b.t - t ? a : b).objects || []
}

/** Rotate a point by yaw (around y) then pitch (around x). */
export function rot([x, y, z], yaw, pitch, roll = 0) {
  let cy = Math.cos(yaw), sy = Math.sin(yaw)
  let X = cy * x + sy * z
  let Z = -sy * x + cy * z
  const cp = Math.cos(pitch), sp = Math.sin(pitch)
  const Y = cp * y - sp * Z
  Z = sp * y + cp * Z
  const cr = Math.cos(roll), sr = Math.sin(roll)
  return [cr * X - sr * Y, sr * X + cr * Y, Z]
}

/** Perspective projection: camera at distance `dist` on +z looking at the origin, focal `f` px. */
export function project([x, y, z], { cx, cy, f, dist }) {
  const d = dist - z
  return [cx + (x * f) / d, cy + (y * f) / d, d]
}

/**
 * Draw a lit hand skeleton. pts: 21 screen points [x, y, depth?]. draw(i) in 0..1 is how much of
 * bone i is drawn (draw-on); joints pop with their parent bone. Additive glow in `color`.
 */
export function drawHand(g, pts, { color = '#3cd7ff', width = 3, glow = 1, alpha = 1, draw = () => 1, jointR = 5, core = '#ffffff',
  boneAlpha = () => 1, jointAlpha = () => 1, depthScale = () => 1 } = {}) {
  g.save()
  g.globalCompositeOperation = 'lighter'
  g.lineCap = 'round'
  const passes = [
    [width * 9, 0.045 * glow],
    [width * 4.2, 0.12 * glow],
    [width * 2.0, 0.5],
    [width * 0.9, 1],
  ]
  for (const [w, a] of passes) {
    g.lineWidth = w
    g.strokeStyle = color
    BONES.forEach(([p, c], i) => {
      const k = draw(i)
      const ba = boneAlpha(i)
      if (k <= 0 || ba <= 0) return
      const A = pts[p], B = pts[c]
      const ds = (depthScale(p) + depthScale(c)) / 2
      g.globalAlpha = a * alpha * ba * Math.min(1, 0.35 + 0.65 * ds)
      g.lineWidth = w * ds
      g.beginPath()
      g.moveTo(A[0], A[1])
      g.lineTo(mix(A[0], B[0], k), mix(A[1], B[1], k))
      g.stroke()
    })
  }
  // Joints: a soft halo and a hot core, scaled in as their bone arrives.
  const jointK = new Array(21).fill(0)
  jointK[0] = draw(0) > 0 || draw(4) > 0 ? 1 : 0
  BONES.forEach(([, c], i) => { jointK[c] = Math.max(jointK[c], clamp((draw(i) - 0.85) / 0.15)) })
  for (let j = 0; j < 21; j++) {
    const k = jointK[j] * jointAlpha(j)
    if (k <= 0) continue
    const [x, y] = pts[j]
    const r = jointR * (TIPS.includes(j) ? 1.25 : 1) * (0.4 + 0.6 * k) * depthScale(j)
    const grad = g.createRadialGradient(x, y, 0, x, y, r * 4.5)
    grad.addColorStop(0, color)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.globalAlpha = 0.35 * glow * alpha * k
    g.fillStyle = grad
    g.beginPath(); g.arc(x, y, r * 4.5, 0, Math.PI * 2); g.fill()
    g.globalAlpha = alpha * k
    g.fillStyle = core
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
  }
  g.restore()
}
