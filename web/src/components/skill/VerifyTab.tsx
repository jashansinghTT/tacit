import { lazy, Suspense, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Award, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/cn'
import { api, type Skill, type VerificationStatus } from '@/lib/api'
import { qk, usePointcloud, useJob, useSampleVerify, useSamples } from '@/lib/api/queries'
import { fmtDate } from '@/lib/format'
import { Badge, Button, ChipTag, Meter, Panel, ScoreRing, Skeleton, toast } from '@/components/ui'
import { ProcessingPanel } from './ProcessingPanel'
import { cloudView, type View } from './twinView'

const CloudViewer = lazy(() => import('./TwinViewer').then((m) => ({ default: m.CloudViewer })))

interface Metric {
  key: string
  label: string
  hint: string
  format: (v: number) => string
  /** 0..1 bar fill, where a full bar is good. */
  bar: (v: number) => number
  pass: (v: number) => boolean
}

// What VGGT's multi-view check measures. The backend reports whichever of these it computed.
const METRICS: Metric[] = [
  { key: 'reproj_rel', label: 'Reprojection error', hint: 'relative, lower is better, pass < 5%', format: (v) => `${(v * 100).toFixed(1)}%`, bar: (v) => 1 - Math.min(1, v / 0.15), pass: (v) => v < 0.05 },
  { key: 'reproj_px', label: 'Reprojection error', hint: 'pixels, lower is better, pass < 3 px', format: (v) => `${v.toFixed(1)} px`, bar: (v) => 1 - Math.min(1, v / 12), pass: (v) => v < 3 },
  { key: 'camera_drift', label: 'Camera drift', hint: 'static background moving between views, pass < 0.05', format: (v) => v.toFixed(4), bar: (v) => 1 - Math.min(1, v / 0.25), pass: (v) => v < 0.05 },
  { key: 'depth_stability', label: 'Depth stability', hint: 'static background, higher is better, pass > 0.90', format: (v) => v.toFixed(3), bar: (v) => Math.max(0, Math.min(1, v)), pass: (v) => v > 0.9 },
]

function metricsOf(details: Record<string, unknown>) {
  return METRICS.filter((m) => typeof details[m.key] === 'number' && Number.isFinite(details[m.key] as number)).map((m) => ({ ...m, value: details[m.key] as number }))
}

function MetricBars({ details, compact }: { details: Record<string, unknown>; compact?: boolean }) {
  const ms = metricsOf(details)
  if (!ms.length) return <p className="text-xs text-fg-subtle">No per-view numbers yet.</p>
  return (
    <div className={cn(compact ? 'space-y-2' : 'space-y-3')}>
      {ms.map((m) => (
        <div key={m.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs text-fg-subtle">
            <span>
              {m.label}
              {!compact && <span className="text-fg-faint"> · {m.hint}</span>}
            </span>
            <span className={cn('telemetry', m.pass(m.value) ? 'text-ok' : 'text-fault')}>{m.format(m.value)}</span>
          </div>
          <Meter value={m.bar(m.value)} tone={m.pass(m.value) ? 'ok' : 'fault'} label={m.label} />
        </div>
      ))}
    </div>
  )
}

interface CloudSubject {
  title: string
  label: string
  status: VerificationStatus
  score: number | null
  details: Record<string, unknown>
  pointcloud: string | null
  view?: View
  viewLoading?: boolean
}

function CloudCard({ s }: { s: CloudSubject }) {
  const cloud = usePointcloud(s.pointcloud)
  const view = s.view ?? cloudView(cloud.data?.points)
  const tone = s.status === 'verified' ? 'ok' : s.status === 'suspect' ? 'fault' : 'neutral'
  return (
    <Panel
      pad={false}
      eyebrow={s.label}
      title={s.title}
      actions={
        <Badge tone={tone} icon={tone === 'ok' ? <ShieldCheck className="size-3" /> : <ShieldAlert className="size-3" />}>
          {s.status === 'verified' ? 'Real camera' : s.status === 'suspect' ? 'Likely AI-made' : 'Pending'}
        </Badge>
      }
    >
      <div className="relative h-72 bg-ink-950">
        {cloud.isLoading || s.viewLoading ? (
          <Skeleton className="absolute inset-0 rounded-none" />
        ) : cloud.data ? (
          <Suspense fallback={<Skeleton className="absolute inset-0 rounded-none" />}>
            <CloudViewer data={cloud.data.points} view={view} className="absolute inset-0" />
          </Suspense>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-xs text-fg-subtle">No point cloud</div>
        )}
        <span className="telemetry absolute top-3 left-3 rounded-xs bg-ink-950/80 px-1.5 py-0.5 text-[10px] text-fg-muted">{cloud.data ? `${cloud.data.count.toLocaleString()} points` : ''}</span>
      </div>
      <div className="flex items-center gap-5 border-t border-line p-4">
        <ScoreRing value={s.score} size={84} stroke={6} sub="score" tone={tone === 'neutral' ? undefined : tone} />
        <div className="min-w-0 flex-1">
          <MetricBars details={s.details} compact />
        </div>
      </div>
    </Panel>
  )
}

/** F3: VGGT multi-view consistency for this capture, next to a clip of the opposite kind. */
export function VerifyTab({ skill }: { skill: Skill }) {
  const qc = useQueryClient()
  const samples = useSamples()
  const v = skill.verification
  const verified = v.status === 'verified'
  // Compare a real capture with the AI-made sample, and a suspect one with a real sample.
  const other = samples.data?.find((s) => (v.status === 'suspect' ? s.kind === 'real' : s.kind === 'ai-generated'))
  const otherVerify = useSampleVerify(other?.id)
  const [jobId, setJobId] = useState<string | null>(null)
  const job = useJob(jobId, (j) => {
    if (j.status === 'done') {
      toast.ok('Verification finished', 'The score and point cloud are up to date.')
      void qc.invalidateQueries({ queryKey: qk.skill(skill.id) })
    } else toast.error('Verification failed', j.error ?? undefined)
  })
  const running = Boolean(jobId && job?.status !== 'done' && job?.status !== 'failed')
  const rerun = async () => {
    try {
      const r = await api.verify(skill.id)
      setJobId(r.job_id)
    } catch (e) {
      toast.error('Could not start verification', (e as Error).message)
    }
  }
  const mine: CloudSubject = useMemo(
    () => ({ title: skill.title, label: 'This capture', status: v.status, score: v.score, details: v.details, pointcloud: v.pointcloud }),
    [skill.title, v],
  )
  return (
    <div className="space-y-4" data-tour="verify-panel">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="overflow-hidden" data-testid="verify-summary">
          <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full blur-3xl" style={{ background: verified ? 'rgb(61 220 151 / 0.12)' : v.status === 'suspect' ? 'rgb(255 93 93 / 0.12)' : 'transparent' }} />
          <div className="relative flex items-start gap-6">
            <ScoreRing value={v.score} size={132} stroke={9} sub="vggt score" />
            <div className="min-w-0 pt-2">
              <div className={cn('flex items-center gap-2 text-xl font-medium tracking-tight', verified ? 'text-ok' : v.status === 'suspect' ? 'text-fault' : 'text-fg')}>
                {verified ? <ShieldCheck className="size-5" /> : <ShieldAlert className="size-5" />}
                {verified ? 'Verified real recording' : v.status === 'suspect' ? 'Suspect: it does not rebuild as one scene' : 'Not verified yet'}
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
                {v.method}. VGGT rebuilds the scene from {v.details.views || 4} views across the clip. A real camera gives one rigid scene: low reprojection error and a background that stays put. An AI-made video drifts.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
                <span className="flex items-center gap-1.5">
                  VGGT-1B <ChipTag chip={0} />
                </span>
                {v.checked_at && <span>· checked {fmtDate(v.checked_at, true)}</span>}
              </div>
            </div>
          </div>
          <div className="relative mt-6 border-t border-line pt-5">
            <MetricBars details={v.details} />
          </div>
          <div className="relative mt-5 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<RefreshCw className="size-3.5" />} onClick={rerun} loading={running} data-testid="verify-rerun">
              Run verification again
            </Button>
          </div>
        </Panel>
        {jobId && job?.status !== 'done' ? (
          <ProcessingPanel job={job} title="Verifying" />
        ) : verified ? (
          <Panel title="Verification certificate" actions={<Award className="size-4 text-ok" />} data-testid="certificate">
            <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-ink-750 to-ink-850 p-6 shadow-[inset_0_0_0_1px_rgb(61_220_151/0.25)]">
              <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #3ddc97 0 1px, transparent 1px 12px)' }} />
              <div className="relative">
                <div className="eyebrow text-ok">Tacit provenance certificate</div>
                <div className="mt-3 text-2xl font-medium tracking-tight text-fg">{skill.title}</div>
                <div className="mt-1 text-[13px] text-fg-muted">
                  Recorded by {skill.expert.name} · {fmtDate(skill.created_at)}
                </div>
                <div className="mt-6 grid grid-cols-2 gap-4 text-[13px] sm:grid-cols-4">
                  {[
                    ['Score', v.score?.toFixed(2) ?? '–'],
                    ['Method', 'VGGT-1B'],
                    ['Consent', skill.consent.signed_by ? 'Signed' : 'Missing'],
                    ['Raw video', 'Not shared'],
                  ].map(([k, val]) => (
                    <div key={k}>
                      <div className="eyebrow">{k}</div>
                      <div className="mt-1 text-fg">{val}</div>
                    </div>
                  ))}
                </div>
                <div className="telemetry mt-6 text-[10px] text-fg-faint">
                  {skill.id} · checked {v.checked_at ?? '–'}
                </div>
              </div>
            </div>
          </Panel>
        ) : (
          <Panel title="What this means">
            <p className="text-[13px] leading-relaxed text-fg-muted">
              {v.status === 'suspect'
                ? 'Suspect skills cannot be listed on the Skill Exchange. If this is a real recording, capture again with the camera fixed and the background in view, then run verification again.'
                : 'Verification runs as part of processing. Run it now to check this capture.'}
            </p>
          </Panel>
        )}
      </div>
      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-fg">Real versus AI-made</h3>
          <span className="text-xs text-fg-subtle">Same check, two clips. Drag to orbit each rebuild.</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2" data-testid="verify-compare">
          <CloudCard s={mine} />
          {otherVerify.data && other ? (
            <CloudCard
              s={{
                title: other.title,
                label: other.kind === 'ai-generated' ? 'AI-generated sample clip' : 'A real sample clip',
                status: otherVerify.data.status,
                score: otherVerify.data.score,
                details: otherVerify.data.details,
                pointcloud: otherVerify.data.pointcloud,
              }}
            />
          ) : otherVerify.isError || (samples.data && !other) ? (
            <Panel>
              <p className="py-10 text-center text-xs text-fg-subtle">No comparison clip on this box yet.</p>
            </Panel>
          ) : (
            <Skeleton className="h-[420px] rounded-xl" />
          )}
        </div>
      </div>
    </div>
  )
}
