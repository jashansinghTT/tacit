import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Camera, CameraOff, Check, Lightbulb, Lock, Square } from 'lucide-react'
import { cn } from '@/lib/cn'
import { fmtMs } from '@/lib/format'
import { Badge, Button, Meter, ScoreRing, ServedByList, Sparkline } from '@/components/ui'
import { useLessonCtx } from './context'
import { coverFit, drawHands, fitCanvas } from './overlay'
import { StepVideo } from './StepVideo'
import { useLesson } from './store'
import { usePractice, type LiveHands } from './usePractice'

/** The trainee's tracked hands over their mirrored camera view, fading out when the data is stale. */
function HandsCanvas({ hands }: { hands: React.MutableRefObject<LiveHands | null> }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const c = ref.current
      const ctx = c?.getContext('2d')
      if (!c || !ctx) return
      const { w, h, dpr } = fitCanvas(c)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const live = hands.current
      if (!live) return
      const age = performance.now() - live.at
      if (age > 900) return
      ctx.globalAlpha = age < 400 ? 1 : 1 - (age - 400) / 500
      drawHands(ctx, live.hands, coverFit(live.size[0], live.size[1], w, h, true))
      ctx.globalAlpha = 1
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [hands])
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 size-full" aria-hidden data-testid="trainee-overlay" />
}

function scoreTone(v: number) {
  return v >= 0.8 ? 'ok' : v >= 0.6 ? 'warn' : 'fault'
}

const TONE_TEXT = { ok: 'text-ok', warn: 'text-warn', fault: 'text-fault' } as const

