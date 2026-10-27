import { useMemo, useState } from 'react'
import { Eye, Hand, Pause, Play, Repeat, ScanLine, Shapes, User, VideoOff } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Skill, Tracks } from '@/lib/api'
import { nearestFrame } from '@/lib/geometry'
import { fmtClock } from '@/lib/format'
import type { Playback } from '@/lib/playback'
import { OverlayCanvas } from '@/components/overlay/OverlayCanvas'
import { FootageCredit } from '@/components/media/Credit'
import { ALL_LAYERS, type OverlayLayers } from '@/components/overlay/draw'
import { IconButton, Segmented, Timeline } from '@/components/ui'

/** The step whose time range contains t (steps need not cover the whole clip). */
export function stepAt(skill: Skill, t: number) {
  return skill.steps.find((s) => t >= s.t_start && t < s.t_end) ?? null
}

const LAYER_BTNS: { key: keyof OverlayLayers; label: string; icon: typeof Hand }[] = [
  { key: 'hands', label: 'Hands', icon: Hand },
  { key: 'gaze', label: 'Gaze', icon: Eye },
  { key: 'objects', label: 'Parts', icon: Shapes },
  { key: 'pose', label: 'Body', icon: User },
]

export function LayerToggles({ layers, onChange }: { layers: OverlayLayers; onChange: (l: OverlayLayers) => void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Overlay layers">
      {LAYER_BTNS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          aria-pressed={layers[key]}
          onClick={() => onChange({ ...layers, [key]: !layers[key] })}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors',
            layers[key] ? 'bg-white/[0.07] text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'text-fg-faint hover:text-fg-muted',
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  )
}

/** Video of the capture with the analysis drawn over it, transport controls and the step timeline. */
export function SkillPlayer({ skill, tracks, pb, className, showTimeline = true }: { skill: Skill; tracks: Tracks | undefined; pb: Playback; className?: string; showTimeline?: boolean }) {
  const [layers, setLayers] = useState<OverlayLayers>(ALL_LAYERS)
  const [videoFailed, setVideoFailed] = useState(false)
  const step = stepAt(skill, pb.time)
  const W = tracks?.width ?? skill.source.width ?? 1280
  const H = tracks?.height ?? skill.source.height ?? 720
  const segments = useMemo(() => skill.steps.map((s) => ({ id: s.id, label: s.title, t0: s.t_start, t1: s.t_end, done: pb.time >= s.t_end })), [skill.steps, pb.time])
  const hasVideo = Boolean(skill.source.video) && !videoFailed
  const looping = Boolean(pb.loop)
  return (
    <div className={cn('flex flex-col gap-3', className)} data-testid="skill-player">
      <div className="relative overflow-hidden rounded-lg bg-ink-950 shadow-[inset_0_0_0_1px_var(--color-line)]" style={{ aspectRatio: `${W} / ${H}` }}>
        {hasVideo ? (
          <video
            ref={pb.bindVideo}
            src={skill.source.video ?? undefined}
            className="absolute inset-0 size-full object-contain"
            playsInline
            muted
            preload="auto"
            onError={() => setVideoFailed(true)}
            onClick={pb.toggle}
            aria-label={`Recording of ${skill.title}`}
          />
        ) : (
          <div className="absolute inset-0 grid-bg">
            <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-sm bg-ink-900/80 px-2 py-1 text-[11px] text-fg-subtle">
              <VideoOff className="size-3.5" /> Motion only. Raw video stays in the plant.
            </div>
          </div>
        )}
        {hasVideo && <FootageCredit skill={skill} overlay className="absolute bottom-3 left-3 z-10" />}
        <OverlayCanvas getFrame={() => (tracks ? nearestFrame(tracks.frames, pb.timeRef.current) : null)} srcW={W} srcH={H} layers={layers} highlightObject={step?.objects?.[0] ?? null} />
        <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2">
          <span className="telemetry flex items-center gap-1.5 rounded-sm bg-ink-950/75 px-2 py-1 text-[10px] text-fg-muted backdrop-blur">
            <ScanLine className="size-3 text-ion" />
            {tracks ? `${tracks.fps} fps analysis` : 'loading analysis'}
          </span>
          {step && (
            <span className="rounded-sm bg-ink-950/75 px-2 py-1 text-[11px] text-fg backdrop-blur">
              <span className="telemetry mr-1.5 text-ion">{String(step.index).padStart(2, '0')}</span>
              {step.title}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <IconButton label={pb.playing ? 'Pause' : 'Play'} onClick={pb.toggle} variant="secondary" size="sm" data-testid="player-toggle">
          {pb.playing ? <Pause className="size-4" /> : <Play className="size-4 fill-current" />}
        </IconButton>
        <span className="telemetry min-w-[118px] text-xs text-fg-muted">
          {fmtClock(pb.time)} <span className="text-fg-faint">/ {fmtClock(skill.source.duration)}</span>
        </span>
        <Segmented
          label="Playback speed"
          value={String(pb.rate)}
          onChange={(v) => pb.setRate(Number(v))}
          items={[
            { key: '0.25', label: '¼×' },
            { key: '0.5', label: '½×' },
            { key: '1', label: '1×' },
          ]}
        />
        <button
          aria-pressed={looping}
          onClick={() => (looping || !step ? pb.setLoop(null) : pb.setLoop([step.t_start, step.t_end]))}
          className={cn('inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors', looping ? 'bg-ion-soft text-ion shadow-[inset_0_0_0_1px_rgb(60_215_255/0.35)]' : 'text-fg-muted hover:bg-white/5 hover:text-fg')}
          data-testid="loop-step"
        >
          <Repeat className="size-3.5" />
          {looping ? 'Looping step' : 'Loop step'}
        </button>
        <div className="ml-auto">
          <LayerToggles layers={layers} onChange={setLayers} />
        </div>
      </div>
      {showTimeline && <Timeline segments={segments} duration={skill.source.duration} time={pb.time} onSeek={pb.seek} activeId={step?.id} markers={skill.qa.map((q) => ({ t: q.t, label: q.question }))} />}
    </div>
  )
}
