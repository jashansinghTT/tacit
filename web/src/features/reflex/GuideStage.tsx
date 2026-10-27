import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Download, Hand, Pause, Play, Plug, Square, Unplug } from 'lucide-react'
import { cn } from '@/lib/cn'
import { learnApi, useFingerTrack, useReflexStatus, type FingerTrack, type GuideResult } from '@/lib/api/learn'
import { fmtClock } from '@/lib/format'
import { Badge, Button, IconButton, Segmented, Skeleton, toast } from '@/components/ui'
import { useLessonCtx } from '@/features/learn/context'
import { StepVideo } from '@/features/learn/StepVideo'
import { curlsAt, describeGrip, FINGER_COLORS, FINGER_LABELS } from './fingers'
import { VirtualGlove } from './VirtualGlove'

/** Five live curl bars, updated every animation frame from the lesson clock. */
function FingerBars({ track, timeRef }: { track: FingerTrack | undefined; timeRef: MutableRefObject<number> }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([])
  const nums = useRef<(HTMLSpanElement | null)[]>([])
  useEffect(() => {
    let raf = 0
    const buf = [0, 0, 0, 0, 0]
    const tick = () => {
      raf = requestAnimationFrame(tick)
      curlsAt(track, timeRef.current, buf)
      for (let i = 0; i < 5; i++) {
        const b = bars.current[i]
        const n = nums.current[i]
        if (b) b.style.transform = `scaleX(${Math.max(0.03, buf[i])})`
        if (n) n.textContent = String(Math.round(buf[i] * 100))
      }
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [track, timeRef])
  return (
    <div className="flex w-full flex-col gap-2" data-testid="finger-bars" aria-label="Finger curl, 0 open to 100 closed">
      {FINGER_LABELS.map((l, i) => (
        <div key={l} className="grid grid-cols-[40px_minmax(0,1fr)_22px] items-center gap-2">
          <span className="text-[10.5px] text-fg-subtle">{l}</span>
          <span className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <span
              ref={(r) => void (bars.current[i] = r)}
              className="absolute inset-0 origin-left rounded-full"
              style={{ background: FINGER_COLORS[i], boxShadow: `0 0 8px ${FINGER_COLORS[i]}`, transform: 'scaleX(0.03)' }}
            />
          </span>
          <span ref={(r) => void (nums.current[i] = r)} className="telemetry text-right text-[10px] text-fg-muted">
            0
          </span>
        </div>
      ))}
    </div>
  )
}

/** The step's five curls over time, with a playhead that follows the video. */
function FingerChart({ track, t0, t1, timeRef, onSeek }: { track: FingerTrack | undefined; t0: number; t1: number; timeRef: MutableRefObject<number>; onSeek: (t: number) => void }) {
  const W = 600
  const H = 120
  const head = useRef<SVGLineElement>(null)
  const paths = useMemo(() => {
    const rows = track?.frames ?? []
    const span = Math.max(0.01, t1 - t0)
    return [0, 1, 2, 3, 4].map((i) =>
      rows.map((r, k) => `${k ? 'L' : 'M'}${(((r[0] - t0) / span) * W).toFixed(1)},${(H - 6 - r[i + 1] * (H - 12)).toFixed(1)}`).join(''),
    )
  }, [track, t0, t1])
  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const x = ((timeRef.current - t0) / Math.max(0.01, t1 - t0)) * W
      head.current?.setAttribute('x1', String(x))
      head.current?.setAttribute('x2', String(x))
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [timeRef, t0, t1])
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-[120px] w-full cursor-pointer"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        onSeek(t0 + ((e.clientX - r.left) / r.width) * (t1 - t0))
      }}
      data-testid="finger-chart"
      role="img"
      aria-label="Finger curl over this step"
    >
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={0} x2={W} y1={H - 6 - g * (H - 12)} y2={H - 6 - g * (H - 12)} stroke="rgb(255 255 255 / 0.05)" vectorEffect="non-scaling-stroke" />
      ))}
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={FINGER_COLORS[i]} strokeWidth={1.75} strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={0.9} />
      ))}
      <line ref={head} y1={0} y2={H} stroke="#fff" strokeWidth={1.25} vectorEffect="non-scaling-stroke" opacity={0.85} />
    </svg>
  )
}

