import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import type { Twin, Vec3 } from '@/lib/api'
import { HAND_CONNECTIONS, POSE_CONNECTIONS } from '@/lib/geometry'
import { cn } from '@/lib/cn'
import { useMotion } from './hooks'

const W = 320
const H = 180
const PAD = 14
// Room for the card's badges above and its step/robot labels below.
const PAD_TOP = 34
const PAD_BOTTOM = 26
const L_WRIST = 15
const R_WRIST = 16
const BODY_JOINTS = [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24]

type P = [number, number]

interface Projected {
  body: (P[] | null)[]
  left: (P[] | null)[]
  right: (P[] | null)[]
  /** Smoothed wrist paths, split wherever tracking jumped. */
  trailL: P[][]
  trailR: P[][]
  /** Frames whose pose is consistent with the rest (tracking glitches are skipped). */
  good: number[]
  best: number
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y)
  return s.length ? s[s.length >> 1] : 0
}
const dist2 = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1])

/**
 * Front view (the camera's): x to the right, y up, fitted into the viewBox. Frames whose
 * shoulders sit far from the median pose are tracking glitches and are left out.
 */
function project(twin: Twin): Projected | null {
  const frames = twin.frames
  const mids = frames.map((f) => (f.body?.[11] && f.body[12] ? ([(f.body[11][0] + f.body[12][0]) / 2, (f.body[11][1] + f.body[12][1]) / 2, 0] as Vec3) : null))
  const widths = frames.map((f) => (f.body?.[11] && f.body[12] ? dist2(f.body[11], f.body[12]) : null))
  const ws = widths.filter((w): w is number => w != null)
  const mw = median(ws) || 0.35
  const mm: Vec3 = [median(mids.flatMap((m) => (m ? [m[0]] : []))), median(mids.flatMap((m) => (m ? [m[1]] : []))), 0]
  const bodyOk = frames.map((_, i) => {
    const m = mids[i]
    const w = widths[i]
    return m != null && w != null && dist2(m, mm) < 0.9 * mw && w > 0.6 * mw && w < 1.6 * mw
  })
  // A hand counts when it sits near the median torso (the twin can misplace a hand without depth).
  const handOk = (h: Vec3[] | null) => Boolean(h && dist2(h[0], mm) < 3 * mw)

  const pts: Vec3[] = []
  frames.forEach((f, i) => {
    if (f.body && bodyOk[i]) for (const j of BODY_JOINTS) if (f.body[j]) pts.push(f.body[j])
    if (handOk(f.hands.left)) pts.push(f.hands.left![0])
    if (handOk(f.hands.right)) pts.push(f.hands.right![0])
  })
  if (pts.length < 4) return null
  const xs = pts.map((p) => p[0]).sort((a, b) => a - b)
  const ys = pts.map((p) => p[1]).sort((a, b) => a - b)
  const q = (a: number[], k: number) => a[Math.min(a.length - 1, Math.max(0, Math.round(k * (a.length - 1))))]
  const x0 = q(xs, 0.02)
  const x1 = q(xs, 0.98)
  const y0 = q(ys, 0.02)
  const y1 = q(ys, 0.98)
  const hAvail = H - PAD_TOP - PAD_BOTTOM
  const s = Math.min((W - 2 * PAD) / Math.max(x1 - x0, 1e-3), hAvail / Math.max(y1 - y0, 1e-3))
  const ox = (W - (x1 - x0) * s) / 2
  const oy = PAD_BOTTOM + (hAvail - (y1 - y0) * s) / 2
  const to = (p: Vec3): P => [ox + (p[0] - x0) * s, H - (oy + (p[1] - y0) * s)]
  const body = frames.map((f, i) => (f.body && bodyOk[i] ? f.body.map(to) : null))
  const left = frames.map((f) => (handOk(f.hands.left) ? f.hands.left!.map(to) : null))
  const right = frames.map((f) => (handOk(f.hands.right) ? f.hands.right!.map(to) : null))

  const jump = mw * s * 0.6
  const trail = (pick: (i: number) => P | undefined) => {
    const raw: (P | null)[] = frames.map((_, i) => pick(i) ?? null)
    const out: P[][] = []
    let cur: P[] = []
    raw.forEach((p, i) => {
      if (!p) return
      // Moving average over five frames, then a break wherever the wrist jumps.
      const win = raw.slice(Math.max(0, i - 2), i + 3).filter((x): x is P => x != null)
      const sm: P = [win.reduce((a, x) => a + x[0], 0) / win.length, win.reduce((a, x) => a + x[1], 0) / win.length]
      const last = cur[cur.length - 1]
      if (last && Math.hypot(sm[0] - last[0], sm[1] - last[1]) > jump) {
        if (cur.length > 2) out.push(cur)
        cur = []
      }
      cur.push(sm)
    })
    if (cur.length > 2) out.push(cur)
    return out
  }
  const trailL = trail((i) => left[i]?.[0] ?? body[i]?.[L_WRIST])
  const trailR = trail((i) => right[i]?.[0] ?? body[i]?.[R_WRIST])

  const good = frames.map((_, i) => i).filter((i) => body[i] || left[i] || right[i])
  let best = good[0] ?? 0
  let bestScore = -1
  for (const i of good) {
    const score = (body[i] ? 1 : 0) + (left[i] ? 1 : 0) + (right[i] ? 1 : 0)
    const d = mids[i] ? dist2(mids[i]!, mm) : 9
    const bd = mids[best] ? dist2(mids[best]!, mm) : 9
    if (score > bestScore || (score === bestScore && d < bd)) {
      bestScore = score
      best = i
    }
  }
  return { body, left, right, trailL, trailR, good, best }
}

