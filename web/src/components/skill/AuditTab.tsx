import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeftRight, Check, ClipboardCheck, Eye, EyeOff, FileVideo, Play, Upload, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { api, type Audit, type AuditStep, type Skill } from '@/lib/api'
import { useAudit, useAudits, useJob } from '@/lib/api/queries'
import { fmtAgo, fmtClock, fmtDate } from '@/lib/format'
import { Badge, Button, EmptyState, Meter, Panel, ScoreRing, Skeleton, TextInput, toast, type Tone } from '@/components/ui'
import { ProcessingPanel } from './ProcessingPanel'

const STATUS: Record<AuditStep['status'], { label: string; tone: Tone; bar: string; icon: typeof Check }> = {
  done: { label: 'Done', tone: 'ok', bar: 'shadow-[inset_3px_0_0_var(--color-ok)]', icon: Check },
  out_of_order: { label: 'Out of order', tone: 'warn', bar: 'shadow-[inset_3px_0_0_var(--color-warn)]', icon: ArrowLeftRight },
  missing: { label: 'Missing', tone: 'fault', bar: 'shadow-[inset_3px_0_0_var(--color-fault)]', icon: X },
}

function NewAudit({ skill, onStarted }: { skill: Skill; onStarted: (jobId: string, auditId: string) => void }) {
  const [worker, setWorker] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const start = async () => {
    if (!file) return
    setBusy(true)
    try {
      const r = await api.startAudit(skill.id, file, worker.trim() || 'Unnamed worker')
      onStarted(r.job_id, r.audit_id)
      setFile(null)
    } catch (e) {
      toast.error('Could not start the audit', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f?.type.startsWith('video/')) setFile(f)
    else if (f) toast.warn('That is not a video file')
  }
  return (
    <Panel title="Audit a run" eyebrow="quality and safety" data-testid="audit-new">
      <p className="text-[13px] leading-relaxed text-fg-muted">
        Upload a worker's recorded run. Tacit tracks it with the same models, lines it up with {skill.expert.name.split(' ')[0]}'s steps, and reports what was skipped, swapped, or done without looking.
      </p>
      <div className="mt-4 space-y-3">
        <TextInput placeholder="Worker's name" value={worker} onChange={(e) => setWorker(e.target.value)} aria-label="Worker's name" data-testid="audit-worker" />
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          onClick={() => input.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
          className={cn('flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-4 py-4 transition-colors', over ? 'border-ion bg-ion/[0.05]' : 'border-line-strong hover:bg-white/[0.02]')}
          data-testid="audit-drop"
        >
          {file ? <FileVideo className="size-5 text-ion" /> : <Upload className="size-5 text-fg-subtle" />}
          <div className="min-w-0 flex-1 text-[13px]">
            <div className="truncate text-fg">{file ? file.name : 'Drop the run video here, or choose a file'}</div>
            <div className="text-xs text-fg-subtle">{file ? `${(file.size / 1e6).toFixed(1)} MB` : 'Recorded on the line, from roughly the same angle as the expert'}</div>
          </div>
          <input ref={input} type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} data-testid="audit-file" />
        </div>
        <Button variant="primary" icon={<ClipboardCheck className="size-4" />} onClick={start} loading={busy} disabled={!file} className="w-full" data-testid="audit-start">
          Compare with the expert
        </Button>
      </div>
    </Panel>
  )
}

function SideVideo({ label, src, seekTo, seekKey, testId }: { label: string; src: string | null | undefined; seekTo: number | null; seekKey: number; testId: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = ref.current
    if (!v || seekTo === null) return
    v.currentTime = seekTo
    void v.play().catch(() => undefined)
  }, [seekTo, seekKey])
  return (
    <figure className="min-w-0">
      <figcaption className="eyebrow mb-2">{label}</figcaption>
      <div className="relative aspect-video overflow-hidden rounded-lg bg-ink-950 shadow-[inset_0_0_0_1px_var(--color-line)]">
        {src ? <video ref={ref} src={src} className="size-full object-contain" controls muted playsInline preload="metadata" data-testid={testId} /> : <div className="grid size-full place-items-center text-xs text-fg-subtle">No video</div>}
      </div>
    </figure>
  )
}

