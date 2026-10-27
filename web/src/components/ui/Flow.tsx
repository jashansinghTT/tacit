// Process primitives: Stepper (pipeline stages) and Timeline (steps over a clip).
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Check, Circle, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { JobStage } from '@/lib/api'
import { fmtMs, STAGE_LABEL } from '@/lib/format'
import { ChipTag } from './Badge'

function parseModel(m: string): { name: string; chip: number | null } {
  const [name, where] = m.split('@')
  const chip = where === undefined || where === 'cpu' ? null : Number(where)
  return { name, chip: Number.isNaN(chip) ? null : chip }
}

function StageIcon({ status }: { status: JobStage['status'] }) {
  if (status === 'done')
    return (
      <span className="grid size-6 place-items-center rounded-full bg-ok/15 text-ok shadow-[inset_0_0_0_1px_rgb(61_220_151/0.4)]">
        <Check className="size-3.5" strokeWidth={2.5} />
      </span>
    )
  if (status === 'running')
    return (
      <span className="relative grid size-6 place-items-center rounded-full bg-ion-soft text-ion shadow-[inset_0_0_0_1px_rgb(60_215_255/0.5),0_0_16px_rgb(60_215_255/0.4)]">
        <Loader2 className="size-3.5 animate-spin" strokeWidth={2.5} />
      </span>
    )
  if (status === 'failed')
    return (
      <span className="grid size-6 place-items-center rounded-full bg-fault-soft text-fault shadow-[inset_0_0_0_1px_rgb(255_93_93/0.4)]">
        <X className="size-3.5" strokeWidth={2.5} />
      </span>
    )
  return (
    <span className="grid size-6 place-items-center rounded-full text-fg-faint shadow-[inset_0_0_0_1px_var(--color-line-strong)]">
      <Circle className="size-2 fill-current" />
    </span>
  )
}

/** Vertical pipeline stepper: each stage with its status, the models and chips that ran it, and time. */
export function Stepper({ stages, className }: { stages: JobStage[]; className?: string }) {
  return (
    <ol className={cn('relative', className)} data-testid="pipeline-stepper">
      {stages.map((s, i) => {
        const last = i === stages.length - 1
        return (
          <li key={s.name} className="relative flex gap-3 pb-4 last:pb-0" data-testid={`stage-${s.name}`} data-status={s.status}>
            {!last && (
              <span className="absolute top-7 bottom-1 left-3 w-px -translate-x-1/2 bg-line-strong" aria-hidden>
                <motion.span
                  className="absolute inset-x-0 top-0 bg-ok"
                  initial={false}
                  animate={{ height: s.status === 'done' ? '100%' : '0%' }}
                  transition={{ duration: 0.4 }}
                />
              </span>
            )}
            <StageIcon status={s.status} />
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className={cn('text-[13px] font-medium', s.status === 'pending' || s.status === 'queued' ? 'text-fg-subtle' : 'text-fg')}>
                  {STAGE_LABEL[s.name] ?? s.name}
                </span>
                <span className="telemetry text-[11px] text-fg-subtle">
                  {s.status === 'done' && s.ms != null ? fmtMs(s.ms) : s.status === 'running' && s.progress != null ? `${Math.round(s.progress * 100)}%` : ''}
                </span>
              </div>
              {(s.detail || s.models?.length) && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
                  {s.models?.map((m) => {
                    const pm = parseModel(m)
                    return (
                      <span key={m} className="inline-flex items-center gap-1 rounded-sm bg-white/[0.03] py-px pr-0.5 pl-1.5 shadow-[inset_0_0_0_1px_var(--color-line)]">
                        <span className="text-fg-muted">{pm.name}</span>
                        <ChipTag chip={pm.chip} />
                      </span>
                    )
                  })}
                  {s.detail && <span>{s.detail}</span>}
                </div>
              )}
              {s.status === 'running' && s.progress != null && (
                <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full bg-ion transition-[width] duration-300" style={{ width: `${s.progress * 100}%` }} />
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export interface TimelineSegment {
  id: string
  label: string
  t0: number
  t1: number
  done?: boolean
  marker?: ReactNode
}

/** A horizontal step timeline over a clip; segments fill as they close; a playhead shows time. */
export function Timeline({
  segments,
  duration,
  time,
  onSeek,
  activeId,
  className,
  markers,
}: {
  segments: TimelineSegment[]
  duration: number
  time?: number
  onSeek?: (t: number) => void
  activeId?: string | null
  className?: string
  markers?: { t: number; label: string }[]
}) {
  const pct = (t: number) => `${Math.max(0, Math.min(100, (t / Math.max(duration, 0.001)) * 100))}%`
  return (
    <div className={cn('relative select-none', className)} data-testid="step-timeline">
      <div
        className={cn('relative h-9 rounded-sm bg-white/[0.015] shadow-[inset_0_0_0_1px_var(--color-line)]', onSeek && 'cursor-pointer')}
        onClick={(e) => {
          if (!onSeek) return
          const r = e.currentTarget.getBoundingClientRect()
          onSeek(((e.clientX - r.left) / r.width) * duration)
        }}
      >
        {segments.map((s, i) => {
          const active = s.id === activeId
          const d = Math.max(duration, 0.001)
          return (
            <div
              key={s.id}
              className={cn(
                'absolute inset-y-0 overflow-hidden rounded-sm transition-colors',
                s.done ? 'bg-ion/[0.14]' : 'bg-white/[0.05]',
                active && 'bg-ion/[0.22] shadow-[inset_0_0_0_1px_rgb(60_215_255/0.6)]',
              )}
              style={{ left: `calc(${(s.t0 / d) * 100}% + 1px)`, width: `calc(${((s.t1 - s.t0) / d) * 100}% - 2px)` }}
              title={`${i + 1}. ${s.label}`}
            >
              {s.done && <div className="absolute inset-x-0 bottom-0 h-0.5 bg-ion" />}
              <div className="flex h-full items-center gap-1.5 px-2 text-[11px] whitespace-nowrap">
                <span className={cn('telemetry', s.done || active ? 'text-ion' : 'text-fg-faint')}>{String(i + 1).padStart(2, '0')}</span>
                <span className={cn('truncate', active ? 'text-fg' : s.done ? 'text-fg-muted' : 'text-fg-faint')}>{s.label}</span>
              </div>
            </div>
          )
        })}
        {time !== undefined && (
          <div className="pointer-events-none absolute -top-1 -bottom-1 w-px bg-fg shadow-[0_0_8px_rgb(255_255_255/0.8)]" style={{ left: pct(time) }}>
            <div className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-fg" />
          </div>
        )}
        {markers?.map((m, i) => (
          <div key={i} className="pointer-events-none absolute -bottom-2 size-1.5 -translate-x-1/2 rounded-full bg-data-gaze" style={{ left: pct(m.t) }} title={m.label} />
        ))}
      </div>
    </div>
  )
}
