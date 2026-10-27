// In-memory state for mock mode. Jobs advance with wall-clock time, so polling and sockets agree.
import type { EvalTrial, Job, JobStage, LibraryItem, Listing, RobotRun, Skill } from '../api/types'
import { seedEarnings, seedListings, seedSkills } from './data'

export const db = {
  skills: new Map<string, Skill>(seedSkills().map((s) => [s.id, s])),
  listings: new Map<string, Listing>(seedListings().map((l) => [l.id, l])),
  library: new Map<string, LibraryItem[]>([
    [
      'u_atlas',
      [
        {
          license: { id: 'lic_seed1', listing_id: 'lst_valve', license_type: 'robot_deploy', buyer_id: 'u_atlas', amount: 349, currency: 'USD', created_at: '2026-08-01T10:00:00Z', download: '/api/exchange/licenses/lic_seed1/pack.zip' },
          listing: seedListings().find((l) => l.id === 'lst_valve')!,
        },
      ],
    ],
  ]),
  earnings: seedEarnings(),
  runs: new Map<string, RobotRun[]>([
    ['sk_sort', [
      { id: 'rr_seed3', mode: 'gr00t', success: true, at: '2026-10-19T12:20:00Z' },
      { id: 'rr_seed2', mode: 'policy', success: true, at: '2026-10-19T11:40:00Z' },
      { id: 'rr_seed1', mode: 'replay', success: true, at: '2026-10-19T11:02:00Z' },
    ]],
  ]),
  sessions: new Map<string, { skill_id: string; lang: string }>(),
  audits: new Map<string, import('../api/types').Audit[]>(),
}

export function rid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`
}

interface StagePlan {
  name: string
  secs: number
  detail: string
  models?: string[]
}

const PLANS: Record<string, StagePlan[]> = {
  process: [
    { name: 'decode', secs: 0.9, detail: '382 frames at 10 fps' },
    { name: 'perceive', secs: 5.5, detail: 'hands, gaze and parts per frame', models: ['MediaPipe@cpu', 'HaMeR@0', 'Gaze-LLE@0', 'RF-DETR@0'] },
    { name: 'events', secs: 0.7, detail: '14 grasps, releases and gaze shifts' },
    { name: 'steps', secs: 0.6, detail: '6 steps' },
    { name: 'write', secs: 4.2, detail: 'titles, why notes, SOP, quiz, robot program', models: ['gpt-oss-20b@2'] },
    { name: 'verify', secs: 2.4, detail: '4 views, reprojection 1.6 px', models: ['VGGT-1B@0'] },
    { name: 'twin', secs: 1.3, detail: '3D body, hands and point cloud' },
    { name: 'narrate', secs: 2.2, detail: '6 narration clips', models: ['S2 Pro@1'] },
    { name: 'ready', secs: 0.2, detail: 'skill ready' },
  ],
  verify: [
    { name: 'sample', secs: 0.6, detail: '4 views across the clip' },
    { name: 'rebuild', secs: 2.6, detail: 'multi-view reconstruction', models: ['VGGT-1B@0'] },
    { name: 'score', secs: 0.5, detail: 'reprojection and depth stability' },
  ],
  train: [
    { name: 'demos', secs: 3, detail: '200 randomised sim demonstrations', models: ['MuJoCo@cpu'] },
    { name: 'train', secs: 9, detail: '30 epochs, behaviour cloning', models: ['PyTorch@cpu'] },
    { name: 'save', secs: 0.5, detail: 'policy stored with the skill' },
  ],
  audit: [
    { name: 'decode', secs: 0.8, detail: '312 frames at 10 fps' },
    { name: 'perceive', secs: 3.5, detail: 'hands, gaze and parts per frame', models: ['MediaPipe@cpu', 'HaMeR@0', 'Gaze-LLE@0', 'RF-DETR@0'] },
    { name: 'align', secs: 1.4, detail: 'dynamic time warping against the expert' },
    { name: 'report', secs: 2.2, detail: 'step table and narrative', models: ['gpt-oss-20b@2'] },
  ],
  evaluate: [
    { name: 'trials', secs: 8, detail: '20 randomised trials', models: ['MuJoCo@cpu'] },
    { name: 'report', secs: 0.4, detail: 'success rate and failure reasons' },
  ],
}

interface MockJob {
  id: string
  kind: string
  skill_id: string
  started: number
  onDone?: () => void
  doneFired: boolean
  failAt?: string
}

const jobs = new Map<string, MockJob>()

export function startJob(kind: string, skillId: string, onDone?: () => void): string {
  const id = rid('job')
  jobs.set(id, { id, kind, skill_id: skillId, started: performance.now(), onDone, doneFired: false })
  return id
}

function lossCurve(epochs: number, upTo: number): [number, number][] {
  const out: [number, number][] = []
  for (let e = 1; e <= Math.min(epochs, upTo); e++) {
    const noise = 0.012 * Math.sin(e * 2.7)
    out.push([e, Math.round((0.045 + 0.9 * Math.exp(-e / 5.5) + noise) * 1000) / 1000])
  }
  return out
}

const FAIL_REASONS = ['dropped bolt on transfer', 'grasp missed bracket edge']

export function evalTrials(n = 20): EvalTrial[] {
  return Array.from({ length: n }, (_, i) => {
    const fail = i === 6 || i === 15
    return { seed: i, success: !fail, steps: 380 + ((i * 37) % 90), reason: fail ? FAIL_REASONS[i === 6 ? 0 : 1] : null }
  })
}

export function getJob(id: string): Job | null {
  const j = jobs.get(id)
  if (!j) return null
  const plan = PLANS[j.kind] ?? PLANS.process
  const total = plan.reduce((s, p) => s + p.secs, 0)
  let el = (performance.now() - j.started) / 1000
  const stages: JobStage[] = []
  let stage: string | null = null
  let acc = 0
  for (const p of plan) {
    if (el >= acc + p.secs) {
      stages.push({ name: p.name, status: 'done', ms: Math.round(p.secs * 1000 * (0.9 + 0.2 * Math.random())), detail: p.detail, models: p.models })
    } else if (el >= acc) {
      stage = p.name
      stages.push({ name: p.name, status: 'running', progress: Math.round(((el - acc) / p.secs) * 100) / 100, detail: p.detail, models: p.models })
    } else {
      stages.push({ name: p.name, status: 'pending', detail: null, models: p.models })
    }
    acc += p.secs
  }
  el = Math.min(el, total)
  const done = el >= total
  if (done && !j.doneFired) {
    j.doneFired = true
    j.onDone?.()
  }
  let result: Record<string, unknown> | null = null
  if (j.kind === 'train') {
    const trainStart = plan[0].secs
    const ep = Math.floor(Math.max(0, el - trainStart) / (plan[1].secs / 30))
    result = { loss_curve: lossCurve(30, done ? 30 : ep), policy_path: done ? `skills/${j.skill_id}/policy.pt` : undefined }
  } else if (j.kind === 'evaluate') {
    const all = evalTrials()
    const k = done ? all.length : Math.floor((el / plan[0].secs) * all.length)
    const tr = all.slice(0, k)
    result = { success_rate: tr.length ? tr.filter((t) => t.success).length / tr.length : 0, trials: tr }
  } else if (done) {
    result = { skill_id: j.skill_id }
  }
  return {
    id: j.id,
    kind: j.kind,
    skill_id: j.skill_id,
    status: done ? 'done' : 'running',
    progress: Math.round((el / total) * 1000) / 1000,
    stage: done ? (plan[plan.length - 1]?.name ?? null) : stage,
    stages,
    error: null,
    result,
  }
}