/** The expert's gaze targets for the step, each marked by whether the worker looked there too. */
function GazeCell({ g }: { g: AuditStep['gaze_check'] }) {
  if (!g || (!g.expert_looked_at.length && !g.worker_looked_at.length)) return <span className="text-xs text-fg-faint">–</span>
  const seen = new Set(g.worker_looked_at)
  const extra = g.worker_looked_at.filter((x) => !g.expert_looked_at.includes(x))
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        {g.ok === null ? <Eye className="size-3.5 text-fg-faint" /> : g.ok ? <Eye className="size-3.5 text-ok" /> : <EyeOff className="size-3.5 text-warn" />}
        {g.expert_looked_at.map((t) => (
          <span key={t} className={cn('rounded-xs px-1.5 py-px text-[11px]', !g.worker_looked_at.length ? 'bg-white/[0.05] text-fg-subtle' : seen.has(t) ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn')} title={seen.has(t) ? 'the worker looked here too' : 'the worker did not look here'}>
            {t}
          </span>
        ))}
      </div>
      {extra.length > 0 && <div className="text-[11px] text-fg-faint">worker also: {extra.join(', ')}</div>}
    </div>
  )
}

function Seconds({ expert, run }: { expert: number | null; run: number | null }) {
  if (expert === null && run === null) return <span className="text-fg-faint">–</span>
  const slower = expert && run ? run / expert : null
  return (
    <span className="telemetry text-xs whitespace-nowrap">
      <span className="text-fg-muted">{expert?.toFixed(1) ?? '–'} s</span>
      <span className="mx-1 text-fg-faint">vs</span>
      <span className={cn(run === null ? 'text-fg-faint' : slower && slower > 1.5 ? 'text-warn' : 'text-fg')}>{run?.toFixed(1) ?? '–'} s</span>
    </span>
  )
}

function AuditReport({ skill, audit }: { skill: Skill; audit: Audit }) {
  const [seek, setSeek] = useState<{ expert: number | null; worker: number | null; key: number }>({ expert: null, worker: null, key: 0 })
  const s = audit.summary
  const tone: Tone = !s?.score ? 'neutral' : s.score >= 0.8 ? 'ok' : s.score >= 0.6 ? 'warn' : 'fault'
  const go = (st: AuditStep) => {
    const exp = skill.steps.find((x) => x.index === st.index)
    setSeek((k) => ({ expert: exp?.t_start ?? null, worker: st.run_t, key: k.key + 1 }))
  }
  return (
    <div className="space-y-4" data-testid="audit-report">
      <Panel className="overflow-hidden">
        <div className="pointer-events-none absolute -top-24 -left-16 size-72 rounded-full blur-3xl" style={{ background: tone === 'ok' ? 'rgb(61 220 151 / 0.1)' : tone === 'warn' ? 'rgb(255 181 71 / 0.1)' : 'rgb(255 93 93 / 0.1)' }} />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center">
          <ScoreRing value={s?.score ?? null} size={116} stroke={8} sub="match" tone={tone === 'neutral' ? undefined : tone} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
              <span className="text-sm font-medium text-fg">{audit.worker}</span>
              <span>· {fmtDate(audit.created_at, true)}</span>
              <span>· against {skill.expert.name}</span>
            </div>
            <p className="mt-2 text-[15px] leading-relaxed text-fg" data-testid="audit-narrative">
              {audit.narrative ?? 'No narrative yet.'}
            </p>
            {s && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge tone="ok" size="md" icon={<Check className="size-3" />}>
                  {s.done} done
                </Badge>
                <Badge tone={s.out_of_order ? 'warn' : 'neutral'} size="md" icon={<ArrowLeftRight className="size-3" />}>
                  {s.out_of_order} out of order
                </Badge>
                <Badge tone={s.missing ? 'fault' : 'neutral'} size="md" icon={<X className="size-3" />}>
                  {s.missing} missing
                </Badge>
                <Badge tone={s.gaze_checks_ok < s.steps_total - s.missing ? 'warn' : 'ok'} size="md" icon={<Eye className="size-3" />}>
                  {s.gaze_checks_ok} of {s.steps_total - s.missing} gaze checks passed
                </Badge>
              </div>
            )}
          </div>
        </div>
      </Panel>

      <Panel title="Worker and expert, side by side" eyebrow="pick a step to jump both videos to it">
        <div className="grid gap-4 md:grid-cols-2">
          <SideVideo label={`${audit.worker}'s run`} src={audit.video} seekTo={seek.worker} seekKey={seek.key} testId="audit-video-worker" />
          <SideVideo label={`${skill.expert.name}, the expert`} src={skill.source.video} seekTo={seek.expert} seekKey={seek.key} testId="audit-video-expert" />
        </div>
      </Panel>

      <Panel title="Step by step" eyebrow={`${audit.steps.length} expert steps`} pad={false} data-testid="audit-steps">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[10px] tracking-wider text-fg-faint uppercase">
                <th className="py-2.5 pr-2 pl-5 font-medium">Step</th>
                <th className="px-2 py-2.5 font-medium">Status</th>
                <th className="px-2 py-2.5 font-medium">Match</th>
                <th className="px-2 py-2.5 font-medium">Expert vs worker</th>
                <th className="px-2 py-2.5 font-medium">Gaze: where the expert looked</th>
                <th className="py-2.5 pr-5 pl-2 text-right font-medium">Jump</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {audit.steps.map((st) => {
                const meta = STATUS[st.status] ?? STATUS.done
                const Icon = meta.icon
                const g = st.gaze_check
                return (
                  <tr key={st.index} className={cn('transition-colors hover:bg-white/[0.02]', meta.bar, st.status === 'missing' && 'bg-fault/[0.03]')} data-testid={`audit-step-${st.index}`} data-status={st.status}>
                    <td className="py-3 pr-2 pl-5">
                      <span className="telemetry mr-2 text-fg-faint">{String(st.index).padStart(2, '0')}</span>
                      <span className="text-fg">{st.title}</span>
                    </td>
                    <td className="px-2 py-3">
                      <Badge tone={meta.tone} icon={<Icon className="size-3" />}>
                        {meta.label}
                      </Badge>
                    </td>
                    <td className="w-40 px-2 py-3">{st.score === null ? <span className="text-fg-faint">–</span> : <Meter value={st.score} tone={st.score >= 0.8 ? 'ok' : st.score >= 0.6 ? 'warn' : 'fault'} showValue label={`Step ${st.index} match`} />}</td>
                    <td className="px-2 py-3">
                      <Seconds expert={st.expert_seconds} run={st.run_seconds} />
                    </td>
                    <td className="px-2 py-3">
                      <GazeCell g={g} />
                    </td>
                    <td className="py-3 pr-5 pl-2 text-right">
                      <button onClick={() => go(st)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-fg-muted hover:bg-white/5 hover:text-ion" aria-label={`Jump to step ${st.index}`}>
                        <Play className="size-3 fill-current" />
                        {st.run_t !== null ? fmtClock(st.run_t) : 'expert'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}

/** Use case 5: compare a worker's recorded run with the expert's skill. */
export function AuditTab({ skill }: { skill: Skill }) {
  const qc = useQueryClient()
  const audits = useAudits(skill.id)
  const [selected, setSelected] = useState<string | null>(null)
  const [running, setRunning] = useState<{ jobId: string; auditId: string } | null>(null)
  const job = useJob(running?.jobId, (j) => {
    void qc.invalidateQueries({ queryKey: ['audits', skill.id] })
    if (j.status === 'done' && running) {
      setSelected(running.auditId)
      setRunning(null)
      toast.ok('Audit ready', 'The step table and narrative are below.')
    } else if (j.status === 'failed') toast.error('Audit failed', j.error ?? undefined)
  })
  const current = selected ?? audits.data?.[0]?.id ?? null
  const audit = useAudit(skill.id, running ? null : current)
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(300px,4fr)_minmax(0,8fr)]">
      <div className="space-y-4">
        <NewAudit skill={skill} onStarted={(jobId, auditId) => setRunning({ jobId, auditId })} />
        <Panel title="Past audits" pad={false} data-testid="audit-list">
          {audits.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : !audits.data?.length ? (
            <p className="px-4 py-6 text-center text-xs text-fg-subtle">No audits yet for this skill.</p>
          ) : (
            <ul className="divide-y divide-line">
              {audits.data.map((a) => {
                const on = a.id === current && !running
                const sm = a.summary
                return (
                  <li key={a.id}>
                    <button onClick={() => setSelected(a.id)} className={cn('flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]', on && 'bg-ion/[0.06]')} data-testid={`audit-item-${a.id}`}>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-fg">{a.worker}</div>
                        <div className="text-[11px] text-fg-subtle">{fmtAgo(a.created_at)}</div>
                      </div>
                      {sm && (
                        <div className="flex items-center gap-1.5">
                          {sm.missing > 0 && <span className="size-2 rounded-full bg-fault" title={`${sm.missing} missing`} />}
                          {sm.out_of_order > 0 && <span className="size-2 rounded-full bg-warn" title={`${sm.out_of_order} out of order`} />}
                          <span className="telemetry text-xs text-fg-muted">{sm.score !== null ? Math.round(sm.score * 100) : '–'}</span>
                        </div>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>
      <div className="min-w-0">
        {running ? (
          <ProcessingPanel job={job} title="Comparing the run with the expert" />
        ) : audit.data ? (
          <AuditReport skill={skill} audit={audit.data} />
        ) : audit.isLoading ? (
          <Skeleton className="h-[480px] rounded-xl" />
        ) : (
          <Panel>
            <EmptyState icon={<AlertTriangle className="size-5" />} title="No run audited yet">
              Upload a worker's run on the left. You get each of the expert's steps marked done, out of order or missing, how long it took, and whether the worker looked where the expert did.
            </EmptyState>
          </Panel>
        )}
      </div>
    </div>
  )
}
