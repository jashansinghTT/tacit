import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { Tracks } from '@/lib/api'
import { nearestFrame } from '@/lib/geometry'
import { containFit, drawGaze, drawHands, drawObjects, fitCanvas } from './overlay'
import { useLesson } from './store'

export interface OverlayLayers {
  hands: boolean
  gaze: boolean
  parts: boolean
}

/**
 * The expert's source video, looped over one step (`t0..t1`), with the tracked hands, gaze and
 * the step's parts drawn on top. With `driveClock` it publishes its time to the lesson store so
 * the narration captions and the virtual glove stay in sync with it.
 */
export function StepVideo({
  src,
  poster,
  t0,
  t1,
  tracks,
  layers = { hands: true, gaze: true, parts: true },
  highlight,
  playing,
  rate = 1,
  driveClock,
  onLoop,
  className,
  children,
  testId = 'step-video',
}: {
  src: string | null
  poster?: string | null
  t0: number
  t1: number
  tracks?: Tracks
  layers?: OverlayLayers
  highlight?: string[]
  playing: boolean
  rate?: number
  driveClock?: boolean
  onLoop?: () => void
  className?: string
  children?: ReactNode
  testId?: string
}) {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const props = useRef({ t0, t1, tracks, layers, highlight, driveClock, onLoop })
  props.current = { t0, t1, tracks, layers, highlight, driveClock, onLoop }

  // Jump to the start of the step whenever the step changes.
  useEffect(() => {
    const v = video.current
    if (v && ready) v.currentTime = t0
  }, [t0, t1, ready])

  useEffect(() => {
    const v = video.current
    if (!v || !ready) return
    if (playing) v.play().catch(() => undefined)
    else v.pause()
  }, [playing, ready, t0])

  useEffect(() => {
    if (video.current) video.current.playbackRate = rate
  }, [rate, ready])

  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const v = video.current
      const c = canvas.current
      if (!v || !c) return
      const p = props.current
      const t = v.currentTime
      if (v.readyState >= 1 && (t >= p.t1 - 0.03 || t < p.t0 - 0.25)) {
        const wrapped = t >= p.t1 - 0.03
        v.currentTime = p.t0
        if (wrapped) {
          if (p.driveClock) useLesson.getState().clock.loops += 1
          p.onLoop?.()
        }
      }
      if (p.driveClock) useLesson.getState().clock.t = Math.max(p.t0, Math.min(p.t1, v.currentTime))

      const ctx = c.getContext('2d')
      if (!ctx) return
      const { w, h, dpr } = fitCanvas(c)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const sw = p.tracks?.width || v.videoWidth
      const sh = p.tracks?.height || v.videoHeight
      if (!p.tracks || !sw || !sh) return
      const f = nearestFrame(p.tracks.frames, v.currentTime)
      if (!f || Math.abs(f.t - v.currentTime) > 0.35) return
      const fit = containFit(sw, sh, w, h)
      if (p.layers.parts) drawObjects(ctx, f.objects, fit, p.highlight)
      if (p.layers.gaze) drawGaze(ctx, f.gaze, fit, performance.now() / 1000)
      if (p.layers.hands) drawHands(ctx, f.hands, fit)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className={cn('relative overflow-hidden bg-ink-950', className)} data-testid={testId}>
      {src ? (
        <video
          ref={video}
          src={src}
          poster={poster ?? undefined}
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 size-full object-contain"
          onLoadedMetadata={() => setReady(true)}
          onEnded={(e) => {
            e.currentTarget.currentTime = props.current.t0
            if (playing) e.currentTarget.play().catch(() => undefined)
          }}
          aria-label="The expert performing this step"
        />
      ) : (
        poster && <img src={poster} alt="" className="absolute inset-0 size-full object-contain" />
      )}
      <canvas ref={canvas} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
      {children}
    </div>
  )
}
