// Robust reading of a twin for the motion previews: which frames to trust, where the person is,
// and which way they face. Tracking glitches (a pose that jumps a metre for one frame, a hand
// placed without depth) are left out instead of being drawn.
import type { Twin, Vec3 } from '@/lib/api'

export interface MotionStats {
  /** Body pose consistent with the rest of the clip. */
  bodyOk: boolean[]
  leftOk: boolean[]
  rightOk: boolean[]
  /** Median shoulder midpoint. */
  center: Vec3
  /** Median shoulder width (metres); the scale of the figure. */
  width: number
  /** A floor just under the lowest hands and hips. */
  floorY: number
  /** Unit vector (on the floor plane) from the person toward the camera that filmed them. */
  front: Vec3
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y)
  return s.length ? s[s.length >> 1] : 0
}
const quantile = (a: number[], q: number) => {
  const s = [...a].sort((x, y) => x - y)
  return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))] : 0
}
export const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

export function analyseMotion(twin: Twin): MotionStats {
  const fr = twin.frames
  const mids = fr.map((f) => (f.body?.[11] && f.body[12] ? ([0, 1, 2].map((k) => (f.body![11][k] + f.body![12][k]) / 2) as Vec3) : null))
  const widths = fr.map((f) => (f.body?.[11] && f.body[12] ? dist(f.body[11], f.body[12]) : null))
  const width = median(widths.filter((w): w is number => w != null)) || 0.35
  const present = mids.filter((m): m is Vec3 => m != null)
  const center: Vec3 = present.length ? [median(present.map((m) => m[0])), median(present.map((m) => m[1])), median(present.map((m) => m[2]))] : [0, 0.4, 0]
  const bodyOk = fr.map((_, i) => {
    const m = mids[i]
    const w = widths[i]
    return m != null && w != null && dist(m, center) < 0.9 * width && w > 0.6 * width && w < 1.6 * width
  })
  const near = (h: Vec3[] | null) => Boolean(h && h.length === 21 && dist(h[0], center) < 3 * width)
  const leftOk = fr.map((f) => near(f.hands.left))
  const rightOk = fr.map((f) => near(f.hands.right))
  const lows: number[] = []
  fr.forEach((f, i) => {
    if (bodyOk[i] && f.body) for (const j of [15, 16, 23, 24]) if (f.body[j]) lows.push(f.body[j][1])
    if (leftOk[i]) lows.push(f.hands.left![0][1])
    if (rightOk[i]) lows.push(f.hands.right![0][1])
  })
  const floorY = (lows.length ? quantile(lows, 0.03) : center[1] - 0.5) - 0.06
  const cam = (twin as Twin & { camera?: { position?: Vec3 } }).camera?.position
  let front: Vec3 = [0, 0, 1]
  if (cam) {
    const dx = cam[0] - center[0]
    const dz = cam[2] - center[2]
    const n = Math.hypot(dx, dz)
    if (n > 1e-3) front = [dx / n, 0, dz / n]
  }
  return { bodyOk, leftOk, rightOk, center, width, floorY, front }
}
