import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Bot, BrainCircuit, Cpu, Grid3x3, Loader2, Waypoints } from 'lucide-react'
import type { SkillSummary } from '@/lib/api'
import { useBox, useSkills } from '@/lib/api/queries'
import { useRobotStatuses, type RobotStatus } from '@/lib/api/robot'
import { cn } from '@/lib/cn'
import { fmtAgo, fmtPct } from '@/lib/format'
import { Page, PageHeader } from '@/components/layout/Page'
import { Badge, ButtonLink, ChipTag, EmptyState, ErrorState, Meter, Panel, Skeleton, Stat, StatusDot } from '@/components/ui'
import { uniqueTasks } from '@/features/robot/Explainer'

type Stage = 'program' | 'policy' | 'evaluated'

function readiness(st: RobotStatus | undefined): { stage: Stage | null; label: string; tone: 'ok' | 'ion' | 'warn' | 'neutral' } {
  if (!st) return { stage: null, label: '…', tone: 'neutral' }
  const p = st.policy
  if (p.status === 'training') return { stage: 'program', label: 'Training', tone: 'ion' }
  if (p.status === 'failed') return { stage: 'program', label: 'Training failed', tone: 'warn' }
  if (p.status === 'trained' && p.success_rate != null)
    return { stage: 'evaluated', label: p.success_rate >= 0.8 ? 'Robot-ready' : 'Below 80%', tone: p.success_rate >= 0.8 ? 'ok' : 'warn' }
  if (p.status === 'trained') return { stage: 'policy', label: 'Policy trained', tone: 'ion' }
  if (st.program.length) return { stage: 'program', label: 'Program ready', tone: 'neutral' }
  return { stage: null, label: 'No program', tone: 'neutral' }
}

const STEPS: { key: Stage; label: string; icon: typeof Bot }[] = [
  { key: 'program', label: 'Program', icon: Waypoints },
  { key: 'policy', label: 'Policy', icon: BrainCircuit },
  { key: 'evaluated', label: 'Evaluated', icon: Grid3x3 },
]

function ReadinessTrack({ stage, training }: { stage: Stage | null; training: boolean }) {
  const reached = stage ? STEPS.findIndex((s) => s.key === stage) : -1
  return (
    <div className="flex items-center gap-1" role="img" aria-label={`Readiness: ${stage ? STEPS.slice(0, reached + 1).map((s) => s.label).join(', ') : 'nothing yet'}`}>
      {STEPS.map((s, i) => {
        const Icon = s.icon
        const done = i <= reached
        const active = training && i === 1
        return (
          <div key={s.key} className="flex flex-1 items-center gap-1">
            <span
              className={cn(
                'grid size-6 shrink-0 place-items-center rounded-md',
                done ? 'bg-ion-soft text-ion shadow-[inset_0_0_0_1px_rgb(60_215_255/0.35)]' : 'bg-white/[0.03] text-fg-faint shadow-[inset_0_0_0_1px_var(--color-line)]',
                active && 'animate-pulse',
              )}
              title={s.label}
            >
              <Icon className="size-3.5" />
            </span>
            {i < STEPS.length - 1 && <span className={cn('h-px flex-1', i < reached ? 'bg-ion/50' : 'bg-line-strong')} />}
          </div>
        )
      })}
    </div>
  )
}

