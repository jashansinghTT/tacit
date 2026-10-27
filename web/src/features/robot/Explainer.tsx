import type { ReactNode } from 'react'
import { BrainCircuit, Grid3x3, Hand, Shuffle, Waypoints, type LucideIcon } from 'lucide-react'
import type { RobotAction, Skill } from '@/lib/api'
import type { RobotStatus } from '@/lib/api/robot'
import { cn } from '@/lib/cn'
import { fmtAgo, fmtPct } from '@/lib/format'
import type { LabMode } from './ModeList'
import type { TrainProgress } from './useLabJobs'

type NodeState = 'done' | 'active' | 'pending'

interface Node {
  key: string
  label: string
  icon: LucideIcon
  value: ReactNode
  unit?: ReactNode
  sub: ReactNode
  state: NodeState
  mode?: LabMode
}

/** "pick vase → bench, pick bolt → tray" from the program's pick/place pairs. */
export function programTasks(program: RobotAction[]): string[] {
  const out: string[] = []
  let obj: string | null = null
  for (const a of program) {
    if (a.op === 'pick') {
      if (obj) out.push(obj)
      obj = a.object ?? 'object'
    } else if (a.op === 'place') {
      out.push(obj ? `${obj} → ${a.target ?? 'target'}` : `place in ${a.target ?? 'target'}`)
      obj = null
    }
  }
  if (obj) out.push(obj)
  return out
}

export function ExplainerStrip({
  skill,
  status,
  train,
  training,
  evaluating,
  evalLive,
  onMode,
}: {
  skill: Skill | undefined
  status: RobotStatus | undefined
  train: TrainProgress
  training: boolean
  evaluating: boolean
  evalLive: { ok: number; n: number } | null
  onMode: (m: LabMode) => void
}) {
  const policy = status?.policy
  const program = status?.program ?? []
  const tasks = programTasks(program)
  const curve = train.lossCurve.length ? train.lossCurve : (policy?.loss_curve ?? [])
  const loss = curve.length ? curve[curve.length - 1][1] : null
  const demos = training ? (train.demosTotal ?? null) : (policy?.demos ?? null)
  const trained = policy?.status === 'trained'
  const rate = evalLive && evalLive.n ? evalLive.ok / evalLive.n : (policy?.success_rate ?? null)
  const nodes: Node[] = [
    {
      key: 'demo',
      label: 'Human demo',
      icon: Hand,
      value: skill ? skill.steps.length : '–',
      unit: 'steps',
      sub: skill ? `${skill.source.duration.toFixed(0)} s by ${skill.expert.name.split(' ')[0]}` : '…',
      state: skill?.status === 'ready' ? 'done' : 'pending',
      mode: 'replay',
    },
    {
      key: 'program',
      label: 'Robot program',
      icon: Waypoints,
      value: program.length || '–',
      unit: 'actions',
      sub: tasks.length ? tasks.join(' · ') : 'written when the skill is processed',
      state: program.length ? 'done' : 'pending',
    },
    {
      key: 'variations',
      label: 'Simulated variations',
      icon: Shuffle,
      value: training && train.demosDone != null && train.scriptedSuccess == null ? `${train.demosDone}` : (demos ?? 200),
      unit: training && train.demosDone != null && train.scriptedSuccess == null ? `/ ${train.demosTotal}` : 'demos',
      sub: train.scriptedSuccess != null ? `randomised · scripted ${fmtPct(train.scriptedSuccess)} success` : 'randomised start poses + noise',
      state: training && !train.scriptedSuccess ? 'active' : demos ? 'done' : 'pending',
      mode: 'train',
    },
    {
      key: 'policy',
      label: 'Policy',
      icon: BrainCircuit,
      value: loss != null ? loss.toFixed(3) : '–',
      unit: 'loss',
      sub: training
        ? train.epoch != null
          ? `epoch ${train.epoch}/${train.epochs} on CPU`
          : 'waiting for the demos'
        : trained
          ? `${curve.length} epochs · trained ${fmtAgo(policy?.trained_at)}`
          : 'behaviour cloning on CPU',
      state: training && train.scriptedSuccess != null ? 'active' : trained ? 'done' : 'pending',
      mode: 'policy',
    },
    {
      key: 'trials',
      label: 'Trials',
      icon: Grid3x3,
      value: rate != null ? Math.round(rate * 100) : '–',
      unit: rate != null ? '% success' : undefined,
      sub: evalLive ? `${evalLive.ok}/${evalLive.n} so far` : policy?.trials ? `${Math.round((policy.success_rate ?? 0) * policy.trials)}/${policy.trials} randomised trials` : 'randomised scenes it never saw',
      state: evaluating ? 'active' : rate != null ? 'done' : 'pending',
      mode: 'evaluate',
    },
  ]
  return (
    <div className="panel relative overflow-hidden" data-testid="robot-explainer">
            <ol className="relative grid grid-cols-2 gap-px bg-line sm:grid-cols-3 lg:grid-cols-5">
        {nodes.map((n, i) => {
          const Icon = n.icon
          const body = (
            <>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'grid size-6 place-items-center rounded-md',
                    n.state === 'done' && 'bg-ion-soft text-ion shadow-[inset_0_0_0_1px_rgb(60_215_255/0.35)]',
                    n.state === 'active' && 'bg-ion text-ion-ink shadow-glow',
                    n.state === 'pending' && 'bg-white/[0.03] text-fg-faint shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="eyebrow truncate">
                  <span className="text-fg-faint">{String(i + 1).padStart(2, '0')}</span> {n.label}
                </span>
                {n.state === 'active' && <span className="ml-auto size-1.5 animate-pulse-dot rounded-full bg-ion" aria-label="in progress" />}
              </div>
              <div className={cn('mt-3 flex items-baseline gap-1.5', n.state === 'pending' ? 'text-fg-subtle' : 'text-fg')}>
                <span className="telemetry text-[26px] leading-none font-medium tracking-tight">{n.value}</span>
                {n.unit && n.value !== '–' && <span className="text-[12px] text-fg-subtle">{n.unit}</span>}
              </div>
              <div className="mt-1.5 line-clamp-2 text-[12px] text-fg-subtle">{n.sub}</div>
            </>
          )
          return (
            <li key={n.key} className="relative bg-ink-850" data-testid={`explainer-${n.key}`} data-state={n.state}>
              <span
                className={cn(
                  'absolute inset-x-0 bottom-0 h-0.5',
                  n.state === 'done' && 'bg-ion/70',
                  n.state === 'active' && 'animate-shimmer bg-[linear-gradient(90deg,rgb(60_215_255/0.25),var(--color-ion),rgb(60_215_255/0.25))] bg-[length:200%_100%]',
                  n.state === 'pending' && 'bg-white/[0.06]',
                )}
                aria-hidden
              />
              {n.mode ? (
                <button type="button" onClick={() => onMode(n.mode!)} className="block h-full w-full px-4 py-4 text-left transition-colors hover:bg-white/[0.025]">
                  {body}
                </button>
              ) : (
                <div className="px-4 py-4">{body}</div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
