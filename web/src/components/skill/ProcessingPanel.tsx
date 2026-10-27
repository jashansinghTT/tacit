import { CheckCircle2, Cpu, XCircle } from 'lucide-react'
import type { Job } from '@/lib/api'
import { fmtMs, STAGE_LABEL } from '@/lib/format'
import { Badge, Meter, Panel, Skeleton, Stepper } from '@/components/ui'

/** The F2 pipeline as it runs: each stage, the model and chip that ran it, and timings. */
export function ProcessingPanel({ job, title = 'Processing on the box', className }: { job: Job | null; title?: string; className?: string }) {
  const total = job?.stages.reduce((s, x) => s + (x.ms ?? 0), 0) ?? 0
  return (
    <Panel
      className={className}
      eyebrow={job ? `job ${job.id}` : 'job'}
      title={title}
      actions={
        job &&
        (job.status === 'done' ? (
          <Badge tone="ok" icon={<CheckCircle2 className="size-3" />}>
            Done in {fmtMs(total)}
          </Badge>
        ) : job.status === 'failed' ? (
          <Badge tone="fault" icon={<XCircle className="size-3" />}>
            Failed
          </Badge>
        ) : (
          <Badge tone="ion" dot pulse>
            {STAGE_LABEL[job.stage ?? ''] ?? job.stage ?? 'Queued'}
          </Badge>
        ))
      }
      data-testid="processing-panel"
    >
      {!job ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
      ) : (
        <>
          <div className="mb-5">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-fg-muted">
                <Cpu className="size-3.5 text-ion" /> {job.kind === 'process' ? 'Decode → perceive → events → steps → write → verify → twin → narrate' : job.kind}
              </span>
              <span className="telemetry text-fg">{Math.round(job.progress * 100)}%</span>
            </div>
            <Meter value={job.progress} tone={job.status === 'failed' ? 'fault' : job.status === 'done' ? 'ok' : 'ion'} label="Job progress" height={5} />
          </div>
          <Stepper stages={job.stages} />
          {job.error && <p className="mt-4 rounded-md bg-fault-soft p-3 text-[13px] text-fault">{job.error}</p>}
        </>
      )}
    </Panel>
  )
}