export function PracticeStage() {
  const { lesson, step } = useLessonCtx()
  const practice = useLesson((s) => s.practice)
  const goStep = useLesson((s) => s.goStep)
  const openQuiz = useLesson((s) => s.openQuiz)
  const video = useRef<HTMLVideoElement>(null)
  const p = usePractice(video)
  const live = p.state === 'live'
  const mine = practice[step.index]
  const name = lesson.expert.name.split(' ')[0]

  useEffect(() => {
    if (video.current && p.stream && video.current.srcObject !== p.stream) {
      video.current.srcObject = p.stream
      void video.current.play().catch(() => undefined)
    }
  }, [p.stream])

  const score = p.feedback?.score ?? null
  const phase = p.feedback?.phase ?? 0
  const celebrating = Boolean(p.celebrate)

  return (
    <div className="flex flex-col gap-3" data-testid="practice-stage" data-state={p.state}>
      <div className="relative aspect-video overflow-hidden rounded-lg bg-ink-950 shadow-[inset_0_0_0_1px_var(--color-line)]">
        <video ref={video} muted playsInline autoPlay className={cn('absolute inset-0 size-full -scale-x-100 object-cover transition-opacity duration-500', p.stream ? 'opacity-100' : 'opacity-0')} data-testid="practice-camera" />
        {p.stream && <HandsCanvas hands={p.hands} />}

        {!p.stream && (
          <div className="absolute inset-0 grid place-items-center dot-bg">
            <div className="max-w-md px-6 text-center">
              <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-ion-soft text-ion shadow-[inset_0_0_0_1px_rgb(60_215_255/0.35),0_0_40px_-8px_rgb(60_215_255/0.6)]">
                {p.state === 'error' ? <CameraOff className="size-6" /> : <Camera className="size-6" />}
              </div>
              <h3 className="text-lg font-medium text-fg">Practise step {step.index} on camera</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
                Do the step in front of your camera. Tacit tracks your hands, lines your motion up with {name}'s, and gives you one thing to fix at a time.
              </p>
              {p.error && (
                <p className="mt-3 text-[13px] text-fault" role="alert" data-testid="practice-error">
                  {p.error}
                </p>
              )}
              <Button variant="primary" size="lg" className="mt-5" icon={<Camera className="size-4" />} loading={p.state === 'starting'} onClick={p.start} data-testid="practice-start">
                Start camera
              </Button>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-fg-subtle">
                <Lock className="size-3" /> Frames are analysed on this box and not stored.
              </p>
            </div>
          </div>
        )}

        {p.stream && (
          <>
            <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2">
              <Badge tone={live ? 'fault' : 'neutral'} dot pulse={live} className="bg-ink-950/75 backdrop-blur">
                {live ? 'Live' : p.state === 'stopping' ? 'Saving' : 'Connecting'}
              </Badge>
              {p.latency != null && <span className="telemetry rounded-sm bg-ink-950/75 px-1.5 py-0.5 text-[10px] text-fg-muted">{fmtMs(p.latency)} per frame</span>}
            </div>
            <div className="absolute top-3 right-3 w-[30%] min-w-[180px] overflow-hidden rounded-md shadow-[0_0_0_1px_var(--color-line-strong),0_16px_32px_-12px_rgb(0_0_0/0.8)]">
              <StepVideo testId="practice-expert" className="w-full" />
              <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-sm bg-ink-950/80 px-1.5 py-0.5 text-[10px] text-fg-muted">
                {name} · step {step.index}
              </span>
            </div>
            <AnimatePresence mode="wait">
              {p.hint && !celebrating && (
                <motion.div
                  key={p.hint}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                  className="absolute inset-x-0 bottom-0 flex justify-center p-4"
                >
                  <div className="flex max-w-xl items-center gap-3 rounded-xl bg-ink-950/85 px-4 py-3 shadow-[0_0_0_1px_rgb(255_181_71/0.35)] backdrop-blur-md" role="status" aria-live="polite" data-testid="practice-hint">
                    <Lightbulb className="size-5 shrink-0 text-warn" />
                    <span className="text-[15px] leading-snug text-fg">{p.hint}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {celebrating && p.celebrate && (
                <motion.div
                  key={p.celebrate.at}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 grid place-items-center bg-ok/[0.08]"
                  data-testid="step-done-banner"
                >
                  <div className="flex items-center gap-3 rounded-2xl bg-ink-950/85 px-5 py-4 shadow-[0_0_0_1px_rgb(61_220_151/0.5),0_0_60px_-10px_rgb(61_220_151/0.6)] backdrop-blur">
                    <span className="grid size-10 place-items-center rounded-full bg-ok text-ink-950">
                      <Check className="size-5" strokeWidth={3} />
                    </span>
                    <div>
                      <div className="text-[15px] font-medium text-fg">Step {p.celebrate.step} done</div>
                      <div className="telemetry text-xs text-ok">match {Math.round(p.celebrate.score * 100)}</div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      <div className="panel grid gap-5 p-4 md:grid-cols-[auto_minmax(0,1fr)]" data-testid="practice-hud">
        <div className="flex items-center justify-center" data-testid="score-ring">
          <ScoreRing value={score} size={112} stroke={8} sub="match" label="Live match score" />
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-3">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-xs">
              <span className="text-fg-muted">Where you are in {name}'s motion</span>
              <span className="telemetry text-fg-subtle">{Math.round(phase * 100)}%</span>
            </div>
            <div className="relative" data-testid="phase-bar">
              <Meter value={phase} tone="ion" height={6} label="Phase through the step" />
              <span className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-fg-subtle" style={{ left: '85%' }} title="The step counts as done past here with a good match" />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 text-[13px] text-fg-muted">
              {live ? (
                score === null ? (
                  'Waiting for your hands…'
                ) : (
                  <>
                    Best on this step <span className={cn('telemetry font-medium', TONE_TEXT[scoreTone(mine?.best ?? 0)])}>{Math.round((mine?.best ?? 0) * 100)}</span>
                    <span className="text-fg-faint"> · </span>a step completes past 85% with a match above 55
                  </>
                )
              ) : p.saved ? (
                <>Progress saved: {p.saved.steps_done} of {lesson.steps.length} steps.</>
              ) : (
                'Start the camera to get a live score.'
              )}
            </div>
            <div className="flex items-center gap-2">
              {live && step.index < lesson.steps.length && (
                <Button size="sm" variant="ghost" onClick={() => goStep(step.index + 1)} data-testid="practice-skip">
                  Skip step
                </Button>
              )}
              {live && step.index >= lesson.steps.length && (
                <Button size="sm" variant="secondary" onClick={openQuiz}>
                  Take the quiz
                </Button>
              )}
              {(live || p.state === 'stopping') && (
                <Button size="sm" variant="danger" icon={<Square className="size-3 fill-current" />} loading={p.state === 'stopping'} onClick={p.stop} data-testid="practice-stop">
                  Stop and save
                </Button>
              )}
            </div>
          </div>
          {p.servedBy.length > 0 && <ServedByList served={p.servedBy} />}
        </div>
        <ScoreHistory />
      </div>
    </div>
  )
}

/** Match score over time for each step practised so far. */
function ScoreHistory() {
  const { lesson, step } = useLessonCtx()
  const practice = useLesson((s) => s.practice)
  const goStep = useLesson((s) => s.goStep)
  const tried = lesson.steps.filter((s) => practice[s.index]?.scores.length)
  return (
    <div className="border-t border-line pt-4 md:col-span-2" data-testid="score-history">
      <div className="eyebrow mb-2.5">Score history</div>
      {tried.length === 0 ? (
        <p className="text-xs text-fg-subtle">Scores for each step you practise show up here.</p>
      ) : (
        <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {tried.map((s) => {
            const r = practice[s.index]
            const tone = scoreTone(r.best)
            return (
              <li key={s.id}>
                <button
                  onClick={() => goStep(s.index)}
                  className={cn('flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]', s.index === step.index && 'bg-white/[0.03]')}
                  data-testid={`history-step-${s.index}`}
                >
                  <span className={cn('telemetry grid size-5 shrink-0 place-items-center rounded-[4px] text-[10px]', r.done != null ? 'bg-ok text-ink-950' : 'bg-white/[0.06] text-fg-muted')}>
                    {r.done != null ? <Check className="size-3" strokeWidth={3} /> : s.index}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{s.title}</span>
                  <Sparkline data={r.scores.length > 1 ? r.scores : [r.scores[0] ?? 0, r.scores[0] ?? 0]} width={96} height={22} tone={tone} />
                  <span className={cn('telemetry w-7 text-right text-xs', TONE_TEXT[tone])}>{Math.round(r.best * 100)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
