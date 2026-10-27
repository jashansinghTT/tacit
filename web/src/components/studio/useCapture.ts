import { useCallback, useEffect, useRef, useState } from 'react'
import { blobToBase64, useFrameGrabber } from '@/lib/media'
import { api, sockets, type AnalysisMsg, type CaptureEventMsg, type CaptureServerMsg, type ServedBy, type Step, type TacitSocket, type CaptureClientMsg } from '@/lib/api'

export type CapturePhase = 'idle' | 'connecting' | 'live' | 'stopping' | 'saved' | 'error'

export interface ChatLine {
  id: string
  who: 'coach' | 'expert'
  text: string
  t: number
  audio?: string | null
  pendingAudio?: boolean
  questionId?: string | null
  ms?: number
  /** performance.now() when an answer was sent (placeholder lines only). */
  sentAt?: number
}

const FPS = 10
const MAX_IN_FLIGHT = 3

/**
 * Live capture over `WS /ws/capture/{skill_id}`: sends JPEG frames from a video element at about
 * 10 fps (skipping frames when the box is behind), and collects analysis, events, closed steps,
 * coach questions and transcripts.
 */
export function useCapture() {
  const [phase, setPhase] = useState<CapturePhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [skillId, setSkillId] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [steps, setSteps] = useState<Partial<Step>[]>([])
  const [events, setEvents] = useState<CaptureEventMsg[]>([])
  const [chat, setChat] = useState<ChatLine[]>([])
  const [timing, setTiming] = useState<Record<string, number>>({})
  const [served, setServed] = useState<ServedBy[]>([])
  const [stats, setStats] = useState({ sent: 0, analysed: 0, dropped: 0, fps: 0, lagMs: 0 })
  const [elapsed, setElapsed] = useState(0)
  const latest = useRef<AnalysisMsg | null>(null)
  const sentSize = useRef({ w: 960, h: 540 })
  const sock = useRef<TacitSocket<CaptureServerMsg, CaptureClientMsg> | null>(null)
  const inFlight = useRef(new Map<number, number>())
  const started = useRef(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const grab = useFrameGrabber(960)
  const counters = useRef({ sent: 0, analysed: 0, dropped: 0, window: [] as number[], lag: 0 })
  const skillIdRef = useRef<string | null>(null)
  const phaseRef = useRef<CapturePhase>('idle')
  const stopPoll = useRef<ReturnType<typeof setTimeout> | null>(null)
  skillIdRef.current = skillId
  phaseRef.current = phase
  const listeners = useRef<{ onCoach?: (l: ChatLine) => void; onCoachAudio?: (id: string, audio: string) => void }>({})

  const cleanup = useCallback(() => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }, [])
  useEffect(() => () => void (stopPoll.current && clearTimeout(stopPoll.current)), [])

  const handle = useCallback((m: CaptureServerMsg) => {
    switch (m.type) {
      case 'analysis': {
        latest.current = m
        const sentAt = inFlight.current.get(m.t)
        inFlight.current.delete(m.t)
        // anything older than this frame is not coming back
        for (const k of inFlight.current.keys()) if (k < m.t) inFlight.current.delete(k)
        const c = counters.current
        c.analysed++
        const now = performance.now()
        c.window = [...c.window.filter((x) => now - x < 2000), now]
        if (sentAt) c.lag = c.lag * 0.8 + (now - sentAt) * 0.2
        setTiming(m.timing_ms ?? {})
        if (m.served_by?.length) setServed(m.served_by)
        break
      }
      case 'event':
        setEvents((e) => [m, ...e].slice(0, 30))
        break
      case 'step':
        setSteps((s) => {
          const i = s.findIndex((x) => x.id === m.step.id || x.index === m.step.index)
          if (i >= 0) {
            const copy = s.slice()
            copy[i] = { ...copy[i], ...m.step }
            return copy
          }
          return [...s, m.step]
        })
        break
      case 'coach': {
        const line: ChatLine = { id: m.id, who: 'coach', text: m.text, t: m.t, audio: m.audio, pendingAudio: Boolean(m.pending_audio && !m.audio), questionId: m.id }
        setChat((c) => [...c, line])
        listeners.current.onCoach?.(line)
        break
      }
      case 'coach_audio':
        setChat((c) => c.map((l) => (l.id === m.id ? { ...l, audio: m.audio, pendingAudio: false } : l)))
        listeners.current.onCoachAudio?.(m.id, m.audio)
        break
      case 'transcript':
        setChat((c) => {
          // replace the "transcribing" placeholder for this question if there is one
          const i = c.findIndex((l) => l.who === 'expert' && l.text === '' && l.questionId === m.question_id)
          const line: ChatLine = { id: `a-${Date.now()}`, who: 'expert', text: m.text, t: (performance.now() - started.current) / 1000, questionId: m.question_id, ms: m.ms }
          if (i >= 0) {
            const copy = c.slice()
            copy[i] = line
            return copy
          }
          return [...c, line]
        })
        break
      case 'saved':
        setJobId(m.job_id)
        setSkillId(m.skill_id)
        setPhase('saved')
        break
      case 'error':
        setError(m.message)
        break
    }
  }, [])

  /** Open the socket for `id` and start sending frames from `video`. */
  const start = useCallback(
    (id: string, video: HTMLVideoElement) => {
      cleanup()
      setSkillId(id)
      setPhase('connecting')
      setError(null)
      setSteps([])
      setEvents([])
      setChat([])
      setJobId(null)
      latest.current = null
      inFlight.current.clear()
      counters.current = { sent: 0, analysed: 0, dropped: 0, window: [], lag: 0 }
      const s = sockets.capture(id)
      sock.current = s
      s.onMessage(handle)
      s.onState((st, reason) => {
        if (st === 'open') {
          started.current = performance.now()
          setPhase('live')
        } else if (st === 'error') {
          setError('The connection to the box failed. Start again when it is back; the top bar shows when it is.')
          setPhase((p) => (p === 'saved' ? p : 'error'))
          cleanup()
        } else if (st === 'closed') {
          cleanup()
          setPhase((p) => {
            if (p === 'stopping') {
              // Closed after stop without a `saved` message: the skill record knows its job.
              void api
                .skill(id)
                .then((sk) => {
                  setJobId((j) => j ?? sk.job_id ?? null)
                  setPhase('saved')
                })
                .catch(() => setError('The capture was stopped, but the box did not confirm it was saved.'))
              return p
            }
            if (p !== 'saved') setError(reason || 'The connection to the box dropped. Start again when it is back; the top bar shows when it is.')
            return p === 'saved' ? p : 'error'
          })
        }
      })
      timer.current = setInterval(async () => {
        if (s.state !== 'open') return
        const t = (performance.now() - started.current) / 1000
        setElapsed(t)
        const c = counters.current
        if (inFlight.current.size >= MAX_IN_FLIGHT || s.bufferedAmount > 512 * 1024) {
          c.dropped++
          return
        }
        if (video.paused && !video.srcObject) return
        const jpeg = await grab(video)
        if (!jpeg) return
        const tt = Math.round(t * 1000) / 1000
        inFlight.current.set(tt, performance.now())
        sentSize.current = { w: Math.min(960, video.videoWidth), h: Math.round((Math.min(960, video.videoWidth) / video.videoWidth) * video.videoHeight) }
        s.send({ type: 'frame', t: tt, jpeg })
        c.sent++
        const now = performance.now()
        setStats({ sent: c.sent, analysed: c.analysed, dropped: c.dropped, fps: c.window.filter((x) => now - x < 2000).length / 2, lagMs: c.lag })
      }, 1000 / FPS)
    },
    [cleanup, grab, handle],
  )

  const stop = useCallback(() => {
    cleanup()
    setPhase('stopping')
    sock.current?.send({ type: 'stop' })
    // The box normally answers `saved` within a second, but it can be busy finishing coach audio.
    // If it is slow, follow the skill record instead: it gets its job id when processing starts.
    const id = skillIdRef.current
    if (!id) return
    let tries = 0
    const poll = async () => {
      if (phaseRef.current !== 'stopping') return
      try {
        const sk = await api.skill(id)
        if (sk.job_id && phaseRef.current === 'stopping') {
          setJobId(sk.job_id)
          setPhase('saved')
          return
        }
      } catch {
        /* keep waiting */
      }
      if (++tries < 40) stopPoll.current = setTimeout(poll, 3000)
      else setError('The box has not confirmed the capture yet. It is listed under Skills once processing starts.')
    }
    stopPoll.current = setTimeout(poll, 12000)
  }, [cleanup])

  const answer = useCallback(async (wav: Blob, questionId: string | null) => {
    const t = (performance.now() - started.current) / 1000
    setChat((c) => [...c, { id: `p-${Date.now()}`, who: 'expert', text: '', t, questionId, sentAt: performance.now() }])
    sock.current?.send({ type: 'answer', t, wav: await blobToBase64(wav), ...(questionId ? { question_id: questionId } : {}) })
  }, [])

  const say = useCallback((text: string, questionId: string | null) => {
    sock.current?.send({ type: 'say', text, ...(questionId ? { question_id: questionId } : {}) })
  }, [])

  const reset = useCallback(() => {
    cleanup()
    sock.current?.close()
    sock.current = null
    setPhase('idle')
    setSkillId(null)
    setJobId(null)
    setError(null)
  }, [cleanup])

  useEffect(
    () => () => {
      cleanup()
      sock.current?.close()
    },
    [cleanup],
  )

  return { phase, error, skillId, jobId, steps, events, chat, timing, served, stats, elapsed, latest, sentSize, listeners, start, stop, answer, say, reset }
}
