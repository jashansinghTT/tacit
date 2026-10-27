import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Box as BoxIcon, Pause, Play, RotateCcw, SkipForward, Video, Volume2, VolumeX } from 'lucide-react'
import { cn } from '@/lib/cn'
import { usePointcloud, useTwin } from '@/lib/api/queries'
import { useIntroMusic, type LessonStep } from '@/lib/api/learn'
import { fmtClock } from '@/lib/format'
import { ALL_LAYERS, type OverlayLayers } from '@/components/overlay/draw'
import { LayerToggles } from '@/components/skill/SkillPlayer'
import { TwinViewer } from '@/components/skill/TwinViewer'
import { IconButton, Segmented, Skeleton, Switch } from '@/components/ui'
import { Captions, MusicCredit } from './Captions'
import { useLessonCtx } from './context'
import { useNarration, type NarrationLine } from './narration'
import { StepVideo } from './StepVideo'
import { useLesson } from './store'

const ADVANCE_SECONDS = 4

/** The intro line, with the MiniMax music bed under it when the box has made one. */
export function useIntro() {
  const { lesson } = useLessonCtx()
  const music = useIntroMusic()
  const play = useNarration((s) => s.play)
  return () =>
    play(
      { key: 'intro', audio: lesson.intro_audio, text: lesson.intro_text, lang: lesson.lang },
      music.data ? { audio: music.data.audio, credit: music.data.credit } : null,
    )
}

export function stepLine(step: LessonStep, lang: string): NarrationLine {
  return { key: step.id, audio: step.narration_audio, text: step.narration_text ?? step.instruction, lang }
}

/** Keeps narration in step with the lesson: the intro once, then each step's line as it opens. */
function useNarrationDirector(active: boolean) {
  const { lesson, step, pb } = useLessonCtx()
  const narrate = useLesson((s) => s.narrate)
  const play = useNarration((s) => s.play)
  const stop = useNarration((s) => s.stop)
  const line = useNarration((s) => s.line)
  const status = useNarration((s) => s.status)
  const music = useIntroMusic()
  const playIntro = useIntro()
  const introPlayed = useRef(false)

  // Wait for the music lookup so the intro starts with its bed (it fails fast when there is none).
  const musicSettled = !music.isLoading
  useEffect(() => {
    if (!active || !narrate) {
      stop()
      return
    }
    if (!introPlayed.current && step.index === 1 && lesson.intro_text) {
      if (!musicSettled) return
      introPlayed.current = true
      playIntro()
      return
    }
    introPlayed.current = true
    play(stepLine(step, lesson.lang))
    // Re-run when the step, the mode, the language or the narration switch changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, narrate, step.id, lesson.lang, musicSettled])

  // After the intro, the first step's own line.
  useEffect(() => {
    if (active && narrate && line?.key === 'intro' && status === 'ended') play(stepLine(step, lesson.lang))
  }, [active, narrate, line, status, step, lesson.lang, play])

  // Pausing the demo pauses the voice too.
  useEffect(() => {
    const n = useNarration.getState()
    if (!active || !n.line) return
    if (!pb.playing && n.status === 'playing') n.pause()
    else if (pb.playing && n.status === 'paused') n.resume()
  }, [pb.playing, active])

  useEffect(() => () => useNarration.getState().stop(), [])
}

/** Counts how many times the step loop has wrapped since the step opened. */
function useLoopCount() {
  const { pb, step } = useLessonCtx()
  const [loops, setLoops] = useState(0)
  useEffect(() => {
    setLoops(0)
    let prev = pb.timeRef.current
    const id = setInterval(() => {
      const t = pb.timeRef.current
      if (t + 0.25 < prev) setLoops((l) => l + 1)
      prev = t
    }, 120)
    return () => clearInterval(id)
  }, [pb.timeRef, step.id])
  return loops
}

function useAutoAdvance(active: boolean) {
  const { step, pb } = useLessonCtx()
  const autoAdvance = useLesson((s) => s.autoAdvance)
  const narrate = useLesson((s) => s.narrate)
  const next = useLesson((s) => s.next)
  const line = useNarration((s) => s.line)
  const status = useNarration((s) => s.status)
  const loops = useLoopCount()
  const [deadline, setDeadline] = useState<number | null>(null)
  const [skipped, setSkipped] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const voiceDone = !narrate || status === 'blocked' || (line?.key === step.id && status === 'ended')
  const ready = active && autoAdvance && pb.playing && voiceDone && loops >= 1 && skipped !== step.id

  useEffect(() => {
    if (!ready) {
      setDeadline(null)
      return
    }
    const at = Date.now() + ADVANCE_SECONDS * 1000
    setDeadline(at)
    const id = setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= at) {
        clearInterval(id)
        setDeadline(null)
        next()
      }
    }, 200)
    return () => clearInterval(id)
  }, [ready, next])

  return {
    secondsLeft: deadline ? Math.max(1, Math.ceil((deadline - now) / 1000)) : null,
    cancel: () => setSkipped(step.id),
  }
}

