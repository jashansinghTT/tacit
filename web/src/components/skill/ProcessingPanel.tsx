import { CheckCircle2, Cpu, XCircle } from 'lucide-react'
import type { Job } from '@/lib/api'
import { fmtMs, STAGE_LABEL } from '@/lib/format'
import { Badge, Meter, Panel, Skeleton, Stepper } from '@/components/ui'

/** The F2 pipeline as it runs: each stage, the model and chip that ran it, and timings. */
export function ProcessingPanel({ job, title = 'Processing on the box', className, state }: { job: Job | null; title?: string; className?: string; state?: 'running' | 'done' | 'rerunning' | 'failed' }) {
  // A job the box re-ran (for example after a restart) or finished in a re-run is not a failure.
  const rerunning = state === 'rerunning'
  const doneElsewhere = state === 'done' && job?.status === 'failed'
  const total = job?.stages.reduce((s, x) => s + (x.ms ?? 0), 0) ?? 0
  return (
    <Panel
      className={className}
      eyebrow={job ? `job ${job.id}` : 'job'}
      title={title}
      actions={
        job &&
        (rerunning ? (
          <Badge tone="warn" dot pulse>
            Restarted, continuing
          </Badge>
        ) : doneElsewhere ? (
          <Badge tone="ok" icon={<CheckCircle2 className="size-3" />}>
            Finished in a re-run
          </Badge>
        ) : job.status === 'done' ? (
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
          {rerunning ? (
            <p className="mt-4 rounded-md bg-warn-soft p-3 text-[13px] text-warn" role="status">
              {job.error ? `${job.error}. ` : ''}The box picks the job up again on its own; this view follows it.
            </p>
          ) : doneElsewhere ? (
            <p className="mt-4 rounded-md bg-ok-soft p-3 text-[13px] text-ok" role="status">
              This run was interrupted, and the box finished the skill in a re-run. It is ready.
            </p>
          ) : (
            job.error && <p className="mt-4 rounded-md bg-fault-soft p-3 text-[13px] text-fault">{job.error}</p>
          )}
        </>
      )}
    </Panel>
  )
}
