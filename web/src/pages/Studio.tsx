import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Camera, CircleDot, Film, Hand, Loader2, Play, RotateCcw, Sparkles, Square, Upload, Video } from 'lucide-react'
import { cn } from '@/lib/cn'
import { api, type Sample } from '@/lib/api'
import { qk, useJob, useSamples } from '@/lib/api/queries'
import { useCamera, useMicrophone, useSpeaker } from '@/lib/media'
import { fmtClock, fmtDuration } from '@/lib/format'
import { Page, PageHeader } from '@/components/layout/Page'
import { Badge, Button, ButtonLink, EmptyState, Panel, Segmented, Skeleton, Timeline, toast } from '@/components/ui'
import { OverlayCanvas } from '@/components/overlay/OverlayCanvas'
import { ALL_LAYERS, type OverlayLayers } from '@/components/overlay/draw'
import { LayerToggles } from '@/components/skill/SkillPlayer'
import { ProcessingPanel } from '@/components/skill/ProcessingPanel'
import { LatencyHud } from '@/components/studio/LatencyHud'
import { CoachPanel } from '@/components/studio/CoachPanel'
import { useCapture, type ChatLine } from '@/components/studio/useCapture'

type Source = 'webcam' | 'sample' | 'upload'

const EVENT_LABEL: Record<string, string> = { grasp: 'grasp', release: 'release', move: 'move', look: 'look', pause: 'pause' }

function SamplePicker({ samples, value, onChange, loading }: { samples: Sample[]; value: string | null; onChange: (id: string) => void; loading: boolean }) {
  if (loading) return <Skeleton className="h-40" />
  if (!samples.length)
    return (
      <EmptyState icon={<Film className="size-5" />} title="No sample clips on this box yet" className="py-8">
        Use your webcam or upload a video instead.
      </EmptyState>
    )
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {samples.map((s) => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          data-testid={`sample-${s.id}`}
          aria-pressed={value === s.id}
          className={cn('group overflow-hidden rounded-lg text-left transition-shadow', value === s.id ? 'shadow-[0_0_0_1.5px_var(--color-ion)]' : 'shadow-[0_0_0_1px_var(--color-line-strong)] hover:shadow-[0_0_0_1px_var(--color-line-bright)]')}
        >
          <div className="relative aspect-video bg-ink-950">
            <img src={s.thumb} alt="" className="size-full object-cover opacity-85" />
            <span className="telemetry absolute right-2 bottom-2 rounded-xs bg-ink-950/80 px-1.5 py-0.5 text-[10px] text-fg-muted">{fmtDuration(s.duration)}</span>
            {s.kind === 'ai-generated' && (
              <Badge tone="fault" className="absolute top-2 left-2">
                AI-generated
              </Badge>
            )}
          </div>
          <div className="bg-ink-800 px-3 py-2.5 text-[13px] text-fg">{s.title}</div>
        </button>
      ))}
    </div>
  )
}