export function WatchStage() {
  const { lesson, skill, step, pb } = useLessonCtx()
  const mode = useLesson((s) => s.mode)
  const narrate = useLesson((s) => s.narrate)
  const setNarrate = useLesson((s) => s.setNarrate)
  const autoAdvance = useLesson((s) => s.autoAdvance)
  const setAutoAdvance = useLesson((s) => s.setAutoAdvance)
  const stepCount = useLesson((s) => s.stepCount)
  const next = useLesson((s) => s.next)
  const [view, setView] = useState<'video' | '3d'>('video')
  const [layers, setLayers] = useState<OverlayLayers>(ALL_LAYERS)
  const narration = useNarration()
  const active = mode === 'watch'
  useNarrationDirector(active)
  const { secondsLeft, cancel } = useAutoAdvance(active)
  const twin = useTwin(lesson.skill_id, view === '3d')
  const cloud = usePointcloud(view === '3d' ? skill?.verification.pointcloud : null)

  const t0 = step.t_start
  const t1 = step.t_end
  const local = Math.max(0, Math.min(t1 - t0, pb.time - t0))
  const blocked = narration.status === 'blocked'
  const speaking = narration.status === 'playing'

  return (
    <div className="flex flex-col gap-3" data-testid="watch-stage">
      <div className="relative overflow-hidden rounded-lg shadow-[inset_0_0_0_1px_var(--color-line)]">
        {view === 'video' ? (
          <StepVideoWithChrome layers={layers} />
        ) : (
          <div className="relative aspect-video bg-ink-950">
            {twin.data ? (
              <TwinViewer twin={twin.data} timeRef={pb.timeRef} cloud={cloud.data?.points} highlight={step.objects[0] ?? null} className="absolute inset-0" />
            ) : (
              <Skeleton className="absolute inset-0 rounded-none" />
            )}
            <span className="telemetry pointer-events-none absolute top-3 left-3 rounded-sm bg-ink-950/75 px-2 py-1 text-[10px] text-fg-muted">digital twin · drag to orbit</span>
            <MusicCredit className="absolute top-3 right-3" />
            <Captions />
          </div>
        )}
        <AnimatePresence>
          {blocked && (
            <motion.button
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              onClick={() => narration.resume()}
              className="absolute top-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-ion px-3.5 py-1.5 text-xs font-medium text-ion-ink shadow-[0_8px_24px_-8px_rgb(60_215_255/0.7)]"
              data-testid="narration-unblock"
            >
              <Volume2 className="size-3.5" /> Play the narration
            </motion.button>
          )}
          {secondsLeft !== null && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="absolute right-3 bottom-3 z-10 flex items-center gap-1 rounded-full bg-ink-950/85 p-1 pl-3 text-xs text-fg-muted shadow-[0_0_0_1px_var(--color-line-strong)] backdrop-blur"
              data-testid="auto-advance"
            >
              <span>
                {step.index >= stepCount ? 'Quiz' : 'Next step'} in <span className="telemetry text-fg">{secondsLeft}</span>
              </span>
              <button onClick={cancel} className="rounded-full px-2.5 py-1 font-medium text-fg hover:bg-white/10">
                Stay
              </button>
              <button onClick={next} className="rounded-full bg-white/10 px-2.5 py-1 font-medium text-fg hover:bg-white/15">
                Go
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-wrap items-center gap-2" data-testid="transport">
        <IconButton label={pb.playing ? 'Pause' : 'Play'} onClick={pb.toggle} variant="secondary" size="sm" data-testid="play-toggle">
          {pb.playing ? <Pause className="size-4" /> : <Play className="size-4 fill-current" />}
        </IconButton>
        <div className="flex min-w-[180px] flex-1 items-center gap-2.5">
          <button
            className="group relative h-6 flex-1 cursor-pointer"
            aria-label="Seek within this step"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              pb.seek(t0 + ((e.clientX - r.left) / r.width) * (t1 - t0))
            }}
          >
            <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/[0.08]" />
            <span className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-ion" style={{ width: `${(local / Math.max(0.01, t1 - t0)) * 100}%` }} />
            <span
              className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_3px_rgb(60_215_255/0.3)] transition-transform group-hover:scale-110"
              style={{ left: `${(local / Math.max(0.01, t1 - t0)) * 100}%` }}
            />
          </button>
          <span className="telemetry shrink-0 text-[11px] text-fg-muted">
            {fmtClock(pb.time)} <span className="text-fg-faint">/ {fmtClock(t1)}</span>
          </span>
        </div>
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
        <Segmented
          label="View"
          value={view}
          onChange={setView}
          items={[
            { key: 'video', label: 'Video', icon: <Video className="size-3.5" /> },
            { key: '3d', label: '3D', icon: <BoxIcon className="size-3.5" /> },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3">
        <div className="flex items-center gap-1">
          <IconButton label={narrate ? 'Mute narration' : 'Turn narration on'} onClick={() => setNarrate(!narrate)} size="xs" data-testid="narration-toggle">
            {narrate ? <Volume2 className={cn('size-4', speaking && 'text-ion')} /> : <VolumeX className="size-4" />}
          </IconButton>
          <IconButton
            label="Replay narration"
            size="xs"
            onClick={() => {
              if (!narrate) setNarrate(true)
              narration.play(stepLine(step, lesson.lang))
            }}
            data-testid="narration-replay"
          >
            <RotateCcw className="size-3.5" />
          </IconButton>
          <span className="ml-1 text-xs text-fg-subtle">
            {narration.status === 'loading' ? 'Voicing the line…' : speaking ? (narration.line?.key === 'intro' ? 'Introduction' : 'Narrating') : narrate ? 'Narration on' : 'Narration off'}
          </span>
        </div>
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          <Switch checked={autoAdvance} onChange={setAutoAdvance} label="Auto-advance" />
          <SkipForward className="size-3.5 text-fg-subtle" /> Auto-advance
        </label>
        {view === 'video' && (
          <div className="ml-auto">
            <LayerToggles layers={layers} onChange={setLayers} />
          </div>
        )}
      </div>
    </div>
  )
}

function StepVideoWithChrome({ layers }: { layers: OverlayLayers }) {
  const { step, lesson } = useLessonCtx()
  const stepCount = useLesson((s) => s.stepCount)
  return (
    <StepVideo layers={layers}>
      <MusicCredit className="absolute top-3 right-3" />
      <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2">
        <span className="rounded-sm bg-ink-950/75 px-2 py-1 text-[11px] text-fg backdrop-blur">
          <span className="telemetry mr-1.5 text-ion">
            {String(step.index).padStart(2, '0')}/{String(stepCount).padStart(2, '0')}
          </span>
          {lesson.expert.name.split(' ')[0]}, looping this step
        </span>
      </div>
      <Captions />
    </StepVideo>
  )
}
