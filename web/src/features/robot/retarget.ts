// Places the expert's hands (from the twin) in the robot's workspace for the Replay ghost.
//
// Replay drives the robot along the expert's wrist path after tacit_sim's `retarget_wrist_path`
// maps it from the camera frame into the workspace with one affine transform (table plane fit,
// uniform scale). The sim sends that transform in the replay `meta` (`human.transform.matrix`);
// when it is missing (older sim), we compute the same transform here from the same inputs the
// backend uses (`backend/tacit/robot/lab.py: wrist_path`), so the ghost lands on the robot's path.
import type { Twin, Vec3 } from '@/lib/api'

/** 3×4 row-major: robot = M · [x, y, z, 1] for a camera-frame point (OpenCV axes, metres). */
export type Affine = number[][]

const WORKSPACE_X: [number, number] = [0.32, 0.62]
const WORKSPACE_Y: [number, number] = [-0.26, 0.26]
const Z_LIFT = 0.04

const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a: number[]) => Math.hypot(a[0], a[1], a[2])
const cross = (a: number[], b: number[]): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

export function applyAffine(m: Affine, p: Vec3, out: Vec3 = [0, 0, 0]): Vec3 {
  const [x, y, z] = p
  out[0] = m[0][0] * x + m[0][1] * y + m[0][2] * z + m[0][3]
  out[1] = m[1][0] * x + m[1][1] * y + m[1][2] * z + m[1][3]
  out[2] = m[2][0] * x + m[2][1] * y + m[2][2] * z + m[2][3]
  return out
}

/** Twin (y up, re-centred) to the camera frame the backend hands the sim. */
export function twinToCamera(p: Vec3, cam: Vec3): Vec3 {
  return [p[0] - cam[0], -(p[1] - cam[1]), -(p[2] - cam[2])]
}

export function twinCamera(twin: Twin): Vec3 {
  const c = (twin as Twin & { camera?: { position?: Vec3 } }).camera?.position
  return c && c.length === 3 ? c : [0, 0, 0]
}

/** The hand the expert worked with: the side with the most tracked frames. */
export function workingSide(twin: Twin): 'left' | 'right' {
  let l = 0
  let r = 0
  for (const f of twin.frames) {
    if (f.hands?.left) l++
    if (f.hands?.right) r++
  }
  return r >= l ? 'right' : 'left'
}

function smooth(p: Vec3[], k = 5): Vec3[] {
  if (p.length < k) return p
  const pad = k >> 1
  const n = p.length
  return p.map((_, i) => {
    const s: Vec3 = [0, 0, 0]
    for (let j = i - pad; j <= i + pad; j++) {
      const q = p[Math.min(n - 1, Math.max(0, j))]
      s[0] += q[0] / k
      s[1] += q[1] / k
      s[2] += q[2] / k
    }
    return s
  })
}

/** Eigenvector of the smallest eigenvalue of a symmetric 3×3 matrix (cyclic Jacobi). */
function smallestEigenvector(A: number[][]): Vec3 {
  const a = A.map((r) => r.slice())
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2
    if (off < 1e-18) break
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      if (Math.abs(a[p][q]) < 1e-15) continue
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
      const c = 1 / Math.sqrt(t * t + 1)
      const s = t * c
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p]
        const akq = a[k][q]
        a[k][p] = c * akp - s * akq
        a[k][q] = s * akp + c * akq
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k]
        const aqk = a[q][k]
        a[p][k] = c * apk - s * aqk
        a[q][k] = s * apk + c * aqk
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p]
        const vkq = v[k][q]
        v[k][p] = c * vkp - s * vkq
        v[k][q] = s * vkp + c * vkq
      }
    }
  }
  let best = 0
  for (let i = 1; i < 3; i++) if (a[i][i] < a[best][best]) best = i
  return [v[0][best], v[1][best], v[2][best]]
}

/**
 * The camera-to-robot affine of `retarget_wrist_path` for this twin (same steps: smoothed wrist
 * path, PCA table plane with the normal pointing up, uniform scale into the workspace).
 * Returns null when the twin has too few tracked wrist points (the backend refuses replay then).
 */
