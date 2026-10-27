// Mock mode for the Reflex glove endpoints. The finger track is computed from the procedural
// scene's hands with the same bend-to-curl mapping as backend/tacit/reflex.py.
import type { FingerTrack, GuideResult, ReflexPose, ReflexStatus } from '../api/learn'
import type { Vec3 } from '../api/types'
import { db } from './state'
import { SCENE_DURATION, trackAt } from './scene'

const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky']
const CHAINS = [0, 1, 2, 3, 4].map((k) => [0, 1 + 4 * k, 2 + 4 * k, 3 + 4 * k, 4 + 4 * k])
const OPEN = [0.45, 0.3, 0.3, 0.3, 0.35]
const FIST = [1.6, 3.0, 3.2, 3.1, 3.0]
const GUIDE_MAX = 0.85

function curls(world: Vec3[]): number[] {
  return CHAINS.map((chain, f) => {
    let bend = 0
    for (let i = 1; i < chain.length - 1; i++) {
      const a = world[chain[i - 1]]
      const b = world[chain[i]]
      const c = world[chain[i + 1]]
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]]
      const nu = Math.hypot(...u) || 1e-9
      const nv = Math.hypot(...v) || 1e-9
      const cos = Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (nu * nv)))
      bend += Math.acos(cos)
    }
    const c = (bend - OPEN[f]) / (FIST[f] - OPEN[f])
    return Math.round(Math.max(0, Math.min(1, c)) * 1000) / 1000
  })
}

export async function reflexStatus(): Promise<ReflexStatus> {
  return { connected: false, url: 'http://127.0.0.1:8000', fingers: FINGERS }
}

export async function fingerTrack(skillId: string, step?: number): Promise<FingerTrack> {
  const skill = db.skills.get(skillId)
  const st = step ? skill?.steps.find((s) => s.index === step) : undefined
  const t0 = st?.t_start ?? 0
  const t1 = st?.t_end ?? SCENE_DURATION
  const side = st?.hand === 'left' ? 'left' : 'right'
  const rows: number[][] = []
  for (let t = t0; t <= t1 + 1e-6; t += 0.1) {
    const h = trackAt(t).hands.find((x) => x.side === side)
    if (h?.world.length === 21) rows.push([Math.round(t * 1000) / 1000, ...curls(h.world)])
  }
  return { fingers: FINGERS, hand: side, t_start: rows.length ? t0 : null, frames: rows, fps: 10 }
}

export async function guide(skillId: string, step?: number): Promise<GuideResult> {
  const track = await fingerTrack(skillId, step)
  const steps: ReflexPose[] = []
  let last: number[] | null = null
  let lastT = track.frames[0]?.[0] ?? 0
  for (const r of track.frames) {
    const pose = r.slice(1).map((v) => Math.min(GUIDE_MAX, v))
    if (!last || pose.some((v, i) => Math.abs(v - last![i]) >= 0.08) || r[0] - lastT >= 0.6) {
      steps.push({ pose, seconds: last ? Math.max(0.1, r[0] - lastT) : 0.5 })
      last = pose
      lastT = r[0]
    }
  }
  steps.push({ pose: [0.15, 0.15, 0.15, 0.15, 0.15], seconds: 0.5 })
  return {
    connected: false,
    name: `tacit_${skillId}_step${step ?? 0}`,
    steps,
    seconds: Math.round(steps.reduce((s, p) => s + p.seconds, 0) * 100) / 100,
    message: 'No Reflex backend at http://127.0.0.1:8000; the virtual glove plays the same steps.',
  }
}