const path = (ps: P[]) => ps.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')

function Figure({ p, i }: { p: Projected; i: number }) {
  const b = p.body[i]
  const hands = [
    { pts: p.left[i], color: 'var(--color-data-left)' },
    { pts: p.right[i], color: 'var(--color-data-right)' },
  ]
  return (
    <g>
      {b && (
        <g stroke="var(--color-fg)" strokeOpacity={0.5} strokeWidth={1.4} strokeLinecap="round">
          {POSE_CONNECTIONS.map(([a, c]) => (b[a] && b[c] ? <line key={`${a}-${c}`} x1={b[a][0]} y1={b[a][1]} x2={b[c][0]} y2={b[c][1]} /> : null))}
          {b[7] && b[8] && <circle cx={(b[7][0] + b[8][0]) / 2} cy={(b[7][1] + b[8][1]) / 2} r={Math.max(5, Math.hypot(b[7][0] - b[8][0], b[7][1] - b[8][1]) * 0.7)} fill="var(--color-fg)" fillOpacity={0.06} />}
        </g>
      )}
      {hands.map((h, k) =>
        h.pts ? (
          <g key={k} stroke={h.color} strokeWidth={1.1} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 3px ${k ? '#a78bfa' : '#3cd7ff'})` }}>
            {HAND_CONNECTIONS.map(([a, c]) => (
              <line key={`${a}-${c}`} x1={h.pts![a][0]} y1={h.pts![a][1]} x2={h.pts![c][0]} y2={h.pts![c][1]} />
            ))}
          </g>
        ) : b ? (
          <circle key={k} cx={b[k ? R_WRIST : L_WRIST]?.[0]} cy={b[k ? R_WRIST : L_WRIST]?.[1]} r={2.6} fill={h.color} style={{ filter: `drop-shadow(0 0 4px ${k ? '#a78bfa' : '#3cd7ff'})` }} />
        ) : null,
      )}
    </g>
  )
}

/** Wrist trails over the whole skill plus the skeleton at one moment. Plays while `playing`. */
export function MotionGlyph({ twin, playing, className }: { twin: Twin; playing?: boolean; className?: string }) {
  const p = useMemo(() => project(twin), [twin])
  const reduce = useReducedMotion()
  const id = useId().replace(/:/g, '')
  const [k, setK] = useState<number | null>(null)
  const raf = useRef(0)
  useEffect(() => {
    if (!playing || reduce || !p || !p.good.length) {
      setK(null)
      return
    }
    const fps = twin.fps || 10
    const t0 = performance.now()
    const start = Math.max(0, p.good.indexOf(p.best))
    const tick = (now: number) => {
      setK((start + Math.floor(((now - t0) / 1000) * fps * 1.5)) % p.good.length)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, reduce, p, twin])
  if (!p) return <MotionEmpty className={className} />
  const frame = k == null ? p.best : p.good[k]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn('size-full', className)} role="img" aria-label="Motion preview: the expert's body and hand paths">
      <defs>
        <radialGradient id={`${id}-floor`} cx="50%" cy="85%" r="60%">
          <stop offset="0" stopColor="#3cd7ff" stopOpacity="0.10" />
          <stop offset="1" stopColor="#3cd7ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-floor)`} />
      {p.trailL.map((t, n) => (
        <path key={`l${n}`} d={path(t)} fill="none" stroke="var(--color-data-left)" strokeOpacity={0.4} strokeWidth={1} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {p.trailR.map((t, n) => (
        <path key={`r${n}`} d={path(t)} fill="none" stroke="var(--color-data-right)" strokeOpacity={0.4} strokeWidth={1} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      <Figure p={p} i={frame} />
    </svg>
  )
}

function MotionEmpty({ className }: { className?: string }) {
  return (
    <div className={cn('grid size-full place-items-center', className)}>
      <span className="eyebrow text-fg-faint">No motion preview</span>
    </div>
  )
}

/** Fetches the twin once the card scrolls into view, then draws the glyph. */
export function MotionSignature({ skillId, playing, className }: { skillId: string; playing?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return
    }
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setSeen(true), { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  const twin = useMotion(skillId, seen)
  return (
    <div ref={ref} className={cn('relative size-full', className)} data-testid="motion-signature">
      {twin.data ? <MotionGlyph twin={twin.data} playing={playing} /> : twin.isError ? <MotionEmpty /> : <div className="skeleton absolute inset-3 opacity-40" />}
    </div>
  )
}
