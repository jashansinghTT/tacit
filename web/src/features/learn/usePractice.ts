import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { HandFrame, LearnServerMsg, ServedBy, TacitSocket } from '@/lib/api'
import { learnApi } from '@/lib/api/learn'
import { useCamera, useFrameGrabber } from '@/lib/media'
import { useApp } from '@/lib/store'
import { toast } from '@/components/ui'
import { useLesson } from './store'

export type PracticeState = 'idle' | 'starting' | 'live' | 'error'

export interface LiveHands {
  hands: HandFrame[]
  size: [number, number]
  at: number
}

export interface Feedback {
  score: number
  phase: number
  hint: string | null
  at: number
}

const FRAME_MS = 100 // about 10 frames a second
const HINT_HOLD_MS = 2600 // one hint at a time: keep each on screen long enough to act on
const MAX_BUFFERED = 512 * 1024
const SAVE_WAIT_MS = 20_000

type LearnSocket = TacitSocket<LearnServerMsg, { type: 'frame'; t: number; jpeg: string } | { type: 'step'; index: number } | { type: 'stop' }>

/**
 * Practice on camera: opens a learn session and its socket, streams JPEG frames, and turns the
 * server's analysis and feedback into state for the view. `video` is the element showing the
 * camera; frames are grabbed from it.
 */
export function usePractice(video: React.RefObject<HTMLVideoElement | null>) {
  const camera = useCamera()
  const grab = useFrameGrabber(640)
  const lang = useApp((s) => s.lang)
  const step = useLesson((s) => s.step)
  const qc = useQueryClient()
  const [state, setState] = useState<PracticeState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [latency, setLatency] = useState<number | null>(null)
  const [servedBy, setServedBy] = useState<ServedBy[]>([])
  const [celebrate, setCelebrate] = useState<{ step: number; score: number; at: number } | null>(null)
  const [saved, setSaved] = useState<{ steps_done: number; best_score: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const hands = useRef<LiveHands | null>(null)
  const sock = useRef<LearnSocket | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const hintAt = useRef(0)
  const startedAt = useRef(0)
  const stepRef = useRef(step)
  stepRef.current = step

  const teardown = useCallback(() => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    sock.current?.close()
    sock.current = null
    hands.current = null
  }, [])

  const onMessage = useCallback((m: LearnServerMsg | { type: 'saved'; steps_done: number; best_score: number }) => {
    const L = useLesson.getState()
    if (m.type === 'analysis') {
      const size = (m as { size?: [number, number] }).size ?? [m.width ?? 640, m.height ?? 480]
      hands.current = { hands: m.hands, size, at: performance.now() }
      if (m.timing_ms?.total != null) setLatency(m.timing_ms.total)
      if (m.served_by?.length) setServedBy(m.served_by)
    } else if (m.type === 'feedback') {
      if (m.step_index !== stepRef.current) return
      const now = performance.now()
      setFeedback({ score: m.score, phase: m.phase, hint: m.hint, at: now })
      L.recordScore(m.step_index, m.score)
      if (m.hint && now - hintAt.current > HINT_HOLD_MS) {
        hintAt.current = now
        setHint(m.hint)
      }
    } else if (m.type === 'step_done') {
      L.recordDone(m.step_index, m.score)
      const at = performance.now()
      setCelebrate({ step: m.step_index, score: m.score, at })
      setTimeout(() => setCelebrate((c) => (c?.at === at ? null : c)), 2200)
      setFeedback(null)
      setHint(null)
      hintAt.current = 0
      if (m.step_index >= L.stepCount) {
        toast.ok('Every step practised', 'Take the quiz to earn the certificate.')
      } else if (L.autoAdvance) {
        L.goStep(m.step_index + 1)
      }
    } else if (m.type === 'error') {
      setError(m.message)
    } else if (m.type === 'saved') {
      setSaved({ steps_done: m.steps_done, best_score: m.best_score })
    }
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setSaved(null)
    setState('starting')
    const stream = await camera.start()
    if (!stream) {
      setState('error')
      return
    }
    let sid: string
    try {
      sid = await useLesson.getState().ensureSession(lang)
    } catch (e) {
      setError((e as Error).message)
      setState('error')
      camera.stop()
      return
    }
    const s = learnApi.practiceSocket(sid) as LearnSocket
    sock.current = s
    s.onMessage((m) => onMessage(m as LearnServerMsg))
    s.onState((st) => {
      if (st === 'open') setState('live')
      if ((st === 'error' || st === 'closed') && sock.current === s) {
        setError('The practice connection closed. Start again to keep going.')
        setState('error')
        teardown()
        useLesson.getState().dropSession()
      }
    })
    s.send({ type: 'step', index: stepRef.current })
    startedAt.current = performance.now()
    let busy = false
    timer.current = setInterval(async () => {
      const v = video.current
      if (!v || busy || s.state !== 'open' || s.bufferedAmount > MAX_BUFFERED) return
      busy = true
      try {
        const jpeg = await grab(v, 0.7)
        if (jpeg && sock.current === s) s.send({ type: 'frame', t: (performance.now() - startedAt.current) / 1000, jpeg })
      } finally {
        busy = false
      }
    }, FRAME_MS)
  }, [camera, grab, lang, onMessage, teardown, video])

  const stop = useCallback(async () => {
    const s = sock.current
    // The camera stops at once; the server's confirmation can take a few seconds to arrive.
    sock.current = null
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    hands.current = null
    camera.stop()
    setFeedback(null)
    setHint(null)
    setState('idle')
    if (!s || s.state !== 'open') return
    setSaving(true)
    const done = new Promise<void>((resolve) => {
      const off = s.onMessage((m) => {
        if ((m as { type: string }).type === 'saved') {
          off()
          resolve()
        }
      })
      setTimeout(resolve, SAVE_WAIT_MS)
    })
    s.send({ type: 'stop' })
    await done
    s.close()
    setSaving(false)
    void qc.invalidateQueries({ queryKey: ['learn'] })
  }, [camera, qc])

  // Tell the server which step the trainee is on.
  useEffect(() => {
    setFeedback(null)
    setHint(null)
    hintAt.current = 0
    sock.current?.send({ type: 'step', index: step })
  }, [step])

  useEffect(() => () => teardown(), [teardown])

  return { state, error: error ?? camera.error, stream: camera.stream, feedback, hint, latency, servedBy, celebrate, saved, saving, hands, start, stop }
}
