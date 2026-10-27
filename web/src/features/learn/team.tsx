import { Link } from 'react-router-dom'
import { Award, Bot, Check, ExternalLink, GraduationCap, Minus } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { SkillSummary, User } from '@/lib/api'
import type { ProgressEntry, RobotReadiness } from '@/lib/api/learn'
import { fmtAgo, fmtDuration } from '@/lib/format'
import { Avatar, Badge, ButtonLink, Meter, SkillStatusBadge, Skeleton, VerifiedBadge } from '@/components/ui'
import { StepSegments } from './LessonCard'

export interface Trainee {
  id: string
  name: string
  title?: string
  avatar?: string
}

function scoreClass(v: number | null | undefined) {
  if (v == null) return 'text-fg-faint'
  return v >= 0.8 ? 'text-ok' : v >= 0.6 ? 'text-warn' : 'text-fault'
}

function Cell({ row }: { row: ProgressEntry | undefined }) {
  if (!row)
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-faint">
        <Minus className="size-3" /> not started
      </span>
    )
  return (
    <div className="flex min-w-[136px] flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[11.5px]">
        {row.passed ? (
          <Badge tone="ok" icon={<GraduationCap className="size-3" />}>
            Certified
          </Badge>
        ) : (
          <Badge tone="ion">
            {row.steps_done}/{row.steps_total} steps
          </Badge>
        )}
        <span className={cn('telemetry', scoreClass(row.best_score))} title="Best practice match">
          {row.best_score ? Math.round(row.best_score * 100) : '–'}
        </span>
        {row.quiz_score != null && (
          <span className="telemetry text-fg-subtle" title="Quiz score">
            quiz {Math.round(row.quiz_score * 100)}%
          </span>
        )}
        {row.certificate && (
          <a href={row.certificate} target="_blank" rel="noreferrer" className="ml-auto text-fg-subtle hover:text-ion" title="Open the certificate" data-testid="matrix-certificate">
            <Award className="size-3.5" />
          </a>
        )}
      </div>
      <StepSegments done={row.steps_done} total={row.steps_total} />
    </div>
  )
}

