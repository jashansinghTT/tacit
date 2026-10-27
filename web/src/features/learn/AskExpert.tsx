import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowUp, Languages, Loader2, Mic, Square, Volume2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useMicrophone } from '@/lib/media'
import { useApp } from '@/lib/store'
import { fmtMs } from '@/lib/format'
import { Avatar, Badge, IconButton, Select } from '@/components/ui'
import { LevelMeter } from '@/components/speech/Speech'
import { useLessonCtx } from './context'
import { useLesson } from './store'
import { splitSentences, TUTOR_LANGS, useTutor, type Turn } from './useTutor'

function lowerFirst(s: string) {
  return s ? s[0].toLowerCase() + s.slice(1) : s
}

function Answer({ turn, onReplay, onSource }: { turn: Turn; onReplay: () => void; onSource: (step: number) => void }) {
  const { lesson } = useLessonCtx()
  const sentences = useMemo(() => splitSentences(turn.answer), [turn.answer])
  const first = lesson.expert.name.split(' ')[0]
  return (
    <div className="flex gap-2.5" data-testid="tutor-answer" data-status={turn.status}>
      <Avatar name={lesson.expert.name} size={26} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-[11px] text-fg-subtle">
          <span className="font-medium text-fg-muted">Tutor</span>
          <span>from {first}'s skill</span>
          <Badge tone="violet" className="h-4 px-1.5 text-[9.5px]">
            AI
          </Badge>
          {turn.speaking !== null && (
            <span className="ml-auto inline-flex items-center gap-1 text-ion" data-testid="tutor-speaking">
              <Volume2 className="size-3 animate-pulse" /> speaking
            </span>
          )}
        </div>
        {turn.status === 'error' ? (
          <p className="flex items-start gap-2 rounded-lg bg-fault-soft px-3 py-2 text-[13px] text-fault" role="alert">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {turn.error ?? 'The tutor did not answer.'}
          </p>
        ) : (
          <p className="text-[14px] leading-relaxed text-fg-muted" data-testid="tutor-answer-text">
            {sentences.map((s, i) => (
              <span key={i} className={cn('transition-colors', turn.speaking === i ? 'text-fg underline decoration-ion/60 decoration-2 underline-offset-4' : turn.speaking !== null ? 'text-fg-subtle' : 'text-fg')}>
                {s}
              </span>
            ))}
            {turn.status === 'streaming' && <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-[1px] bg-ion" aria-hidden />}
            {turn.status === 'streaming' && !turn.answer && <span className="text-fg-subtle">{turn.transcribing ? 'Listening to your question…' : 'Thinking…'}</span>}
          </p>
        )}
        {turn.status === 'done' && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {turn.sources.map((s) => {
              const n = Number(s.replace(/\D/g, ''))
              return (
                <button key={s} onClick={() => onSource(n)} className="telemetry rounded-sm bg-ion-soft px-1.5 py-0.5 text-[10px] text-ion hover:bg-ion/20">
                  step {n}
                </button>
              )
            })}
            {turn.audio.length > 0 && (
              <button onClick={onReplay} className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-fg-subtle hover:bg-white/5 hover:text-fg" data-testid="tutor-replay">
                <Volume2 className="size-3" /> Play again
              </button>
            )}
            {turn.ms != null && <span className="telemetry ml-auto text-[10px] text-fg-faint">{fmtMs(turn.ms)}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function Question({ turn }: { turn: Turn }) {
  return (
    <div className="flex justify-end" data-testid="tutor-question">
      <div className="max-w-[85%] rounded-xl rounded-br-sm bg-ink-600 px-3 py-2 text-[13.5px] leading-snug text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)]">
        {turn.voice && (
          <span className="mb-0.5 flex items-center gap-1 text-[10.5px] text-fg-subtle">
            <Mic className="size-3" /> {turn.transcribing ? 'transcribing on chip 1…' : 'you said'}
          </span>
        )}
        {turn.transcribing && !turn.question ? <span className="skeleton inline-block h-3.5 w-40 align-middle" /> : turn.question}
      </div>
    </div>
  )
}

/** Ask the expert by voice or text; the answer streams in and is spoken sentence by sentence. */
export function AskExpert({ className }: { className?: string }) {
  const { lesson, step } = useLessonCtx()
  const goStep = useLesson((s) => s.goStep)
  const lang = useApp((s) => s.lang)
  const setLang = useApp((s) => s.setLang)
  const tutor = useTutor(lesson.skill_id)
  const [text, setText] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const mic = useMicrophone({
    silenceMs: 1300,
    onUtterance: (wav) => void tutor.ask({ audio: wav, filename: 'question.wav' }, lang),
  })
  const recording = mic.state === 'recording'
  const first = lesson.expert.name.split(' ')[0]

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [tutor.turns])

  // Release the microphone once a question is recorded, so the browser's mic indicator goes off.
  const recorded = useRef(false)
  const stopMic = mic.stop
  useEffect(() => {
    if (mic.state === 'recording') recorded.current = true
    else if (mic.state === 'listening' && recorded.current) {
      recorded.current = false
      stopMic()
    }
  }, [mic.state, stopMic])

  const suggestions = useMemo(
    () => [`Why ${lowerFirst(step.title)}?`, `What is the most common mistake in step ${step.index}?`, `How do I know step ${step.index} is done right?`],
    [step.title, step.index],
  )

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const q = text.trim()
    if (!q || tutor.busy) return
    setText('')
    void tutor.ask({ question: q }, lang)
  }

  return (
    <section className={cn('panel flex min-h-0 flex-col', className)} aria-labelledby="ask-title" data-testid="ask-expert">
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 id="ask-title" className="text-[14px] font-medium text-fg">
            Ask the expert
          </h2>
          <p className="mt-0.5 text-[11.5px] leading-snug text-fg-subtle">Answers come from {first}'s recording and answers, written by gpt-oss-20b on chip 2 and spoken by S2 Pro.</p>
        </div>
        <label className="flex shrink-0 items-center gap-1.5" title="Answer language">
          <Languages className="size-3.5 text-fg-subtle" aria-hidden />
          <span className="sr-only">Answer language</span>
          <Select value={lang} onChange={(e) => setLang(e.target.value)} className="w-[104px]" data-testid="tutor-lang">
            {TUTOR_LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </Select>
        </label>
      </header>

      <div ref={scroller} className="min-h-[220px] flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite" data-testid="tutor-log">
        {tutor.turns.length === 0 ? (
          <div className="flex h-full flex-col justify-end gap-3">
            <div className="flex items-center gap-2.5">
              <Avatar name={lesson.expert.name} size={32} />
              <p className="text-[13px] leading-snug text-fg-muted">
                Stuck on a step? Ask why {first} does it this way, by voice or by typing.
              </p>
            </div>
            <div className="flex flex-col items-start gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  disabled={tutor.busy}
                  onClick={() => void tutor.ask({ question: s }, lang)}
                  className="rounded-full bg-white/[0.03] px-3 py-1.5 text-left text-[12.5px] text-fg-muted shadow-[inset_0_0_0_1px_var(--color-line-strong)] transition-colors hover:bg-white/[0.06] hover:text-fg"
                  data-testid="tutor-suggestion"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          tutor.turns.map((t) => (
            <div key={t.id} className="space-y-3">
              {(t.question || t.voice) && <Question turn={t} />}
              <Answer turn={t} onReplay={() => tutor.replay(t.id)} onSource={(n) => n && goStep(n)} />
            </div>
          ))
        )}
      </div>

      <div className="border-t border-line p-3">
        <AnimatePresence>
          {recording && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mb-2 flex items-center gap-3 rounded-lg bg-fault/[0.08] px-3 py-2 shadow-[inset_0_0_0_1px_rgb(255_93_93/0.25)]" data-testid="tutor-recording">
                <span className="size-2 animate-pulse rounded-full bg-fault" aria-hidden />
                <span className="text-xs text-fg">Listening. Stop when you are done, or just pause.</span>
                <LevelMeter level={mic.level} active className="ml-auto h-5" bars={14} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {mic.error && <p className="mb-2 text-[11.5px] text-fault">{mic.error}</p>}
        <form onSubmit={submit} className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => (recording ? mic.end() : void mic.begin())}
            disabled={tutor.busy && !recording}
            aria-pressed={recording}
            aria-label={recording ? 'Stop and send the question' : 'Ask by voice'}
            title={recording ? 'Stop and send' : 'Ask by voice'}
            data-testid="tutor-mic"
            className={cn(
              'relative grid size-10 shrink-0 place-items-center rounded-full transition-all disabled:opacity-40',
              recording ? 'bg-fault text-white shadow-[0_0_0_4px_rgb(255_93_93/0.2),0_0_20px_rgb(255_93_93/0.45)]' : 'bg-ion-soft text-ion shadow-[inset_0_0_0_1px_rgb(60_215_255/0.35)] hover:bg-ion/20',
            )}
          >
            {recording ? <Square className="size-3.5 fill-current" /> : <Mic className="size-4" />}
          </button>
          <div className="relative flex-1">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              rows={1}
              placeholder={`Ask ${first} a question…`}
              aria-label="Your question"
              data-testid="tutor-input"
              className="block max-h-28 min-h-10 w-full resize-none rounded-xl bg-ink-900 py-2.5 pr-11 pl-3.5 text-[13.5px] text-fg placeholder:text-fg-faint shadow-[inset_0_0_0_1px_var(--color-line-strong)] outline-none focus:shadow-[inset_0_0_0_1px_var(--color-ion),0_0_0_3px_rgb(60_215_255/0.15)]"
            />
            <span className="absolute right-1.5 bottom-1.5">
              {tutor.busy ? (
                <IconButton label="Stop the answer" onClick={tutor.cancel} size="xs" data-testid="tutor-cancel">
                  <Loader2 className="size-3.5 animate-spin" />
                </IconButton>
              ) : (
                <IconButton label="Send" type="submit" variant="primary" size="xs" className="rounded-lg" disabled={!text.trim()} data-testid="tutor-send">
                  <ArrowUp className="size-3.5" />
                </IconButton>
              )}
            </span>
          </div>
        </form>
      </div>
    </section>
  )
}
