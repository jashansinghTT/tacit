// Live read-outs for a run. They update the DOM from a requestAnimationFrame loop (reading the
// pose the 3D view samples), so 30 Hz telemetry never goes through React state.
import { useEffect, useRef, type MutableRefObject } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import type { SimRobot } from '@/lib/api/robot'
import { cn } from '@/lib/cn'
import { runBuffer, seekRun, setPlaying, useRunUi, type Pose } from './runStream'

function useRaf(fn: () => void) {
  const ref = useRef(fn)
  useEffect(() => {
    ref.current = fn
  })
  useEffect(() => {
    let id = 0
    const tick = () => {
      ref.current()
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [])
}

export function fmtSimTime(t: number) {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`
}

export function LiveClock({ pose, className }: { pose: MutableRefObject<Pose>; className?: string }) {
  const el = useRef<HTMLSpanElement>(null)
  useRaf(() => {
    if (el.current) el.current.textContent = fmtSimTime(pose.current.t)
  })
  return <span ref={el} className={cn('telemetry', className)} data-testid="sim-clock">00:00.00</span>
}

const JOINT_LABEL = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'J7']

/** Seven joint bars (position within the joint's range), gripper width and the TCP position. */
export function JointTelemetry({ robot, pose }: { robot: SimRobot; pose: MutableRefObject<Pose> }) {
  const bars = useRef<(HTMLDivElement | null)[]>([])
  const vals = useRef<(HTMLSpanElement | null)[]>([])
  const grip = useRef<HTMLDivElement>(null)
  const gripVal = useRef<HTMLSpanElement>(null)
  const ee = useRef<HTMLSpanElement>(null)
  const ranges = robot.bodies
    .filter((b) => b.joint && b.joint.type === 'hinge')
    .sort((a, b) => a.joint!.qpos_index - b.joint!.qpos_index)
    .map((b) => b.joint!.range)
  useRaf(() => {
    const q = pose.current.qpos.length >= 9 ? pose.current.qpos : (robot.home_qpos ?? [])
    for (let i = 0; i < 7; i++) {
      const [lo, hi] = ranges[i] ?? [-Math.PI, Math.PI]
      const v = q[i] ?? 0
      const u = Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1)))
      const bar = bars.current[i]
      if (bar) bar.style.transform = `translateX(${(u * 100 - 50).toFixed(1)}%)`
      const t = vals.current[i]
      if (t) t.textContent = `${((v * 180) / Math.PI).toFixed(0)}°`
    }
    const g = pose.current.qpos.length >= 9 ? pose.current.gripper : 0.04
    if (grip.current) grip.current.style.width = `${Math.max(0, Math.min(1, g / 0.04)) * 100}%`
    if (gripVal.current) gripVal.current.textContent = `${(g * 2 * 1000).toFixed(0)} mm`
    if (ee.current) {
      const p = pose.current.ee
      ee.current.textContent = pose.current.qpos.length >= 9 ? `${p[0].toFixed(3)}  ${p[1].toFixed(3)}  ${p[2].toFixed(3)}` : '–'
    }
  })
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2" data-testid="joint-telemetry">
      <div className="grid grid-cols-7 gap-2">
        {JOINT_LABEL.map((l, i) => (
          <div key={l} className="min-w-0">
            <div className="flex items-baseline justify-between">
              <span className="eyebrow !tracking-[0.08em]">{l}</span>
              <span ref={(e) => void (vals.current[i] = e)} className="telemetry text-[10px] text-fg-muted">
                0°
              </span>
            </div>
            <div className="relative mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
              <div ref={(e) => void (bars.current[i] = e)} className="absolute inset-y-0 left-1/2 w-1.5 -ml-[3px] rounded-full bg-ion shadow-[0_0_8px_rgb(60_215_255/0.7)]" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-5">
        <div className="w-24">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow !tracking-[0.08em]">Grip</span>
            <span ref={gripVal} className="telemetry text-[10px] text-fg-muted">
              80 mm
            </span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div ref={grip} className="h-full rounded-full bg-data-right" style={{ width: '100%' }} />
          </div>
        </div>
        <div className="min-w-[150px]">
          <div className="eyebrow !tracking-[0.08em]">TCP xyz (m)</div>
          <span ref={ee} className="telemetry mt-0.5 block text-[11px] whitespace-pre text-fg-muted">
            –
          </span>
        </div>
      </div>
    </div>
  )
}

/** A rendered sim camera (GR00T's input), swapped in place as frames arrive at 5 Hz. */
export function CameraFeed({ name, label, className }: { name: string; label: string; className?: string }) {
  const img = useRef<HTMLImageElement>(null)
  const empty = useRef<HTMLDivElement>(null)
  const stamp = useRef<HTMLSpanElement>(null)
  const fig = useRef<HTMLElement>(null)
  useEffect(() => {
    const show = (src: string | undefined) => {
      if (!img.current || !empty.current) return
      if (src) {
        img.current.src = src
        img.current.style.opacity = '1'
        empty.current.style.opacity = '0'
      } else {
        img.current.removeAttribute('src')
        img.current.style.opacity = '0'
        empty.current.style.opacity = '1'
      }
    }
    show(runBuffer.cameras.get(name))
    let frames = 0
    return runBuffer.onCamera((n, src) => {
      if (n === '*') {
        frames = 0
        show(undefined)
      } else if (n === name) {
        frames++
        show(src)
        if (stamp.current) stamp.current.textContent = `frame ${frames}`
      }
      if (fig.current) fig.current.dataset.frames = String(frames)
    })
  }, [name])
  return (
    <figure ref={fig} className={cn('relative aspect-video overflow-hidden rounded-md bg-ink-950 shadow-[inset_0_0_0_1px_var(--color-line)]', className)} data-testid={`camera-${name}`} data-frames="0">
      <img ref={img} alt={`${label} camera`} className="absolute inset-0 size-full object-cover opacity-0 transition-opacity" />
      <div ref={empty} className="absolute inset-0 grid place-items-center dot-bg text-[11px] text-fg-faint transition-opacity">
        no frames yet
      </div>
      <figcaption className="absolute top-1.5 left-1.5 flex items-center gap-1.5 rounded-xs bg-ink-950/70 px-1.5 py-0.5 text-[10px] text-fg-muted backdrop-blur">
        <span className="size-1.5 rounded-full bg-data-gaze" aria-hidden />
        {label}
        <span ref={stamp} className="telemetry text-fg-faint" />
      </figcaption>
    </figure>
  )
}

/** Live indicator while streaming; play/pause, scrub and speed once the run is recorded. */
export function PlaybackBar({ pose }: { pose: MutableRefObject<Pose> }) {
  const status = useRunUi((s) => s.status)
  const playback = useRunUi((s) => s.playback)
  const playing = useRunUi((s) => s.playing)
  const speed = useRunUi((s) => s.speed)
  const duration = useRunUi((s) => s.duration)
  const range = useRef<HTMLInputElement>(null)
  const fill = useRef<HTMLDivElement>(null)
  const scrubbing = useRef(false)
  const recorded = status === 'done' || status === 'stopped' || (status === 'error' && runBuffer.states.length > 0)
  const live = status === 'streaming' || status === 'starting'
  useRaf(() => {
    const end = runBuffer.latestT
    const u = end > 0 ? Math.max(0, Math.min(1, pose.current.t / end)) : 0
    if (fill.current) fill.current.style.width = `${u * 100}%`
    if (range.current && !scrubbing.current) range.current.value = String(pose.current.t)
  })
  return (
    <div className="flex items-center gap-3" data-testid="playback-bar">
      <button
        type="button"
        onClick={() => setPlaying(!(playback === 'local' && playing))}
        disabled={!recorded}
        className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-white/[0.06] hover:text-fg disabled:opacity-30"
        aria-label={playback === 'local' && playing ? 'Pause' : 'Play the recorded run'}
        title={recorded ? undefined : 'Available when the run finishes'}
      >
        {playback === 'local' && playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
      </button>
      <button
        type="button"
        onClick={() => {
          seekRun(runBuffer.startT)
          setPlaying(true)
        }}
        disabled={!recorded}
        className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-white/[0.06] hover:text-fg disabled:opacity-30"
        aria-label="Play from the start"
      >
        <RotateCcw className="size-3.5" />
      </button>
      <div className="relative h-7 flex-1">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/[0.07]">
          <div ref={fill} className={cn('h-full rounded-full', live ? 'bg-ion/70' : 'bg-fg-muted')} style={{ width: '0%' }} />
        </div>
        <input
          ref={range}
          type="range"
          min={runBuffer.startT}
          max={Math.max(duration, runBuffer.latestT, 0.01)}
          step={0.01}
          disabled={!recorded}
          aria-label="Scrub the run"
          className="tacit-range absolute inset-0 w-full cursor-pointer appearance-none bg-transparent opacity-0 hover:opacity-100 focus-visible:opacity-100 disabled:cursor-default disabled:hover:opacity-0"
          onPointerDown={() => (scrubbing.current = true)}
          onPointerUp={() => (scrubbing.current = false)}
          onChange={(e) => {
            seekRun(Number(e.target.value))
            setPlaying(false)
          }}
        />
      </div>
      {live ? (
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-ion">
          <span className="size-1.5 animate-pulse-dot rounded-full bg-ion" aria-hidden />
          LIVE
        </span>
      ) : (
        <div className="flex items-center gap-0.5" role="group" aria-label="Playback speed">
          {[0.25, 0.5, 1, 2].map((s) => (
            <button
              key={s}
              type="button"
              disabled={!recorded}
              onClick={() => useRunUi.setState({ speed: s })}
              className={cn('telemetry rounded-xs px-1.5 py-0.5 text-[10px] disabled:opacity-30', speed === s ? 'bg-white/[0.08] text-fg' : 'text-fg-subtle hover:text-fg')}
              aria-pressed={speed === s}
            >
              {s}×
            </button>
          ))}
        </div>
      )}
      <LiveClock pose={pose} className="w-[64px] text-right text-[11px] text-fg-muted" />
    </div>
  )
}
