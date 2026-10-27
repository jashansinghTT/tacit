import { useCallback, useEffect, useRef, useState } from 'react'
import { askTutor, type ChatTurn, type TutorAudioPart, type TutorDoneEvent, type TutorInput } from '@/lib/api/learn'
import { AudioQueue } from './audioQueue'

/** Languages the tutor answers and speaks in (backend/tacit/pipeline/writer.py LANGS). */
export const TUTOR_LANGS: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
]

export interface Turn {
  id: string
  question: string
  voice: boolean
  /** A spoken question is being transcribed. */
  transcribing: boolean
  answer: string
  /** `done` once the text is final; the last sentences may still be voicing after that. */
  status: 'streaming' | 'done' | 'error'
  /** The stream is still open, delivering spoken sentences. */
  voicing: boolean
  error?: string
  audio: string[]
  sources: string[]
  lang: string
  /** Index of the sentence being spoken, or null. */
  speaking: number | null
  ms?: number
}

let seq = 0
/** Older backends sent `done` only after every sentence was voiced; then text is final once deltas pause. */
const QUIET_MS = 2500

/** "Ask the expert": streams the tutor's answer and speaks each sentence as it is ready. */
export function useTutor(skillId: string) {
  const [turns, setTurns] = useState<Turn[]>([])
  const queue = useRef<AudioQueue | null>(null)
  const abort = useRef<AbortController | null>(null)
  const turnsRef = useRef<Turn[]>([])
  turnsRef.current = turns

  const patch = useCallback((id: string, f: (t: Turn) => Partial<Turn>) => {
    setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...f(t) } : t)))
  }, [])

  const stopVoice = useCallback(() => {
    queue.current?.stop()
    queue.current = null
  }, [])

  const playParts = useCallback(
    (id: string, parts: string[]) => {
      stopVoice()
      const q = new AudioQueue()
      queue.current = q
      q.onChange(({ index }) => patch(id, () => ({ speaking: index })))
      parts.forEach((u, i) => q.push(i, u))
      return q
    },
    [patch, stopVoice],
  )

  const ask = useCallback(
    async (input: TutorInput, lang: string) => {
      // A new question supersedes one that is still being voiced.
      if (turnsRef.current.some((t) => t.status === 'streaming')) return
      abort.current?.abort()
      stopVoice()
      const id = `t${++seq}`
      const voice = 'audio' in input
      const history: ChatTurn[] = turnsRef.current
        .filter((t) => t.status === 'done' && t.question && t.answer)
        .slice(-3)
        .flatMap((t) => [
          { role: 'user' as const, content: t.question },
          { role: 'assistant' as const, content: t.answer },
        ])
      setTurns((ts) => [
        ...ts,
        { id, question: voice ? '' : (input as { question: string }).question, voice, transcribing: voice, answer: '', status: 'streaming', voicing: true, audio: [], sources: [], lang, speaking: null },
      ])
      const q = new AudioQueue()
      queue.current = q
      q.onChange(({ index }) => patch(id, () => ({ speaking: index })))
      const ctl = new AbortController()
      abort.current = ctl
      const t0 = performance.now()
      let quiet: ReturnType<typeof setTimeout> | null = null
      try {
        for await (const ev of askTutor(skillId, input, lang, history, ctl.signal)) {
          let data: unknown = null
          try {
            data = JSON.parse(ev.data)
          } catch {
            continue
          }
          if (ev.event === 'transcript') {
            patch(id, () => ({ question: (data as { text: string }).text, transcribing: false }))
          } else if (ev.event === 'delta') {
            const text = (data as { text: string }).text
            patch(id, (t) => ({ answer: t.answer + text, transcribing: false }))
            if (quiet) clearTimeout(quiet)
            quiet = setTimeout(() => patch(id, (t) => (t.status === 'streaming' ? { status: 'done', ms: performance.now() - t0 - QUIET_MS } : {})), QUIET_MS)
          } else if (ev.event === 'audio') {
            const a = data as TutorAudioPart
            patch(id, (t) => {
              const audio = [...t.audio]
              audio[a.index] = a.audio
              return { audio }
            })
            q.push(a.index, a.audio)
          } else if (ev.event === 'done') {
            if (quiet) clearTimeout(quiet)
            const d = data as TutorDoneEvent
            patch(id, (t) => ({
              status: 'done',
              answer: d.text || t.answer,
              question: t.question || d.question,
              sources: d.sources ?? [],
              transcribing: false,
              ms: t.ms ?? performance.now() - t0,
            }))
          } else if (ev.event === 'error') {
            patch(id, () => ({ status: 'error', error: (data as { message: string }).message, transcribing: false }))
          } else if (ev.event === 'end') {
            break
          }
        }
        patch(id, (t) => ({ ...(t.status === 'streaming' ? { status: 'done' as const, ms: t.ms ?? performance.now() - t0 } : {}), voicing: false, transcribing: false }))
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          patch(id, (t) => ({ status: t.status === 'error' ? 'error' : 'done', voicing: false, transcribing: false }))
        } else {
          patch(id, () => ({ status: 'error', error: (e as Error).message, voicing: false, transcribing: false }))
        }
      } finally {
        if (quiet) clearTimeout(quiet)
        if (abort.current === ctl) abort.current = null
      }
    },
    [patch, skillId, stopVoice],
  )

  const cancel = useCallback(() => {
    abort.current?.abort()
    stopVoice()
  }, [stopVoice])

  /** Ask a failed question again (a spoken one by its transcript). */
  const retry = useCallback(
    (id: string) => {
      const t = turnsRef.current.find((x) => x.id === id)
      if (!t?.question) return
      setTurns((ts) => ts.filter((x) => x.id !== id))
      turnsRef.current = turnsRef.current.filter((x) => x.id !== id)
      void ask({ question: t.question }, t.lang)
    },
    [ask],
  )

  const replay = useCallback((id: string) => {
    const t = turnsRef.current.find((x) => x.id === id)
    if (t?.audio.length) playParts(id, t.audio.filter(Boolean))
  }, [playParts])

  useEffect(() => () => {
    abort.current?.abort()
    queue.current?.stop()
  }, [])

  const busy = turns.some((t) => t.status === 'streaming')
  return { turns, ask, cancel, replay, retry, stopVoice, busy }
}

/** Sentences as the backend cuts them for speech (after ". ", "? " or "! ", at least 12 chars). */
export function splitSentences(text: string): string[] {
  const out: string[] = []
  let last = 0
  for (let i = 1; i < text.length; i++) {
    if ('.?!'.includes(text[i - 1]) && text[i] === ' ' && i - last > 12) {
      out.push(text.slice(last, i))
      last = i
    }
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
