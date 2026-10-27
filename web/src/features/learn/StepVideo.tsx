import { useState, type ReactNode } from 'react'
import { VideoOff } from 'lucide-react'
import { cn } from '@/lib/cn'
import { nearestFrame } from '@/lib/geometry'
import { OverlayCanvas } from '@/components/overlay/OverlayCanvas'
import { ALL_LAYERS, type OverlayLayers } from '@/components/overlay/draw'
import { useLessonCtx } from './context'

/**
 * The expert's recording, looped over the current step by the lesson clock, with the tracked
 * hands, gaze and parts drawn over it.
 */
export function StepVideo({
  layers = ALL_LAYERS,
  className,
  children,
  fit = 'aspect',
  testId = 'step-video',
}: {
  layers?: OverlayLayers
  className?: string
  children?: ReactNode
  /** `aspect`: the box takes the video's aspect ratio; `fill`: the video fills the given box. */
  fit?: 'aspect' | 'fill'
  testId?: string
}) {
  const { lesson, skill, tracks, pb, step } = useLessonCtx()
  const [failed, setFailed] = useState(false)
  const W = tracks?.width || skill?.source.width || 1280
  const H = tracks?.height || skill?.source.height || 720
  const src = lesson.video
  return (
    <div
      className={cn('relative overflow-hidden bg-ink-950', className)}
      style={fit === 'aspect' ? { aspectRatio: `${W} / ${H}` } : undefined}
      data-testid={testId}
    >
      {src && !failed ? (
        <video
          ref={pb.bindVideo}
          src={src}
          poster={step.keyframe ?? undefined}
          className="absolute inset-0 size-full object-contain"
          playsInline
          muted
          preload="auto"
          onLoadedMetadata={(e) => {
            // A freshly mounted video starts at 0; put it where the lesson clock is.
            const lp = pb.loop
            const t = pb.timeRef.current
            e.currentTarget.currentTime = lp && (t < lp[0] || t > lp[1]) ? lp[0] : t
          }}
          onError={() => setFailed(true)}
          onClick={pb.toggle}
          aria-label={`${lesson.expert.name} performing step ${step.index}: ${step.title}`}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center grid-bg">
          {step.keyframe ? (
            <img src={step.keyframe} alt="" className="absolute inset-0 size-full object-contain opacity-80" />
          ) : null}
          <span className="relative flex items-center gap-1.5 rounded-sm bg-ink-900/85 px-2 py-1 text-[11px] text-fg-subtle">
            <VideoOff className="size-3.5" /> Video unavailable; motion overlay only
          </span>
        </div>
      )}
      <OverlayCanvas
        getFrame={() => {
          if (!tracks) return null
          const f = nearestFrame(tracks.frames, pb.timeRef.current)
          return f && Math.abs(f.t - pb.timeRef.current) < 0.35 ? f : null
        }}
        srcW={W}
        srcH={H}
        layers={layers}
        highlightObject={step.objects[0] ?? null}
      />
      {children}
    </div>
  )
}
