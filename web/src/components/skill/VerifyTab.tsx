import { lazy, Suspense, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Award, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/cn'
import { api, type Skill, type SkillSummary } from '@/lib/api'
import { qk, usePointcloud, useSkill, useSkills, useJob } from '@/lib/api/queries'
import { fmtDate } from '@/lib/format'
import { Badge, Button, ChipTag, Meter, Panel, ScoreRing, Skeleton, toast } from '@/components/ui'
import { ProcessingPanel } from './ProcessingPanel'

const CloudViewer = lazy(() => import('./TwinViewer').then((m) => ({ default: m.CloudViewer })))

function Numbers({ s }: { s: Skill }) {
  const v = s.verification
  const reproj = v.details.reproj_px
  const stab = v.details.depth_stability
  return (
    <dl className="grid grid-cols-3 gap-3">
      <div>
        <dt className="eyebrow">Views</dt>
        <dd className="telemetry mt-1 text-lg text-fg">{v.details.views ?? '–'}</dd>
      </div>
      <div>
        <dt className="eyebrow">Reprojection</dt>
        <dd className={cn('telemetry mt-1 text-lg', reproj != null && reproj < 3 ? 'text-ok' : 'text-fault')}>{reproj != null ? `${reproj.toFixed(1)} px` : '–'}</dd>
      </div>
      <div>
        <dt className="eyebrow">Depth stability</dt>
        <dd className={cn('telemetry mt-1 text-lg', stab != null && stab > 0.8 ? 'text-ok' : 'text-fault')}>{stab != null ? stab.toFixed(2) : '–'}</dd>
      </div>
    </dl>
  )
}

function CloudCard({ s, label, tone }: { s: Skill; label: string; tone: 'ok' | 'fault' | 'neutral' }) {
  const cloud = usePointcloud(s.verification.pointcloud)
  const v = s.verification
  return (
    <Panel
      pad={false}
      eyebrow={label}
      title={s.title}
      actions={
        <Badge tone={tone} icon={tone === 'ok' ? <ShieldCheck className="size-3" /> : <ShieldAlert className="size-3" />}>
          {v.status === 'verified' ? 'Real camera' : v.status === 'suspect' ? 'Likely AI-made' : 'Pending'}
        </Badge>
      }
    >
      <div className="relative h-72 bg-ink-950">
        {cloud.isLoading ? (
          <Skeleton className="absolute inset-0 rounded-none" />
        ) : cloud.data ? (
          <Suspense fallback={<Skeleton className="absolute inset-0 rounded-none" />}>
            <CloudViewer data={cloud.data.points} className="absolute inset-0" />
          </Suspense>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-xs text-fg-subtle">No point cloud</div>
        )}
        <span className="telemetry absolute top-3 left-3 rounded-xs bg-ink-950/80 px-1.5 py-0.5 text-[10px] text-fg-muted">{cloud.data ? `${cloud.data.count.toLocaleString()} points` : ''}</span>
      </div>
      <div className="flex items-center gap-5 border-t border-line p-4">
        <ScoreRing value={v.score} size={84} stroke={6} sub="score" />
        <div className="min-w-0 flex-1">
          <Numbers s={s} />
        </div>
      </div>
    </Panel>
  )
}

/** F3: VGGT multi-view consistency, this capture next to an AI-made clip. */
export function VerifyTab({ skill }: { skill: Skill }) {
  const qc = useQueryClient()
  const all = useSkills()
  const suspect: SkillSummary | undefined = all.data?.find((s) => s.verification_status === 'suspect' && s.id !== skill.id)
  const verifiedRef: SkillSummary | undefined = all.data?.find((s) => s.verification_status === 'verified' && s.id !== skill.id)
  const otherId = skill.verification.status === 'suspect' ? verifiedRef?.id : suspect?.id
  const other = useSkill(otherId)
  const [jobId, setJobId] = useState<string | null>(null)
  const job = useJob(jobId, (j) => {
    if (j.status === 'done') {
      toast.ok('Verification finished', 'The score and point cloud are up to date.')
      void qc.invalidateQueries({ queryKey: qk.skill(skill.id) })
    } else toast.error('Verification failed', j.error ?? undefined)
  })
  const v = skill.verification
  const verified = v.status === 'verified'
  const rerun = async () => {
    try {
      const r = await api.verify(skill.id)
      setJobId(r.job_id)
    } catch (e) {
      toast.error('Could not start verification', (e as Error).message)
    }
  }
  return (
    <div className="space-y-4" data-tour="verify-panel">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Panel className="overflow-hidden" data-testid="verify-summary">
          <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full blur-3xl" style={{ background: verified ? 'rgb(61 220 151 / 0.12)' : 'rgb(255 93 93 / 0.12)' }} />
          <div className="relative flex items-start gap-6">
            <ScoreRing value={v.score} size={132} stroke={9} sub="vggt score" />
            <div className="min-w-0 pt-2">
              <div className={cn('flex items-center gap-2 text-xl font-medium tracking-tight', verified ? 'text-ok' : v.status === 'suspect' ? 'text-fault' : 'text-fg')}>
                {verified ? <ShieldCheck className="size-5" /> : <ShieldAlert className="size-5" />}
                {verified ? 'Verified real recording' : v.status === 'suspect' ? 'Suspect: does not rebuild as one scene' : 'Not verified yet'}
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
                {v.method}. VGGT rebuilds the scene from {v.details.views ?? 4} views across the clip. A real camera gives one rigid scene with low reprojection error and stable depth for the static background; an AI-made video drifts.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
                <span className="flex items-center gap-1.5">
                  VGGT-1B <ChipTag chip={0} />
                </span>
                <span>· checked {fmtDate(v.checked_at, true)}</span>
              </div>
            </div>
          </div>
          <div className="relative mt-6 space-y-3 border-t border-line pt-5">
            <div>
              <div className="mb-1 flex justify-between text-xs text-fg-subtle">
                <span>Reprojection error (lower is better, pass &lt; 3 px)</span>
                <span className="telemetry text-fg">{v.details.reproj_px?.toFixed(1) ?? '–'} px</span>
              </div>
              <Meter value={1 - Math.min(1, (v.details.reproj_px ?? 10) / 12)} tone={(v.details.reproj_px ?? 99) < 3 ? 'ok' : 'fault'} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-fg-subtle">
                <span>Depth stability of static background (pass &gt; 0.80)</span>
                <span className="telemetry text-fg">{v.details.depth_stability?.toFixed(2) ?? '–'}</span>
              </div>
              <Meter value={v.details.depth_stability ?? 0} tone={(v.details.depth_stability ?? 0) > 0.8 ? 'ok' : 'fault'} />
            </div>
          </div>
          <div className="relative mt-5 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<RefreshCw className="size-3.5" />} onClick={rerun} loading={Boolean(jobId && job?.status !== 'done' && job?.status !== 'failed')} data-testid="verify-rerun">
              Run verification again
            </Button>
          </div>
        </Panel>
        {verified ? (
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
        ) : jobId ? (
          <ProcessingPanel job={job} title="Verifying" />
        ) : (
          <Panel title="What this means">
            <p className="text-[13px] leading-relaxed text-fg-muted">
              Suspect skills cannot be listed on the Skill Exchange. If this is a real recording, capture again with the camera fixed and the background in view, then run verification again.
            </p>
          </Panel>
        )}
      </div>
      {jobId && verified && <ProcessingPanel job={job} title="Verifying" />}
      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-fg">Real versus AI-made</h3>
          <span className="text-xs text-fg-subtle">Drag to orbit each rebuild</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2" data-testid="verify-compare">
          <CloudCard s={skill} label="This capture" tone={verified ? 'ok' : v.status === 'suspect' ? 'fault' : 'neutral'} />
          {other.data ? (
            <CloudCard s={other.data} label={other.data.verification.status === 'suspect' ? 'AI-generated clip, same task' : 'A verified real capture'} tone={other.data.verification.status === 'verified' ? 'ok' : 'fault'} />
          ) : (
            <Skeleton className="h-[420px] rounded-xl" />
          )}
        </div>
      </div>
    </div>
  )
}
