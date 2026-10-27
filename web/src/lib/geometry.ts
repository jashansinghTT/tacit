// Landmark topology shared by the overlays and the 3D twin (MediaPipe conventions).

export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

export const FINGERTIPS = [4, 8, 12, 16, 20]

/** Upper body only: the table hides the legs in every capture. */
export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [0, 2], [0, 5], [2, 7], [5, 8],
]

export const POSE_UPPER = [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24]

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function smoothstep(t: number) {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

/** Binary search for the frame nearest to time t (frames sorted by t). */
export function nearestFrame<F extends { t: number }>(frames: F[], t: number): F | undefined {
  if (!frames.length) return undefined
  let lo = 0
  let hi = frames.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (frames[mid].t < t) lo = mid + 1
    else hi = mid
  }
  if (lo > 0 && Math.abs(frames[lo - 1].t - t) < Math.abs(frames[lo].t - t)) return frames[lo - 1]
  return frames[lo]
}