/** Trainees down, skills across: what each person has practised, their best match, quiz and certificate. */
export function ProgressMatrix({ trainees, skills, rows }: { trainees: Trainee[]; skills: SkillSummary[]; rows: ProgressEntry[] }) {
  const at = (t: string, s: string) => rows.find((r) => r.trainee.id === t && r.skill_id === s)
  return (
    <div className="overflow-x-auto" data-testid="progress-matrix">
      <table className="w-full border-separate border-spacing-0 bg-ink-800 text-left">
        <thead>
          <tr>
            <th scope="col" className="eyebrow sticky left-0 z-10 min-w-[190px] border-b border-line bg-ink-800 px-4 py-2.5 font-normal">
              Trainee
            </th>
            {skills.map((s) => (
              <th key={s.id} scope="col" className="min-w-[160px] border-b border-line px-4 py-2.5 align-bottom font-normal">
                <Link to={`/learn/${s.id}`} className="line-clamp-2 text-[12.5px] font-medium text-fg-muted hover:text-fg">
                  {s.title}
                </Link>
                <span className="telemetry text-[10.5px] text-fg-faint">{s.steps_count} steps</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trainees.map((t) => {
            const mine = rows.filter((r) => r.trainee.id === t.id)
            const certified = mine.filter((r) => r.passed).length
            return (
              <tr key={t.id} data-testid={`matrix-row-${t.id}`}>
                <th scope="row" className="sticky left-0 z-10 border-b border-line bg-ink-800 px-4 py-3 font-normal">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={t.name} src={t.avatar} size={30} />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium text-fg">{t.name}</div>
                      <div className="truncate text-[11px] text-fg-subtle">
                        {certified}/{skills.length} certified{t.title ? ` · ${t.title}` : ''}
                      </div>
                    </div>
                  </div>
                </th>
                {skills.map((s) => (
                  <td key={s.id} className="border-b border-line px-4 py-3 align-middle">
                    <Cell row={at(t.id, s.id)} />
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function Activity({ rows }: { rows: ProgressEntry[] }) {
  if (!rows.length) return <p className="px-4 py-6 text-[13px] text-fg-subtle">Nothing yet. Activity shows up as soon as a trainee practises a step.</p>
  return (
    <ol className="divide-y divide-line" data-testid="team-activity">
      {rows.slice(0, 8).map((r) => (
        <li key={`${r.trainee.id}-${r.skill_id}`} className="flex items-start gap-3 px-4 py-3">
          <Avatar name={r.trainee.name} size={26} className="mt-0.5" />
          <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
            <p className="text-fg-muted">
              <span className="font-medium text-fg">{r.trainee.name}</span> {r.passed ? 'earned the certificate for' : `practised ${r.steps_done} of ${r.steps_total} steps of`}{' '}
              <Link to={`/learn/${r.skill_id}`} className="text-fg hover:text-ion">
                {r.skill_title || r.skill_id}
              </Link>
            </p>
            <p className="telemetry mt-0.5 text-[10.5px] text-fg-subtle">
              {fmtAgo(r.updated_at)}
              {r.best_score ? ` · best match ${Math.round(r.best_score * 100)}` : ''}
              {r.quiz_score != null ? ` · quiz ${Math.round(r.quiz_score * 100)}%` : ''}
            </p>
          </div>
          {r.passed && <Check className="mt-1 size-4 shrink-0 text-ok" />}
        </li>
      ))}
    </ol>
  )
}

const POLICY: Record<string, { tone: 'neutral' | 'ion' | 'ok' | 'fault'; label: string }> = {
  untrained: { tone: 'neutral', label: 'Not trained' },
  training: { tone: 'ion', label: 'Training' },
  trained: { tone: 'ok', label: 'Trained' },
  failed: { tone: 'fault', label: 'Training failed' },
}

export const ROBOT_TARGET = 0.8

export function isRobotReady(r: RobotReadiness | undefined) {
  return Boolean(r && r.policy.status === 'trained' && (r.policy.success_rate ?? 0) >= ROBOT_TARGET)
}

function RobotCell({ data, loading }: { data: RobotReadiness | undefined; loading: boolean }) {
  if (loading) return <Skeleton className="h-8 w-40" />
  if (!data) return <span className="text-[11.5px] text-fg-faint">unavailable</span>
  const p = POLICY[data.policy.status] ?? POLICY.untrained
  const rate = data.policy.success_rate
  return (
    <div className="flex min-w-[190px] flex-col gap-1.5" data-testid="robot-cell">
      <div className="flex items-center gap-2">
        <Badge tone={p.tone} dot={data.policy.status === 'training'} pulse={data.policy.status === 'training'}>
          {p.label}
        </Badge>
        {isRobotReady(data) && (
          <Badge tone="ok" icon={<Bot className="size-3" />}>
            Robot-ready
          </Badge>
        )}
        <span className="telemetry ml-auto text-[11px] text-fg-muted">{rate == null ? '–' : `${Math.round(rate * 100)}%`}</span>
      </div>
      <div className="relative" title={`Success rate in sim; the target is ${ROBOT_TARGET * 100}%`}>
        <Meter value={rate ?? 0} tone={rate == null ? 'neutral' : rate >= ROBOT_TARGET ? 'ok' : 'warn'} height={4} label="Sim success rate" />
        <span className="absolute -top-0.5 h-2 w-px bg-fg-subtle" style={{ left: `${ROBOT_TARGET * 100}%` }} aria-hidden />
      </div>
      <span className="telemetry text-[10.5px] text-fg-subtle">
        {data.policy.trials ? `${data.policy.trials} trials` : 'not evaluated'} · {data.runs.length} run{data.runs.length === 1 ? '' : 's'}
        {data.program.length ? ` · ${data.program.length} actions` : ''}
      </span>
    </div>
  )
}


/** Every captured skill with its verification, who has learned it, and whether a robot can do it. */
export function SkillsTable({
  skills,
  rows,
  robot,
}: {
  skills: SkillSummary[]
  rows: ProgressEntry[]
  robot: Map<string, { data: RobotReadiness | undefined; loading: boolean }>
}) {
  return (
    <div className="overflow-x-auto" data-testid="skills-table">
      <table className="w-full min-w-[980px] text-left">
        <thead>
          <tr className="eyebrow border-b border-line">
            <th scope="col" className="px-4 py-2.5 font-normal">Skill</th>
            <th scope="col" className="px-4 py-2.5 font-normal">Status</th>
            <th scope="col" className="px-4 py-2.5 font-normal">Provenance</th>
            <th scope="col" className="px-4 py-2.5 font-normal">Trainees</th>
            <th scope="col" className="px-4 py-2.5 font-normal">Robot readiness</th>
            <th scope="col" className="px-4 py-2.5 font-normal">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {skills.map((s) => {
            const mine = rows.filter((r) => r.skill_id === s.id)
            const certified = mine.filter((r) => r.passed).length
            const r = robot.get(s.id)
            return (
              <tr key={s.id} className="align-middle transition-colors hover:bg-white/[0.015]" data-testid={`skill-row-${s.id}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="h-10 w-16 shrink-0 overflow-hidden rounded-sm bg-ink-700 shadow-[inset_0_0_0_1px_var(--color-line)]">
                      {s.thumb && <img src={s.thumb} alt="" className="size-full object-cover" loading="lazy" />}
                    </span>
                    <div className="min-w-0">
                      <Link to={`/skills/${s.id}`} className="line-clamp-1 text-[13px] font-medium text-fg hover:text-ion">
                        {s.title}
                      </Link>
                      <div className="mt-0.5 text-[11px] text-fg-subtle">
                        {s.expert.name} · {s.steps_count} steps · <span className="telemetry">{fmtDuration(s.duration)}</span> · {fmtAgo(s.created_at)}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <SkillStatusBadge status={s.status} />
                </td>
                <td className="px-4 py-3">
                  <VerifiedBadge status={s.verification_status} />
                </td>
                <td className="px-4 py-3">
                  {s.status === 'ready' ? (
                    <div className="text-[12px] text-fg-muted">
                      <span className="telemetry text-fg">{certified}</span> certified
                      <span className="text-fg-faint"> · </span>
                      <span className="telemetry text-fg">{mine.length}</span> started
                    </div>
                  ) : (
                    <span className="text-[11.5px] text-fg-faint">after processing</span>
                  )}
                </td>
                <td className="px-4 py-3">{s.status === 'ready' ? <RobotCell data={r?.data} loading={Boolean(r?.loading)} /> : <span className="text-[11.5px] text-fg-faint">after processing</span>}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    {s.status === 'ready' && (
                      <ButtonLink to={`/learn/${s.id}`} size="xs" variant="ghost">
                        Lesson
                      </ButtonLink>
                    )}
                    {s.status === 'ready' && (
                      <ButtonLink to={`/robot/${s.id}`} size="xs" variant="ghost" iconRight={<ExternalLink className="size-3" />}>
                        Robot Lab
                      </ButtonLink>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function traineesFrom(users: User[] | undefined, rows: ProgressEntry[]): Trainee[] {
  const out = new Map<string, Trainee>()
  for (const u of users ?? []) if (u.role === 'trainee') out.set(u.id, { id: u.id, name: u.name, title: u.title, avatar: u.avatar })
  for (const r of rows) {
    if (!out.has(r.trainee.id)) {
      const u = users?.find((x) => x.id === r.trainee.id)
      out.set(r.trainee.id, { id: r.trainee.id, name: r.trainee.name, title: r.trainee.title ?? u?.title, avatar: u?.avatar })
    }
  }
  return [...out.values()]
}