function RobotSkillRow({ s, st, loading }: { s: SkillSummary; st: RobotStatus | undefined; loading: boolean }) {
  const processing = s.status === 'processing'
  const r = processing ? { stage: null, label: 'Processing', tone: 'ion' as const } : readiness(st)
  const tasks = processing ? [] : uniqueTasks(st?.program ?? [])
  const lastRun = st?.runs?.length ? st.runs[st.runs.length - 1] : null
  const rate = st?.policy.success_rate ?? null
  return (
    <li>
      <Link
        to={`/robot/${s.id}`}
        className="group grid items-center gap-x-5 gap-y-3 px-4 py-3.5 transition-colors hover:bg-white/[0.025] focus-visible:bg-white/[0.03] lg:grid-cols-[112px_minmax(0,1.5fr)_minmax(0,1.3fr)_168px_150px_92px_20px]"
        data-testid={`robot-skill-${s.id}`}
      >
        <div className="relative hidden aspect-video overflow-hidden rounded-md bg-ink-950 shadow-[inset_0_0_0_1px_var(--color-line)] lg:block">
          {s.thumb ? <img src={s.thumb} alt="" loading="lazy" className="size-full object-cover opacity-80" /> : <div className="size-full grid-bg" />}
          {processing && (
            <div className="absolute inset-0 grid place-items-center bg-ink-950/50">
              <Loader2 className="size-4 animate-spin text-ion" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-medium text-fg group-hover:text-white">{s.title}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[12px] text-fg-subtle">
            <span className="truncate">{s.expert.name}</span>
            <Badge tone={r.tone} dot pulse={r.tone === 'ion'} data-testid="robot-readiness">
              {r.label}
            </Badge>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {loading ? (
            <Skeleton className="h-5 w-40" />
          ) : tasks.length ? (
            tasks.map((t, i) => (
              <span key={i} className="telemetry truncate rounded-xs bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-fg-muted shadow-[inset_0_0_0_1px_var(--color-line)]">
                {t}
              </span>
            ))
          ) : (
            <span className="text-[12px] text-fg-faint">{processing ? 'Program comes with processing' : 'No robot program yet'}</span>
          )}
        </div>
        <ReadinessTrack stage={r.stage} training={st?.policy.status === 'training'} />
        <div>
          <div className="flex items-baseline gap-1.5">
            {rate != null && <span className={cn('telemetry text-[17px] font-medium', rate >= 0.8 ? 'text-ok' : 'text-warn')}>{fmtPct(rate)}</span>}
            <span className="text-[11px] text-fg-subtle">{st?.policy.trials ? `over ${st.policy.trials} trials` : st?.policy.status === 'trained' ? 'not evaluated' : 'no policy yet'}</span>
          </div>
          <Meter value={rate ?? 0} tone={rate == null ? 'neutral' : rate >= 0.8 ? 'ok' : 'warn'} className="mt-1.5" label="Success rate" />
        </div>
        <div className="text-[11.5px] text-fg-subtle lg:text-right">
          <div className="telemetry text-fg-muted">{st?.runs?.length ?? 0} runs</div>
          <div>{lastRun ? fmtAgo(lastRun.at) : 'none yet'}</div>
        </div>
        <ArrowRight className="hidden size-4 text-fg-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ion lg:block" />
      </Link>
    </li>
  )
}

export default function RobotIndexPage() {
  const skills = useSkills()
  const box = useBox()
  const list = useMemo(() => (skills.data ?? []).filter((s) => s.status === 'ready' || s.status === 'processing'), [skills.data])
  const statuses = useRobotStatuses(list.map((s) => s.id))
  const byId = new Map(list.map((s, i) => [s.id, statuses[i]?.data]))
  const all = [...byId.values()].filter(Boolean) as RobotStatus[]
  const trained = all.filter((st) => st.policy.status === 'trained')
  const rates = trained.map((st) => st.policy.success_rate).filter((v): v is number => v != null)
  const ready = rates.filter((v) => v >= 0.8).length
  const gr00tChip = box.data?.chips.find((c) => c.models.some((m) => /gr00t/i.test(m.name)))
  const gr00t = gr00tChip?.models.find((m) => /gr00t/i.test(m.name))
  return (
    <Page testId="page-robotindex">
      <PageHeader
        eyebrow="Do · Robot Lab"
        title="Teach the robot"
        description="Every captured skill becomes a robot program. The lab replays the expert, trains a policy from simulated variations, tests it on scenes it never saw, and runs GR00T on the box as the foundation-model baseline."
      />
      <div className="mb-6 grid gap-px overflow-hidden rounded-lg bg-line sm:grid-cols-2 lg:grid-cols-4" data-testid="robot-stats">
        <div className="bg-ink-850 px-5 py-4">
          <Stat label="Skills with a program" value={list.filter((s, i) => s.status === 'ready' && statuses[i]?.data?.program.length).length} unit={`of ${list.length}`} hint={list.some((s) => s.status === 'processing') ? `${list.filter((s) => s.status === 'processing').length} still processing` : 'pick and place, from the capture'} />
        </div>
        <div className="bg-ink-850 px-5 py-4">
          <Stat label="Policies trained" value={trained.length} hint="behaviour cloning on CPU" />
        </div>
        <div className="bg-ink-850 px-5 py-4">
          <Stat label="Robot-ready" value={ready} unit={rates.length ? `of ${rates.length} evaluated` : undefined} tone={ready ? 'ok' : 'neutral'} hint="at least 80% over randomised trials" />
        </div>
        <div className="flex items-start justify-between bg-ink-850 px-5 py-4">
          <Stat label="GR00T N1.7" value={gr00t ? (gr00t.healthy ? 'Healthy' : 'Down') : '–'} tone={gr00t?.healthy ? 'ok' : gr00t ? 'fault' : 'neutral'} hint="foundation-model baseline" />
          <div className="flex items-center gap-1.5">
            <StatusDot tone={gr00t?.healthy ? 'ok' : 'neutral'} pulse={Boolean(gr00t?.healthy)} />
            <ChipTag chip={gr00tChip?.id ?? 3} />
          </div>
        </div>
      </div>
      {skills.isError ? (
        <Panel>
          <ErrorState error={skills.error} onRetry={() => skills.refetch()} />
        </Panel>
      ) : skills.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Panel>
          <EmptyState icon={<Bot className="size-5" />} title="No skills to teach yet" action={<ButtonLink to="/studio" variant="primary" size="sm">Capture a skill</ButtonLink>}>
            Capture an expert in the Studio; once the skill is processed it has a robot program and shows up here.
          </EmptyState>
        </Panel>
      ) : (
        <Panel pad={false}>
          <div className="hidden grid-cols-[112px_minmax(0,1.5fr)_minmax(0,1.3fr)_168px_150px_92px_20px] gap-x-5 border-b border-line px-4 py-2.5 lg:grid">
            {['', 'Skill', 'Program', 'Readiness', 'Success rate', 'Runs', ''].map((h, i) => (
              <span key={i} className={cn('eyebrow', i === 5 && 'text-right')}>
                {h}
              </span>
            ))}
          </div>
          <ul className="divide-y divide-line" data-testid="robot-skill-list">
            {list.map((s, i) => (
              <RobotSkillRow key={s.id} s={s} st={statuses[i]?.data} loading={statuses[i]?.isLoading ?? true} />
            ))}
          </ul>
        </Panel>
      )}
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-fg-subtle">
        <span className="flex items-center gap-1.5">
          <Cpu className="size-3.5" /> MuJoCo physics and policy training run on the host CPU; GR00T runs on its Tenstorrent chip.
        </span>
        <Link to="/box" className="flex items-center gap-1 text-ion hover:underline">
          See the box <ArrowRight className="size-3" />
        </Link>
      </div>
    </Page>
  )
}
