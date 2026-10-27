// A simple articulated hand: 21 MediaPipe-ordered landmarks from a finger curl amount.
// Used by the landing hero's ghost hands and by the mock-mode scene.
import type { Vec3 } from './api/types'

const FINGERS: { base: [number, number]; lens: number[]; spread: number }[] = [
  { base: [-0.022, 0.03], lens: [0.04, 0.032, 0.028], spread: -0.75 }, // thumb, from the CMC
  { base: [-0.024, 0.085], lens: [0.04, 0.024, 0.02], spread: -0.08 },
  { base: [-0.002, 0.09], lens: [0.044, 0.027, 0.021], spread: 0 },
  { base: [0.018, 0.085], lens: [0.041, 0.025, 0.02], spread: 0.08 },
  { base: [0.035, 0.074], lens: [0.032, 0.019, 0.018], spread: 0.18 },
]

/**
 * Landmarks in hand space (metres, origin at the wrist): x across the knuckles, z along the
 * fingers, y out of the back of the hand. `mirror` is 1 for a right hand, -1 for a left.
 */
export function handLocal(curl: number, mirror: number): Vec3[] {
  const pts: Vec3[] = [[0, 0, 0]]
  FINGERS.forEach((f, fi) => {
    const thumb = fi === 0
    let pos: Vec3 = [f.base[0] * mirror, 0, f.base[1]]
    pts.push(thumb ? [f.base[0] * 0.5 * mirror, 0, f.base[1] * 0.5] : pos)
    let pitch = thumb ? -0.2 : 0
    // The thumb swings in toward the index finger as the hand closes.
    const yaw = (thumb ? f.spread * (1 - curl * 0.75) : f.spread) * mirror
    f.lens.forEach((len, j) => {
      pitch -= curl * (thumb ? 0.45 : j === 0 ? 0.9 : 1.15)
      const dir: Vec3 = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)]
      pos = [pos[0] + dir[0] * len, pos[1] + dir[1] * len, pos[2] + dir[2] * len]
      pts.push(pos)
    })
  })
  return pts
}

/** Place hand-space points at `wrist`, fingers pitched down by `pitchDown`, then yawed. */
export function placeHand(local: Vec3[], wrist: Vec3, yawRad: number, pitchDown: number): Vec3[] {
  const cy = Math.cos(yawRad)
  const sy = Math.sin(yawRad)
  const cp = Math.cos(pitchDown)
  const sp = Math.sin(pitchDown)
  return local.map(([x, y, z]) => {
    const y1 = y * cp - z * sp
    const z1 = y * sp + z * cp
    const x2 = x * cy + z1 * sy
    const z2 = -x * sy + z1 * cy
    return [wrist[0] + x2, wrist[1] + y1, wrist[2] + z2]
  })
}