export function computeAffine(twin: Twin): { matrix: Affine; side: 'left' | 'right'; t0: number } | null {
  const side = workingSide(twin)
  const cam = twinCamera(twin)
  const raw: { t: number; p: Vec3 }[] = []
  for (const f of twin.frames) {
    const h = f.hands?.[side]
    if (!h || !h[0]) continue
    const p = twinToCamera(h[0], cam)
    if (p.every(Number.isFinite) && Number.isFinite(f.t)) raw.push({ t: f.t, p })
  }
  if (raw.length < 5) return null
  raw.sort((a, b) => a.t - b.t)
  const P = smooth(raw.map((r) => r.p))
  const c: Vec3 = [0, 0, 0]
  for (const p of P) for (let i = 0; i < 3; i++) c[i] += p[i] / P.length
  const X = P.map((p) => [p[0] - c[0], p[1] - c[1], p[2] - c[2]])
  const C = [0, 1, 2].map((i) => [0, 1, 2].map((j) => X.reduce((s, x) => s + x[i] * x[j], 0)))
  let n = smallestEigenvector(C)
  const nn = norm(n)
  n = nn > 1e-9 ? [n[0] / nn, n[1] / nn, n[2] / nn] : [0, -1, 0]
  if (n[1] > 0) n = [-n[0], -n[1], -n[2]]
  let u: Vec3 = [1 - n[0] * n[0], -n[1] * n[0], -n[2] * n[0]]
  if (norm(u) < 1e-6) u = [-n[0] * n[2], -n[1] * n[2], 1 - n[2] * n[2]]
  const un = norm(u)
  u = [u[0] / un, u[1] / un, u[2] / un]
  let v = cross(n, u)
  if (v[2] < 0) v = [-v[0], -v[1], -v[2]]
  const pu = X.map((x) => dot(x, u))
  const pv = X.map((x) => dot(x, v))
  const ph = X.map((x) => dot(x, n))
  const range = (xs: number[]) => [Math.min(...xs), Math.max(...xs)]
  const [u0, u1] = range(pu)
  const [v0, v1] = range(pv)
  const hMin = Math.min(...ph)
  const s = Math.min((WORKSPACE_Y[1] - WORKSPACE_Y[0]) / Math.max(u1 - u0, 1e-6), (WORKSPACE_X[1] - WORKSPACE_X[0]) / Math.max(v1 - v0, 1e-6), 1.5)
  const uMid = (u0 + u1) / 2
  const vMid = (v0 + v1) / 2
  const xMid = (WORKSPACE_X[0] + WORKSPACE_X[1]) / 2
  // robot = [xMid + (X·v - vMid)s, -(X·u - uMid)s, zLift + (X·n - hMin)s] with X = p - c.
  const matrix: Affine = [
    [s * v[0], s * v[1], s * v[2], xMid - s * dot(v, c) - s * vMid],
    [-s * u[0], -s * u[1], -s * u[2], s * dot(u, c) + s * uMid],
    [s * n[0], s * n[1], s * n[2], Z_LIFT - s * dot(n, c) - s * hMin],
  ]
  return { matrix, side, t0: raw[0].t }
}

export interface GhostTrack {
  /** Twin time at which the robot's path starts (its first tracked wrist frame). */
  t0: number
  side: 'left' | 'right'
  fps: number
  times: number[]
  left: (Vec3[] | null)[]
  right: (Vec3[] | null)[]
  /** The expert's wrist, mapped: the path the robot follows (before its z clamp). */
  wrist: Vec3[]
}

/** Both hands of every twin frame, mapped into the robot frame (metres, z up). */
export function buildGhost(twin: Twin, matrix?: Affine | null): GhostTrack | null {
  const fit = computeAffine(twin)
  if (!fit) return null
  const M = matrix && matrix.length === 3 ? matrix : fit.matrix
  const cam = twinCamera(twin)
  const map = (h: Vec3[] | null | undefined) => (h && h.length === 21 ? h.map((p) => applyAffine(M, twinToCamera(p, cam))) : null)
  const times: number[] = []
  const left: (Vec3[] | null)[] = []
  const right: (Vec3[] | null)[] = []
  const wrist: Vec3[] = []
  for (const f of twin.frames) {
    times.push(f.t)
    const l = map(f.hands?.left)
    const r = map(f.hands?.right)
    left.push(l)
    right.push(r)
    const w = (fit.side === 'left' ? l : r)?.[0]
    if (w && f.t >= fit.t0) wrist.push(w)
  }
  return { t0: fit.t0, side: fit.side, fps: twin.fps || 10, times, left, right, wrist }
}

/** Interpolated landmarks of one hand at twin time `t` (null when the hand is not tracked). */
export function ghostAt(track: GhostTrack, side: 'left' | 'right', t: number, out: Vec3[]): Vec3[] | null {
  const frames = side === 'left' ? track.left : track.right
  const ts = track.times
  if (!ts.length) return null
  let i = 0
  let lo = 0
  let hi = ts.length - 1
  if (t <= ts[0]) i = 0
  else if (t >= ts[hi]) i = hi
  else {
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (ts[mid] <= t) lo = mid
      else hi = mid
    }
    i = lo
  }
  const a = frames[i]
  const b = frames[Math.min(i + 1, frames.length - 1)]
  if (!a) return null
  const u = b && ts[i + 1] !== undefined && ts[i + 1] > ts[i] ? Math.max(0, Math.min(1, (t - ts[i]) / (ts[i + 1] - ts[i]))) : 0
  if (out.length !== 21) out.length = 0
  for (let k = 0; k < 21; k++) {
    const pa = a[k]
    const pb = b ? b[k] : pa
    const o = out[k] ?? (out[k] = [0, 0, 0])
    o[0] = pa[0] + (pb[0] - pa[0]) * u
    o[1] = pa[1] + (pb[1] - pa[1]) * u
    o[2] = pa[2] + (pb[2] - pa[2]) * u
  }
  return out
}
