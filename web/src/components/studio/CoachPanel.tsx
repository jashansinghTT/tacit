import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bot, Loader2, Send, Volume2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { MicState } from '@/lib/media'
import { ChipTag, Panel, Switch } from '@/components/ui'
import { Caption, TalkButton } from '@/components/speech/Speech'
import type { ChatLine } from './useCapture'

interface CoachPanelProps {
  chat: ChatLine[]
  live: boolean
  speaking: ChatLine | null
  mic: { state: MicState; level: number; begin: () => void; end: () => void }
  handsFree: boolean
  onHandsFree: (v: boolean) => void
  onSay: (text: string) => void
  onReplay: (l: ChatLine) => void
  expertName: string
}

/** The coach's spoken "why" questions with captions, and the expert's transcribed answers. */
export function CoachPanel({ chat, live, speaking, mic, handsFree, onHandsFree, onSay, onReplay, expertName }: CoachPanelProps) {
  const [text, setText] = useState('')
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [chat.length])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    onSay(text.trim())
    setText('')
  }
  const openQuestion = [...chat].reverse().find((l) => l.who === 'coach')
  return (
    <Panel
      title="Coach"
      eyebrow="asks why at each step"
      actions={
        <span className="hidden items-center gap-1 text-[10px] text-fg-subtle sm:flex">
          <ChipTag chip={2} />
          <ChipTag chip={1} />
        </span>
      }
      pad={false}
      className="min-h-[360px]"
      data-testid="coach-panel"
    >
      <div ref={list} className="max-h-[340px] min-h-[180px] space-y-3 overflow-y-auto p-4" aria-live="polite">
        {chat.length === 0 && (
          <div className="flex h-[150px] flex-col items-center justify-center gap-2 text-center">
            <Bot className="size-5 text-fg-faint" />
            <p className="max-w-[260px] text-xs text-fg-subtle">
              {live ? 'Work as usual. When a step closes, the coach asks one short question about why.' : 'Start a capture. The coach asks why at each step, out loud, with captions.'}
            </p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {chat.map((l) => (
            <motion.div key={l.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn('flex gap-2.5', l.who === 'expert' && 'flex-row-reverse')} data-testid={l.who === 'coach' ? 'coach-question' : 'expert-answer'}>
              <div className={cn('grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold', l.who === 'coach' ? 'bg-ion-soft text-ion' : 'bg-white/[0.08] text-fg-muted')}>
                {l.who === 'coach' ? <Bot className="size-3.5" /> : expertName.slice(0, 1)}
              </div>
              <div className={cn('max-w-[85%] rounded-lg px-3 py-2 text-[13px]', l.who === 'coach' ? 'rounded-tl-sm bg-ion/[0.07] text-fg shadow-[inset_0_0_0_1px_rgb(60_215_255/0.2)]' : 'rounded-tr-sm bg-white/[0.05] text-fg')}>
                {l.text || (
                  <span className="flex items-center gap-1.5 text-fg-subtle">
                    <Loader2 className="size-3 animate-spin" /> Transcribing…
                  </span>
                )}
                <div className="mt-1 flex items-center gap-2 text-[10px] text-fg-subtle">
                  <span className="telemetry">{l.t.toFixed(1)} s</span>
                  {l.who === 'coach' &&
                    (l.pendingAudio ? (
                      <span className="flex items-center gap-1">
                        <Loader2 className="size-2.5 animate-spin" /> voice coming
                      </span>
                    ) : l.audio ? (
                      <button onClick={() => onReplay(l)} className="flex items-center gap-1 hover:text-ion">
                        <Volume2 className="size-3" /> replay
                      </button>
                    ) : null)}
                  {l.ms ? <span className="telemetry">Whisper {Math.round(l.ms)} ms</span> : null}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="space-y-3 border-t border-line p-4">
        <Caption text={speaking?.text} who="Coach" speaking />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TalkButton state={mic.state} level={mic.level} onBegin={mic.begin} onEnd={mic.end} disabled={!live} label={openQuestion ? 'Answer' : 'Talk'} />
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            <Switch checked={handsFree} onChange={onHandsFree} label="Hands-free answers" disabled={!live} />
            Hands-free
          </label>
        </div>
        <p className="text-[11px] text-fg-faint">
          Hands-free listens after each question and stops when you go quiet. Questions by gpt-oss-20b (chip 2), voice by S2 Pro and transcripts by Whisper (chip 1).
        </p>
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!live}
            placeholder="Or type an answer"
            aria-label="Type an answer"
            className="h-9 min-w-0 flex-1 rounded-md bg-ink-900 px-3 text-[13px] text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)] outline-none placeholder:text-fg-faint focus:shadow-[inset_0_0_0_1px_var(--color-ion)] disabled:opacity-50"
          />
          <button type="submit" disabled={!live || !text.trim()} className="grid size-9 place-items-center rounded-md bg-ion-soft text-ion disabled:opacity-40" aria-label="Send answer">
            <Send className="size-4" />
          </button>
        </form>
      </div>
    </Panel>
  )
}