export default function StudioPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const samples = useSamples()
  const [source, setSource] = useState<Source>((params.get('source') as Source) || 'webcam')
  const [sampleId, setSampleId] = useState<string | null>(null)
  const [layers, setLayers] = useState<OverlayLayers>(ALL_LAYERS)
  const [handsFree, setHandsFree] = useState(true)
  const [busy, setBusy] = useState(false)
  const [offlineJob, setOfflineJob] = useState<{ skillId: string; jobId: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const cam = useCamera()
  const cap = useCapture()
  const speaker = useSpeaker()
  const live = cap.phase === 'live'

  useEffect(() => {
    if (!sampleId && samples.data?.length) setSampleId(samples.data.find((s) => s.kind === 'real')?.id ?? samples.data[0].id)
  }, [samples.data, sampleId])

  // Coach voice: play each question as its audio arrives; pause hands-free listening meanwhile.
  const speaking = useRef(false)
  const [speakingLine, setSpeakingLine] = useState<ChatLine | null>(null)
  const playLine = useCallback(
    async (l: ChatLine, audio: string | null) => {
      speaking.current = true
      setSpeakingLine(l)
      await speaker.say({ id: l.id, text: l.text, audio, who: 'Coach' })
      speaking.current = false
      setTimeout(() => setSpeakingLine((s) => (s?.id === l.id ? null : s)), 2500)
    },
    [speaker],
  )
  cap.listeners.current.onCoach = (l) => {
    if (l.audio) void playLine(l, l.audio)
    else setSpeakingLine(l)
  }
  cap.listeners.current.onCoachAudio = (id, audio) => {
    const l = cap.chat.find((x) => x.id === id) ?? { id, who: 'coach' as const, text: speakingLine?.text ?? '', t: 0 }
    void playLine({ ...l, audio }, audio)
  }

  const lastQuestion = useMemo(() => [...cap.chat].reverse().find((l) => l.who === 'coach')?.questionId ?? null, [cap.chat])
  // Hands-free only listens while a question is open: asked, voiced, and not answered yet.
  const awaiting = useMemo(() => {
    const last = cap.chat.at(-1)
    return Boolean(last && last.who === 'coach' && !last.pendingAudio)
  }, [cap.chat])
  const mic = useMicrophone({
    autoStart: handsFree && live && awaiting && !speaker.playing,
    silenceMs: 1000,
    onUtterance: (wav) => {
      if (speaking.current) return
      void cap.answer(wav, lastQuestion)
    },
  })
  useEffect(() => {
    if (live) void mic.start()
    else mic.stop()
    // the mic follows the capture phase only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, cap.phase])

  // Attach the camera stream or the sample clip to the live video element.
  useEffect(() => {
    const v = video.current
    if (!v) return
    if (source === 'webcam' && cam.stream) {
      v.srcObject = cam.stream
      void v.play().catch(() => undefined)
    } else if (source === 'sample') {
      v.srcObject = null
    }
  }, [cam.stream, source])

  const sample = samples.data?.find((s) => s.id === sampleId) ?? null

  const startLive = async () => {
    const v = video.current
    if (!v) return
    setBusy(true)
    try {
      if (source === 'webcam' && !cam.stream) {
        const s = await cam.start()
        if (!s) return
        v.srcObject = s
        await v.play().catch(() => undefined)
      }
      if (source === 'sample') {
        if (!sample) return
        v.srcObject = null
        v.src = sample.video
        v.currentTime = 0
        await v.play().catch(() => undefined)
      }
      const r = await api.createSkill({ source: 'live' })
      cap.start(r.skill_id, v)
    } catch (e) {
      toast.error('Could not start the capture', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const stopLive = () => {
    cap.stop()
    video.current?.pause()
    speaker.stop()
  }

  const processOffline = async (kind: 'sample' | 'upload', file?: File) => {
    setBusy(true)
    try {
      const r = kind === 'sample' && sampleId ? await api.createSkill({ source: 'sample', sample_id: sampleId }) : file ? await api.uploadSkill(file, file.name.replace(/\.[^.]+$/, '')) : null
      if (!r) return
      const p = await api.process(r.skill_id)
      setOfflineJob({ skillId: r.skill_id, jobId: p.job_id })
      void qc.invalidateQueries({ queryKey: ['skills'] })
      toast.info('Processing started', 'Every frame runs through the same models as a live capture.')
    } catch (e) {
      toast.error('Could not start processing', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f && f.type.startsWith('video/')) void processOffline('upload', f)
    else if (f) toast.warn('That is not a video file')
  }

  const finishedJob = cap.phase === 'saved' ? cap.jobId : offlineJob?.jobId ?? null
  const finishedSkill = cap.phase === 'saved' ? cap.skillId : offlineJob?.skillId ?? null
  const job = useJob(finishedJob, (j) => {
    void qc.invalidateQueries({ queryKey: ['skills'] })
    if (finishedSkill) void qc.invalidateQueries({ queryKey: qk.skill(finishedSkill) })
    if (j.status === 'done') toast.ok('Skill ready', 'Open it to see the steps, twin, SOP and verification.')
    else if (j.status === 'failed') toast.error('Processing failed', j.error ?? undefined)
  })

  const latest = cap.latest
  const srcW = () => latest.current?.width ?? cap.sentSize.current.w
  const srcH = () => latest.current?.height ?? cap.sentSize.current.h
  const segments = cap.steps.filter((s) => s.t_start != null && s.t_end != null).map((s, i) => ({ id: s.id ?? `s${i}`, label: s.title ?? `Step ${i + 1}`, t0: s.t_start!, t1: s.t_end!, done: true }))
  const showStage = cap.phase !== 'idle' || (source === 'webcam' && cam.stream) || (source === 'sample' && sample)

  if (finishedJob && finishedSkill) {
    return (
      <Page testId="page-studio" wide>
        <PageHeader eyebrow="Studio" title={job?.status === 'done' ? 'Your skill is ready' : 'Turning the capture into a skill'} description="Every stage runs on the box. Each one says which model and chip did the work." />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <ProcessingPanel job={job} />
          <div className="space-y-4">
            <Panel title="What you captured">
              <dl className="grid grid-cols-3 gap-3">
                <div>
                  <dt className="eyebrow">Steps closed</dt>
                  <dd className="telemetry mt-1 text-xl text-fg">{cap.steps.length || '–'}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Answers</dt>
                  <dd className="telemetry mt-1 text-xl text-fg">{cap.chat.filter((c) => c.who === 'expert' && c.text).length || '–'}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Length</dt>
                  <dd className="telemetry mt-1 text-xl text-fg">{cap.elapsed ? fmtClock(cap.elapsed) : '–'}</dd>
                </div>
              </dl>
            </Panel>
            {cap.chat.length > 0 && (
              <Panel title="Your answers" eyebrow="attached to their steps" pad={false}>
                <ul className="divide-y divide-line">
                  {cap.chat.filter((l) => l.who === 'coach').map((q) => {
                    const a = cap.chat.find((l) => l.who === 'expert' && l.questionId === q.questionId && l.text)
                    return (
                      <li key={q.id} className="px-4 py-3">
                        <p className="text-[13px] text-fg-muted">{q.text}</p>
                        <p className={cn('mt-1 text-[13px]', a ? 'text-fg italic' : 'text-fg-faint')}>{a ? `"${a.text}"` : 'Not answered yet: you can answer it on the skill page.'}</p>
                      </li>
                    )
                  })}
                </ul>
              </Panel>
            )}
            <Panel>
              <div className="flex flex-col gap-3">
                <ButtonLink to={`/skills/${finishedSkill}`} variant={job?.status === 'done' ? 'primary' : 'secondary'} iconRight={<ArrowRight className="size-4" />} data-testid="open-skill">
                  {job?.status === 'done' ? 'Open the skill' : 'Open the skill page (fills in as it goes)'}
                </ButtonLink>
                <Button
                  variant="ghost"
                  icon={<RotateCcw className="size-4" />}
                  onClick={() => {
                    cap.reset()
                    setOfflineJob(null)
                    navigate('/studio', { replace: true })
                  }}
                >
                  Capture another
                </Button>
              </div>
            </Panel>
          </div>
        </div>
      </Page>
    )
  }

  return (
    <Page testId="page-studio" wide>
      <PageHeader
        eyebrow="Studio · Watch"
        title="Capture a skill"
        description="Work as you always do. Tacit tracks your hands in 3D, where you look and which parts you touch, and asks you why at each step."
        meta={
          live ? (
            <Badge tone="fault" dot pulse size="md">
              Recording · {fmtClock(cap.elapsed)}
            </Badge>
          ) : cap.phase === 'connecting' ? (
            <Badge tone="ion" size="md" icon={<Loader2 className="size-3 animate-spin" />}>
              Connecting to the box
            </Badge>
          ) : cap.phase === 'stopping' ? (
            <Badge tone="ion" size="md" icon={<Loader2 className="size-3 animate-spin" />}>
              Saving
            </Badge>
          ) : null
        }
        actions={
          live || cap.phase === 'connecting' ? (
            <Button variant="danger" size="lg" icon={<Square className="size-4 fill-current" />} onClick={stopLive} data-testid="capture-stop">
              Stop and process
            </Button>
          ) : cap.phase === 'stopping' || cap.phase === 'saved' ? (
            <Button variant="secondary" size="lg" loading disabled>
              Saving the capture
            </Button>
          ) : (
            source !== 'upload' && (
              <Button variant="primary" size="lg" icon={<CircleDot className="size-4" />} onClick={startLive} loading={busy} disabled={source === 'sample' && !sample} data-testid="capture-start">
                Start capture
              </Button>
            )
          )
        }
      />
      {cap.error && <div className="mb-4 rounded-lg bg-fault-soft px-4 py-3 text-[13px] text-fault" role="alert">{cap.error}</div>}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,8fr)_minmax(340px,4fr)]">
        <div className="min-w-0 space-y-4">
          {cap.phase === 'idle' && (
            <Panel data-tour="studio-source" title="Source" actions={<Segmented<Source> label="Capture source" value={source} onChange={setSource} items={[{ key: 'webcam', label: 'Webcam', icon: <Camera className="size-3.5" /> }, { key: 'sample', label: 'Sample', icon: <Film className="size-3.5" /> }, { key: 'upload', label: 'Upload', icon: <Upload className="size-3.5" /> }]} />}>
              {source === 'webcam' && (
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="max-w-lg text-[13px] text-fg-muted">
                    Point the camera at your bench so both hands, your face and the parts are in view. Frames stream to the box at about 10 per second; nothing is recorded until you press Start.
                  </p>
                  {!cam.stream && (
                    <Button variant="secondary" icon={<Video className="size-4" />} onClick={() => void cam.start()} loading={cam.state === 'starting'} data-testid="camera-preview">
                      Preview camera
                    </Button>
                  )}
                  {cam.error && <p className="text-xs text-fault">{cam.error}</p>}
                </div>
              )}
              {source === 'sample' && (
                <div className="space-y-3">
                  <SamplePicker samples={samples.data ?? []} value={sampleId} onChange={setSampleId} loading={samples.isLoading} />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-subtle">
                    <span>Start streams the clip through the live pipeline, coach included.</span>
                    <Button size="sm" variant="ghost" onClick={() => void processOffline('sample')} disabled={!sample || busy} data-testid="sample-offline">
                      Process offline instead
                    </Button>
                  </div>
                </div>
              )}
              {source === 'upload' && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  className={cn('flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center transition-colors', dragOver ? 'border-ion bg-ion/[0.05]' : 'border-line-strong')}
                  data-testid="upload-drop"
                >
                  <Upload className="size-6 text-fg-subtle" />
                  <div className="text-sm text-fg">Drop a video of someone doing the task</div>
                  <div className="max-w-sm text-xs text-fg-subtle">It runs through the same per-frame analysis offline. The model drafts the "why" notes, and the expert can answer them later on the skill page.</div>
                  <input ref={fileInput} type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && void processOffline('upload', e.target.files[0])} />
                  <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()} loading={busy}>
                    Choose a file
                  </Button>
                </div>
              )}
            </Panel>
          )}

          <Panel pad={false} className={cn(!showStage && source === 'upload' && 'hidden')} data-testid="live-stage">
            <div className="relative aspect-video overflow-hidden rounded-t-lg bg-ink-950">
              <video ref={video} className="absolute inset-0 size-full object-contain" playsInline muted loop={source === 'sample'} crossOrigin="anonymous" aria-label="Live camera" />
              {!showStage && (
                <div className="absolute inset-0 grid place-items-center grid-bg">
                  <div className="text-center">
                    <Hand className="mx-auto size-8 text-fg-faint" />
                    <p className="mt-3 text-sm text-fg-subtle">{source === 'webcam' ? 'Preview the camera or press Start.' : 'Pick a sample clip.'}</p>
                  </div>
                </div>
              )}
              <OverlayCanvas getFrame={() => (live || cap.phase === 'stopping' ? latest.current : null)} srcW={srcW()} srcH={srcH()} layers={layers} />
              {live && <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 animate-scan bg-gradient-to-b from-transparent via-ion/[0.07] to-transparent" aria-hidden />}
              <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2">
                {live && (
                  <span className="flex items-center gap-1.5 rounded-sm bg-fault/90 px-2 py-1 text-[10px] font-semibold tracking-wider text-white">
                    <span className="size-1.5 animate-pulse rounded-full bg-white" /> REC
                  </span>
                )}
                {live && <span className="telemetry rounded-sm bg-ink-950/75 px-2 py-1 text-[10px] text-fg-muted backdrop-blur">{fmtClock(cap.elapsed)}</span>}
              </div>
              <AnimatePresence>
                {cap.events[0] && live && (
                  <motion.div key={`${cap.events[0].t}-${cap.events[0].kind}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="pointer-events-none absolute top-3 right-3 rounded-md bg-ink-950/80 px-2.5 py-1.5 text-xs text-fg backdrop-blur">
                    <span className="telemetry mr-1.5 text-ion">{EVENT_LABEL[cap.events[0].kind] ?? cap.events[0].kind}</span>
                    {cap.events[0].hand && <span className="text-fg-muted">{cap.events[0].hand} hand</span>}
                    {cap.events[0].object && <span className="text-fg-muted"> · {cap.events[0].object}</span>}
                  </motion.div>
                )}
              </AnimatePresence>
              {speakingLine && (
                <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
                  <div className="max-w-2xl rounded-lg bg-ink-950/85 px-4 py-2.5 text-center text-sm text-fg backdrop-blur" data-testid="coach-caption">
                    <span className="mr-1.5 font-medium text-ion">Coach:</span>
                    {speakingLine.text}
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
              <LayerToggles layers={layers} onChange={setLayers} />
              <span className="flex items-center gap-1.5 text-xs text-fg-subtle">
                {source === 'sample' ? <Play className="size-3.5" /> : <Camera className="size-3.5" />}
                {source === 'sample' ? (sample?.title ?? 'Sample clip') : cam.stream ? cam.stream.getVideoTracks()[0]?.label || 'Camera' : 'No camera yet'}
              </span>
            </div>
            <div className="border-t border-line px-4 py-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-fg-muted">Steps</span>
                <span className="telemetry text-fg-subtle">{cap.steps.length} closed</span>
              </div>
              {segments.length ? (
                <Timeline segments={segments} duration={Math.max(cap.elapsed, segments.at(-1)?.t1 ?? 1)} time={cap.elapsed} />
              ) : (
                <div className="flex h-9 items-center justify-center rounded-sm bg-white/[0.02] text-[11px] text-fg-faint shadow-[inset_0_0_0_1px_var(--color-line)]">
                  {live ? 'A step closes when a grasp and release finish a movement' : 'Steps appear here as they close'}
                </div>
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <LatencyHud timing={cap.timing} served={cap.served} stats={cap.stats} live={live} />
          <CoachPanel
            chat={cap.chat}
            live={live}
            speaking={speakingLine}
            mic={{ state: mic.state, level: mic.level, begin: () => void mic.begin(), end: mic.end }}
            handsFree={handsFree}
            onHandsFree={setHandsFree}
            onSay={(t) => cap.say(t, lastQuestion)}
            onReplay={(l) => void playLine(l, l.audio ?? null)}
            expertName="Maria"
          />
          {live && cap.events.length > 0 && (
            <Panel title="Events" eyebrow="grasps, releases and gaze shifts" pad={false}>
              <ul className="max-h-48 divide-y divide-line overflow-y-auto text-xs">
                {cap.events.map((e, i) => (
                  <li key={`${e.t}-${i}`} className="flex items-center justify-between px-4 py-1.5">
                    <span className="text-fg-muted">
                      <span className="telemetry mr-2 text-ion">{e.kind}</span>
                      {[e.hand && `${e.hand} hand`, e.object].filter(Boolean).join(' · ')}
                    </span>
                    <span className="telemetry text-fg-faint">{e.t.toFixed(1)} s</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {cap.phase === 'idle' && (
            <p className="flex gap-2 px-1 text-xs text-fg-subtle">
              <Sparkles className="size-3.5 shrink-0 text-ion" /> Raw video stays on this box. Only motion, gaze and text can ever be shared, and only with your consent.
            </p>
          )}
        </div>
      </div>
    </Page>
  )
}
