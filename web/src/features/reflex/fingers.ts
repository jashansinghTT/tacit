import type { FingerTrack } from '@/lib/api/learn'

export const FINGER_LABELS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'] as const
/** One colour per finger, shared by the glove, the bars and the chart. */
export const FINGER_COLORS = ['#3cd7ff', '#a78bfa', '#7cf5c4', '#ffc857', '#ff7ab6'] as const

/** The five curls (0 open .. 1 closed) at time t, linearly interpolated between track rows. */
export function curlsAt(track: FingerTrack | undefined, t: number, out: number[] = [0, 0, 0, 0, 0]): number[] {
  const rows = track?.frames
  if (!rows?.length) {
    out.fill(0.15)
    return out
  }
  if (t <= rows[0][0]) return copy(rows[0], out)
  const last = rows[rows.length - 1]
  if (t >= last[0]) return copy(last, out)
  let lo = 0
  let hi = rows.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (rows[mid][0] <= t) lo = mid
    else hi = mid
  }
  const a = rows[lo]
  const b = rows[hi]
  const k = (t - a[0]) / Math.max(1e-6, b[0] - a[0])
  for (let i = 0; i < 5; i++) out[i] = a[i + 1] + (b[i + 1] - a[i + 1]) * k
  return out
}

function copy(row: number[], out: number[]) {
  for (let i = 0; i < 5; i++) out[i] = row[i + 1]
  return out
}

/** A one-line description of the grip in a track: which fingers do the work. */
export function describeGrip(track: FingerTrack | undefined): string | null {
  const rows = track?.frames
  if (!rows || rows.length < 2) return null
  const span = [0, 1, 2, 3, 4].map((i) => {
    let lo = 1
    let hi = 0
    for (const r of rows) {
      lo = Math.min(lo, r[i + 1])
      hi = Math.max(hi, r[i + 1])
    }
    return hi - lo
  })
  const mean = [0, 1, 2, 3, 4].map((i) => rows.reduce((s, r) => s + r[i + 1], 0) / rows.length)
  const moving = span.map((s, i) => [s, i] as const).filter(([s]) => s > 0.25).map(([, i]) => FINGER_LABELS[i].toLowerCase())
  const closed = mean.map((m, i) => [m, i] as const).filter(([m]) => m > 0.6).map(([, i]) => FINGER_LABELS[i].toLowerCase())
  if (moving.length === 5) return 'All five fingers work through this step: the grip closes and opens again.'
  if (moving.length) return `Most of the motion is in the ${join(moving)}${moving.length < 3 ? '; the other fingers hold still' : ''}.`
  if (closed.length) return `The ${join(closed)} stay${closed.length === 1 ? 's' : ''} closed through the step: a steady grip.`
  return 'The hand stays mostly open through this step.'
}

function join(xs: string[]) {
  if (xs.length <= 1) return xs.join('')
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}
