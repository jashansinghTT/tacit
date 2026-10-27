import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { Pause, Play, Repeat, ShieldCheck } from 'lucide-react'
import type { Step } from '@/lib/api'
import { usePlayback } from '@/lib/playback'
import { fmtClock } from '@/lib/format'
import { cn } from '@/lib/cn'
import { Badge, IconButton, Segmented, Skeleton } from '@/components/ui'
import { useMotion } from './hooks'
import { MotionScene } from './MotionScene'

const LEGEND = [
  { c: 'bg-data-left', l: 'Left hand' },
  { c: 'bg-data-right', l: 'Right hand' },
  { c: 'bg-data-gaze', l: 'Gaze' },
  { c: 'bg-data-object', l: 'Parts' },
]

type PublicStep = Omit<Step, 'keyframe'> & { keyframe?: string | null }

/** The listing hero: the expert's 3D twin replaying the skill, with the steps on one clock. */
export function MotionPreview({ skillId, steps, duration, className }: { skillId: string; steps: PublicStep[]; duration?: number | null; className?: string }) {
  const twin = useMotion(skillId)
  const reduce = useReducedMotion()
  const dur = duration ?? twin.data?.frames.at(-1)?.t ?? 0
  const pb = usePlayback(dur, !reduce)
  const [speed, setSpeed] = useState<'0.5' | '1' | '2'>('1')
  const { seek } = pb
  const ready = Boolean(twin.data)
  const first = steps[0]?.t_start ?? 0
  // Start at the first step: most clips have a lead-in before the expert begins.
  useEffect(() => {
    if (ready && first > 0.5) seek(Math.max(0, first - 0.5))
  }, [ready, first, seek])
  // During the pauses between steps, keep the last step that started on screen.
  const current = [...steps].reverse().find((s) => pb.time >= s.t_start) ?? null
  const inside = Boolean(current && pb.time < current.t_end)
  const looping = Boolean(pb.loop && current && pb.loop[0] === current.t_start)

  return (
    <div className={cn('panel overflow-hidden', className)} data-testid="motion-preview">
      <div className="relative aspect-[16/10] bg-ink-950">
        {twin.data ? (
          <MotionScene twin={twin.data} timeRef={pb.timeRef} className="absolute inset-0" />
        ) : twin.isError ? (
          <div className="grid size-full place-items-center text-sm text-fg-subtle">The motion preview did not load.</div>
        ) : (
          <Skeleton className="absolute inset-4" />
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
          <div className="flex flex-col items-start gap-1.5">
            <Badge tone="ion" size="md" icon={<ShieldCheck className="size-3.5" />} className="bg-ink-950/70 backdrop-blur">
              Motion only
            </Badge>
            <span className="max-w-64 rounded-sm bg-ink-950/60 px-2 py-1 text-[11px] leading-snug text-fg-muted backdrop-blur">
              What you license: body, hands, gaze and parts in 3D. The video and faces never leave the plant.
            </span>
          </div>
          <ul className="flex flex-col gap-1 rounded-md bg-ink-950/60 px-2 py-1.5 text-[10px] text-fg-muted backdrop-blur" aria-label="Legend">
            {LEGEND.map((x) => (
              <li key={x.l} className="flex items-center gap-1.5">
                <span className={cn('size-1.5 rounded-full', x.c)} aria-hidden />
                {x.l}
              </li>
            ))}
          </ul>
        </div>
        {current && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/90 via-ink-950/50 to-transparent p-4 pt-10" aria-live="polite">
            <div className={cn('telemetry text-[11px]', inside ? 'text-ion' : 'text-fg-subtle')}>
              Step {String(current.index).padStart(2, '0')} of {String(steps.length).padStart(2, '0')}
              {!inside && ' · done'}
            </div>
            <div className="mt-0.5 text-[15px] font-medium text-fg">{current.title}</div>
            <div className="mt-0.5 max-w-xl text-[13px] text-fg-muted">{current.instruction}</div>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3 border-t border-line p-3">
        <div className="flex items-center gap-2">
          <IconButton label={pb.playing ? 'Pause' : 'Play'} variant="secondary" onClick={pb.toggle} data-testid="preview-play">
            {pb.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </IconButton>
          <span className="telemetry w-[118px] text-xs whitespace-nowrap text-fg-muted">
            {fmtClock(pb.time)} <span className="text-fg-faint">/ {fmtClock(dur)}</span>
          </span>
          <Segmented
            label="Playback speed"
            value={speed}
            onChange={(v) => {
              setSpeed(v)
              pb.setRate(Number(v))
            }}
            items={[
              { key: '0.5', label: '0.5×' },
              { key: '1', label: '1×' },
              { key: '2', label: '2×' },
            ]}
          />
          <button
            type="button"
            disabled={!current}
            onClick={() => (looping ? pb.setLoop(null) : current && pb.setLoop([current.t_start, current.t_end]))}
            aria-pressed={looping}
            className={cn(
              'ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors disabled:opacity-40',
              looping ? 'bg-ion-soft text-ion shadow-[inset_0_0_0_1px_rgb(60_215_255/0.4)]' : 'text-fg-subtle hover:bg-white/[0.05] hover:text-fg',
            )}
          >
            <Repeat className="size-3.5" />
            Loop step
          </button>
        </div>
        {dur > 0 && <StepTrack steps={steps} duration={dur} time={pb.time} onSeek={pb.seek} activeId={inside ? (current?.id ?? null) : null} />}
      </div>
    </div>
  )
}

/** Steps placed at their real times over the clip, so the pauses between them show. */
function StepTrack({ steps, duration, time, onSeek, activeId }: { steps: PublicStep[]; duration: number; time: number; onSeek: (t: number) => void; activeId: string | null }) {
  const pct = (t: number) => `${Math.max(0, Math.min(100, (t / duration) * 100))}%`
  return (
    <div
      className="relative h-9 cursor-pointer rounded-sm bg-white/[0.025] select-none"
      data-testid="step-track"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        onSeek(((e.clientX - r.left) / r.width) * duration)
      }}
    >
      {steps.map((s) => {
        const active = s.id === activeId
        const done = time >= s.t_end
        return (
          <button
            key={s.id}
            type="button"
            title={s.title}
            aria-label={`Step ${s.index}: ${s.title}`}
            onClick={(e) => {
              e.stopPropagation()
              onSeek(s.t_start)
            }}
            className={cn(
              'absolute inset-y-0 overflow-hidden rounded-sm text-left transition-colors',
              active ? 'bg-ion/[0.22] shadow-[inset_0_0_0_1px_rgb(60_215_255/0.6)]' : done ? 'bg-ion/[0.12]' : 'bg-white/[0.06] hover:bg-white/[0.09]',
            )}
            style={{ left: pct(s.t_start), width: `calc(${pct(s.t_end - s.t_start)} - 2px)` }}
          >
            {(done || active) && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-ion" />}
            <span className="flex h-full items-center gap-1.5 px-2 text-[11px] whitespace-nowrap">
              <span className={cn('telemetry', active || done ? 'text-ion' : 'text-fg-faint')}>{String(s.index).padStart(2, '0')}</span>
              <span className={cn('truncate', active ? 'text-fg' : done ? 'text-fg-muted' : 'text-fg-subtle')}>{s.title}</span>
            </span>
          </button>
        )
      })}
      <div className="pointer-events-none absolute -top-1 -bottom-1 w-px bg-fg shadow-[0_0_8px_rgb(255_255_255/0.8)]" style={{ left: pct(time) }}>
        <div className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-fg" />
      </div>
    </div>
  )
}