/** "Guide my hand": the expert's finger motion on a Reflex glove, or on the virtual one. */
export function GuideStage() {
  const { lesson, step, pb } = useLessonCtx()
  const status = useReflexStatus()
  const track = useFingerTrack(lesson.skill_id, step.index)
  const [guide, setGuide] = useState<GuideResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [gloveUntil, setGloveUntil] = useState<number | null>(null)
  const connected = Boolean(status.data?.connected)
  const name = lesson.expert.name.split(' ')[0]
  const side = track.data?.hand === 'left' ? 'left' : 'right'
  const grip = describeGrip(track.data)
  const hasMotion = (track.data?.frames.length ?? 0) > 0

  useEffect(() => {
    setGuide(null)
    setGloveUntil(null)
  }, [step.id])

  useEffect(() => {
    if (!gloveUntil) return
    const id = setTimeout(() => setGloveUntil(null), Math.max(0, gloveUntil - Date.now()))
    return () => clearTimeout(id)
  }, [gloveUntil])

  const play = async () => {
    setBusy(true)
    try {
      const r = await learnApi.guide(lesson.skill_id, step.index)
      setGuide(r)
      // Restart the step so the video, the virtual glove and a real glove start together.
      pb.seek(step.t_start)
      pb.play()
      if (r.connected) {
        setGloveUntil(Date.now() + r.seconds * 1000)
        toast.ok('Reflex is guiding your hand', `${r.steps.length} poses, ${r.seconds.toFixed(1)} s`)
      }
    } catch (e) {
      toast.error('The glove did not start', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const stop = async () => {
    try {
      await learnApi.stopGlove()
    } finally {
      setGloveUntil(null)
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="guide-stage">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg shadow-[inset_0_0_0_1px_var(--color-line)]">
          <StepVideo fit="fill" testId="guide-video" />
          <span className="pointer-events-none absolute top-3 left-3 rounded-sm bg-ink-950/75 px-2 py-1 text-[11px] text-fg backdrop-blur">
            {name}'s {side} hand
          </span>
        </div>
        <div className="flex aspect-[4/3] overflow-hidden rounded-lg bg-ink-950 shadow-[inset_0_0_0_1px_var(--color-line)]">
          <div className="relative min-w-0 flex-1">
            {track.isLoading ? <Skeleton className="absolute inset-0 rounded-none" /> : <VirtualGlove track={track.data} timeRef={pb.timeRef} side={side} className="absolute inset-0" />}
            <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2">
              <span className="rounded-sm bg-ink-950/75 px-2 py-1 text-[11px] text-fg backdrop-blur">Virtual glove · {side} hand</span>
              {gloveUntil && (
                <Badge tone="ok" dot pulse>
                  on your hand too
                </Badge>
              )}
            </div>
            <span className="telemetry pointer-events-none absolute right-3 bottom-2.5 text-[10px] text-fg-faint">drag to turn</span>
            {!track.isLoading && !hasMotion && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950 to-transparent px-4 pt-10 pb-3 text-center text-[13px] text-fg-muted">
                No finger motion was tracked in this step, so the glove holds a relaxed pose.
              </div>
            )}
          </div>
          <div className="flex w-[132px] shrink-0 flex-col justify-center gap-3 border-l border-line bg-ink-900/70 px-3">
            <span className="eyebrow">Curl</span>
            <FingerBars track={track.data} timeRef={pb.timeRef} />
            <span className="telemetry text-[9.5px] text-fg-faint">0 open · 100 closed</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <IconButton label={pb.playing ? 'Pause' : 'Play'} onClick={pb.toggle} variant="secondary" size="sm" data-testid="guide-play-toggle">
          {pb.playing ? <Pause className="size-4" /> : <Play className="size-4 fill-current" />}
        </IconButton>
        <span className="telemetry text-[11px] text-fg-muted">
          {fmtClock(pb.time)} <span className="text-fg-faint">/ {fmtClock(step.t_end)}</span>
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
        <span className="ml-auto text-[11px] text-fg-subtle">Slow it down to feel each finger.</span>
      </div>

      <section className="panel p-5" data-testid="reflex-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ion-soft text-ion shadow-[inset_0_0_0_1px_rgb(60_215_255/0.35)]">
              <Hand className="size-5" />
            </span>
            <div className="min-w-0">
              <h3 className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-fg">
                Guide my hand
                {status.isLoading ? (
                  <Badge tone="neutral">checking for a glove…</Badge>
                ) : connected ? (
                  <Badge tone="ok" dot icon={<Plug className="size-3" />} data-testid="reflex-status">
                    Glove connected{status.data?.mock ? ' (Reflex mock mode)' : ''}
                  </Badge>
                ) : (
                  <Badge tone="neutral" icon={<Unplug className="size-3" />} data-testid="reflex-status">
                    No glove connected
                  </Badge>
                )}
              </h3>
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-fg-muted" data-testid="reflex-explainer">
                Feel the expert's grip: Reflex is a five-finger exoskeleton glove that moves your fingers through {name}'s motion for this step.
              </p>
              <p className="mt-1 text-xs text-fg-subtle">
                {connected
                  ? `Reflex backend at ${status.data?.url}. Put the glove on, then start.`
                  : `No Reflex backend answered at ${status.data?.url ?? 'its address'}, so the virtual glove plays the same motion in sync with the video.`}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {gloveUntil ? (
              <Button variant="danger" icon={<Square className="size-3 fill-current" />} onClick={stop} data-testid="reflex-stop">
                Stop the glove
              </Button>
            ) : (
              <Button variant="primary" icon={<Hand className="size-4" />} loading={busy} disabled={!hasMotion} onClick={play} data-testid="reflex-guide">
                {connected ? 'Guide my hand' : 'Play on the virtual glove'}
              </Button>
            )}
            <a
              href={learnApi.reflexFileUrl(lesson.skill_id, step.index)}
              download
              className="inline-flex h-10 items-center gap-2 rounded-md bg-ink-700 px-4 text-sm font-medium text-fg shadow-[0_0_0_1px_var(--color-line-strong),inset_0_1px_0_rgb(255_255_255/0.06)] hover:bg-ink-600"
              data-testid="reflex-download"
              title="A Reflex movement file (Python) with this step's poses"
            >
              <Download className="size-4" /> Download for Reflex
            </a>
          </div>
        </div>

        <div className="mt-5 grid gap-4 border-t border-line pt-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="eyebrow">Finger curl, this step</span>
              <span className="flex flex-wrap items-center gap-3">
                {FINGER_LABELS.map((l, i) => (
                  <span key={l} className="inline-flex items-center gap-1.5 text-[10.5px] text-fg-subtle">
                    <span className="h-0.5 w-3 rounded-full" style={{ background: FINGER_COLORS[i] }} />
                    {l}
                  </span>
                ))}
              </span>
            </div>
            <div className="rounded-md bg-ink-900/60 px-1 shadow-[inset_0_0_0_1px_var(--color-line)]">
              {track.isLoading ? <Skeleton className="h-[120px]" /> : <FingerChart track={track.data} t0={step.t_start} t1={step.t_end} timeRef={pb.timeRef} onSeek={pb.seek} />}
            </div>
            <div className="telemetry mt-1 flex justify-between text-[10px] text-fg-faint">
              <span>{fmtClock(step.t_start)}</span>
              <span>open 0 · closed 100</span>
              <span>{fmtClock(step.t_end)}</span>
            </div>
          </div>
          <dl className="grid content-start gap-3 text-[13px]">
            <div>
              <dt className="eyebrow">The grip</dt>
              <dd className="mt-1 text-fg-muted" data-testid="grip-summary">
                {grip ?? 'No finger motion tracked in this step.'}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Movement</dt>
              <dd className={cn('telemetry mt-1 text-fg-muted')}>
                {guide ? `${guide.steps.length} poses · ${guide.seconds.toFixed(1)} s` : `${track.data?.frames.length ?? 0} samples at ${track.data?.fps ?? 10} Hz`}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Safety</dt>
              <dd className="mt-1 text-xs text-fg-subtle">The glove never closes past 85%, and every movement ends with the hand relaxed.</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  )
}
