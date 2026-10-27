// One easing family for the whole reel: expo/quint out for entrances (0.5 to 0.7 s), quint/cubic
// in for exits (0.3 to 0.4 s), a lightly damped spring (about 6% overshoot) for slams and stamps.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const mix = (a, b, t) => a + (b - a) * t
export const smooth = (x) => x * x * (3 - 2 * x)

export const outExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x))
export const outQuint = (x) => 1 - Math.pow(1 - x, 5)
export const outCubic = (x) => 1 - Math.pow(1 - x, 3)
export const inQuint = (x) => x * x * x * x * x
export const inCubic = (x) => x * x * x
export const inOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
export const inOutQuint = (x) => (x < 0.5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2)
export const inOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2

/** Progress of t through [start, start + dur], clamped to 0..1 and eased. */
export function prog(t, start, dur, ease = (x) => x) {
  return ease(clamp((t - start) / dur))
}

/** Entrance at `start` (expo out, 0.6 s) and exit at `end` (quint in, 0.35 s): 0 → 1 → 0. */
export function inout(t, start, end, { dIn = 0.6, dOut = 0.35, eIn = outExpo, eOut = inQuint } = {}) {
  if (t < start || t > end) return 0
  const a = eIn(clamp((t - start) / dIn))
  const b = 1 - eOut(clamp((t - (end - dOut)) / dOut))
  return Math.min(a, b)
}

/**
 * Step response of a damped spring, 0 → 1, starting at `start`. zeta 0.67 overshoots by about 6%;
 * omega sets the speed (about 0.6 s to settle at 11).
 */
export function spring(t, start, { zeta = 0.67, omega = 11 } = {}) {
  const x = t - start
  if (x <= 0) return 0
  const wd = omega * Math.sqrt(1 - zeta * zeta)
  return 1 - Math.exp(-zeta * omega * x) * (Math.cos(wd * x) + ((zeta * omega) / wd) * Math.sin(wd * x))
}

/** Deterministic pseudo-random numbers (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Smooth 1D value noise in [-1, 1], deterministic in (x, seed). */
export function noise1(x, seed = 0) {
  const h = (i) => {
    let n = (i * 374761393 + seed * 668265263) | 0
    n = Math.imul(n ^ (n >>> 13), 1274126177)
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296
  }
  const i = Math.floor(x)
  const f = x - i
  return mix(h(i), h(i + 1), smooth(f)) * 2 - 1
}
