/**
 * Franka Emika Panda kinematics (modified DH parameters from the Franka documentation).
 * Frame: robot base at the origin, z up, metres. Pure math so the mock layer can use it.
 */

export type Mat4 = number[] // column-major 4×4
export type V3 = [number, number, number]

export const JOINT_NAMES = [
  'panda_joint1', 'panda_joint2', 'panda_joint3', 'panda_joint4',
  'panda_joint5', 'panda_joint6', 'panda_joint7',
]

// [a_{i-1}, d_i, alpha_{i-1}]
const DH: [number, number, number][] = [
  [0, 0.333, 0],
  [0, 0, -Math.PI / 2],
  [0, 0.316, Math.PI / 2],
  [0.0825, 0, Math.PI / 2],
  [-0.0825, 0.384, -Math.PI / 2],
  [0, 0, Math.PI / 2],
  [0.088, 0, Math.PI / 2],
]
const FLANGE_D = 0.107
const TCP_D = 0.1034

export const LIMITS: [number, number][] = [
  [-2.8973, 2.8973], [-1.7628, 1.7628], [-2.8973, 2.8973], [-3.0718, -0.0698],
  [-2.8973, 2.8973], [-0.0175, 3.7525], [-2.8973, 2.8973],
]

export const HOME = [0, -0.785, 0, -2.356, 0, 1.571, 0.785]

function identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
}

function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]
    o[c * 4 + r] = s
  }
  return o
}

/** Modified DH: RotX(alpha) · TransX(a) · RotZ(theta) · TransZ(d). */
function dhMatrix(a: number, d: number, alpha: number, theta: number): Mat4 {
  const ca = Math.cos(alpha)
  const sa = Math.sin(alpha)
  const ct = Math.cos(theta)
  const st = Math.sin(theta)
  // column-major
  return [
    ct, st * ca, st * sa, 0,
    -st, ct * ca, ct * sa, 0,
    0, -sa, ca, 0,
    a, -d * sa, d * ca, 1,
  ]
}

function transZ(d: number): Mat4 {
  const m = identity()
  m[14] = d
  return m
}

function rotZ(t: number): Mat4 {
  const c = Math.cos(t)
  const s = Math.sin(t)
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
}

/** World transforms of link 1..7, the flange and the TCP (between the fingertips). */
export function forward(q: number[]): { links: Mat4[]; flange: Mat4; tcp: Mat4 } {
  let T = identity()
  const links: Mat4[] = []
  for (let i = 0; i < 7; i++) {
    const [a, d, alpha] = DH[i]
    T = mul(T, dhMatrix(a, d, alpha, q[i] ?? 0))
    links.push(T)
  }
  const flange = mul(T, transZ(FLANGE_D))
  const hand = mul(flange, rotZ(-Math.PI / 4))
  const tcp = mul(hand, transZ(TCP_D))
  return { links, flange: hand, tcp }
}

export function position(m: Mat4): V3 {
  return [m[12], m[13], m[14]]
}

export function zAxis(m: Mat4): V3 {
  return [m[8], m[9], m[10]]
}

export function xAxis(m: Mat4): V3 {
  return [m[0], m[1], m[2]]
}

/**
 * Damped least-squares IK for the TCP position with the gripper pointing down (z axis along
 * -world z) and a preferred yaw. Warm-started from `seed`; returns a new joint vector.
 */
export function solveIK(target: V3, seed: number[], iterations = 60, yaw = 0): number[] {
  const q = seed.slice(0, 7)
  const lambda = 0.08
  const wantX: V3 = [Math.cos(yaw), Math.sin(yaw), 0]
  const err = (qq: number[]) => {
    const { tcp } = forward(qq)
    const p = position(tcp)
    const z = zAxis(tcp)
    const x = xAxis(tcp)
    return [
      target[0] - p[0], target[1] - p[1], target[2] - p[2],
      0.3 * (0 - z[0]), 0.3 * (0 - z[1]), 0.3 * (-1 - z[2]),
      0.1 * (wantX[0] - x[0]), 0.1 * (wantX[1] - x[1]),
    ]
  }
  for (let it = 0; it < iterations; it++) {
    const e = err(q)
    const en = Math.hypot(e[0], e[1], e[2])
    if (en < 5e-4 && Math.hypot(e[3], e[4], e[5]) < 2e-3) break
    // numeric Jacobian (m × 7)
    const m = e.length
    const J: number[][] = Array.from({ length: m }, () => new Array(7).fill(0))
    const h = 1e-4
    for (let j = 0; j < 7; j++) {
      const qq = q.slice()
      qq[j] += h
      const e2 = err(qq)
      for (let r = 0; r < m; r++) J[r][j] = -(e2[r] - e[r]) / h
    }
    // dq = J^T (J J^T + λ² I)^-1 e
    const A: number[][] = Array.from({ length: m }, (_, r) =>
      Array.from({ length: m }, (_, c) => {
        let s = 0
        for (let k = 0; k < 7; k++) s += J[r][k] * J[c][k]
        return s + (r === c ? lambda * lambda : 0)
      }),
    )
    const y = solve(A, e)
    for (let j = 0; j < 7; j++) {
      let s = 0
      for (let r = 0; r < m; r++) s += J[r][j] * y[r]
      q[j] = Math.min(LIMITS[j][1], Math.max(LIMITS[j][0], q[j] + s))
    }
  }
  return q
}

/** Gaussian elimination with partial pivoting for a small dense system. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    ;[M[c], M[p]] = [M[p], M[c]]
    const d = M[c][c] || 1e-12
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / d
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  const x = new Array(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n]
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]
    x[r] = s / (M[r][r] || 1e-12)
  }
  return x
}
