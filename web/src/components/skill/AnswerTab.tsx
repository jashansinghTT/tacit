import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Keyboard, MessageCircleQuestion, Play, Send } from 'lucide-react'
import { api, type QA, type Skill } from '@/lib/api'
import { qk } from '@/lib/api/queries'
import { useMicrophone, useSpeaker } from '@/lib/media'
import { fmtClock } from '@/lib/format'
import { Badge, Button, EmptyState, Panel, ServedByList, toast } from '@/components/ui'
import { Caption, TalkButton } from '@/components/speech/Speech'
import type { ServedBy } from '@/lib/api'

function QuestionCard({ skill, q, onSaved }: { skill: Skill; q: QA; onSaved: (s: Skill) => void }) {
  const step = skill.steps.find((s) => s.id === q.step_id)
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState(false)
  const [busy, setBusy] = useState<'stt' | 'save' | null>(null)
  const [served, setServed] = useState<ServedBy[] | undefined>()
  const speaker = useSpeaker()
  const mic = useMicrophone({
    onUtterance: async (wav) => {
      setBusy('stt')
      try {
        const r = await api.stt(wav)
        setDraft(r.text)
        setServed(r.served_by)
      } catch (e) {
        toast.error('Could not transcribe', (e as Error).message)
      } finally {
        setBusy(null)
      }
    },
  })
  const save = async () => {
    if (!draft.trim()) return
    setBusy('save')
    try {
      const updated = await api.patchSkill(skill.id, { qa: [{ ...q, answer: draft.trim() }] })
      onSaved(updated)
      toast.ok('Answer saved', step ? `Attached to step ${step.index}: ${step.title}` : undefined)
    } catch (e) {
      toast.error('Could not save the answer', (e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  return (
    <article className="panel p-4" data-testid={`question-${q.id ?? q.step_id}`}>
      <div className="flex items-start gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-warn-soft text-warn">
          <MessageCircleQuestion className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-fg-subtle">
            {step && (
              <Badge>
                Step {step.index} · {step.title}
              </Badge>
            )}
            <span className="telemetry">at {fmtClock(q.t)}</span>
          </div>
          <p className="mt-2 text-[15px] text-fg">{q.question}</p>
          <button
            onClick={() => speaker.say({ id: q.id ?? q.step_id, text: q.question, audio: q.question_audio ?? null, who: 'Coach' })}
            className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-fg-subtle hover:text-ion"
            disabled={!q.question_audio}
          >
            <Play className="size-3 fill-current" /> {q.question_audio ? 'Play the question' : 'No audio for this question'}
          </button>
          <Caption text={speaker.playing ? speaker.current?.text : null} who="Coach" speaking className="mt-2" />
          {step?.why_source === 'inferred' && (
            <p className="mt-3 rounded-md bg-white/[0.025] p-2.5 text-xs text-fg-subtle">
              <span className="text-fg-muted">The model's guess:</span> {step.why}
            </p>
          )}
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <TalkButton state={mic.state} level={mic.level} onBegin={() => void mic.begin()} onEnd={mic.end} disabled={busy !== null} />
              <Button size="sm" variant="ghost" icon={<Keyboard className="size-3.5" />} onClick={() => setTyping((t) => !t)}>
                Type instead
              </Button>
            </div>
            {(typing || draft || busy === 'stt') && (
              <div className="space-y-2">
                <textarea
                  value={busy === 'stt' ? 'Transcribing on chip 1…' : draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                  disabled={busy === 'stt'}
                  placeholder="Say it the way you would explain it to a new hire."
                  aria-label="Your answer"
                  className="w-full resize-none rounded-md bg-ink-900 p-3 text-[13px] text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)] outline-none placeholder:text-fg-faint focus:shadow-[inset_0_0_0_1px_var(--color-ion)]"
                />
                <div className="flex items-center justify-between gap-3">
                  <ServedByList served={served} />
                  <Button size="sm" variant="primary" icon={<Send className="size-3.5" />} onClick={save} loading={busy === 'save'} disabled={!draft.trim() || busy === 'stt'} data-testid="save-answer">
                    Save answer
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

/** The expert answers the coach's pending "why" questions by voice; each answer joins its step. */
export function AnswerTab({ skill }: { skill: Skill }) {
  const qc = useQueryClient()
  const pending = skill.qa.filter((q) => !q.answer)
  const answered = skill.qa.filter((q) => q.answer)
  const onSaved = (s: Skill) => qc.setQueryData(qk.skill(skill.id), s)
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="space-y-3" data-testid="pending-questions">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-fg">Waiting for {skill.expert.name.split(' ')[0]}</h3>
          <span className="telemetry text-xs text-fg-subtle">{pending.length} open</span>
        </div>
        {pending.length === 0 ? (
          <Panel>
            <EmptyState icon={<CheckCircle2 className="size-5 text-ok" />} title="Every question has an answer">
              The lesson and the tutor use these answers in the expert's own words.
            </EmptyState>
          </Panel>
        ) : (
          pending.map((q) => <QuestionCard key={q.id ?? `${q.step_id}-${q.t}`} skill={skill} q={q} onSaved={onSaved} />)
        )}
      </div>
      <Panel title="Answered" eyebrow={`${answered.length} answers in the expert's words`} pad={false}>
        <ul className="divide-y divide-line">
          {answered.map((q) => {
            const step = skill.steps.find((s) => s.id === q.step_id)
            return (
              <li key={q.id ?? q.step_id} className="px-4 py-3">
                <div className="text-[11px] text-fg-subtle">{step ? `Step ${step.index} · ${step.title}` : q.step_id}</div>
                <div className="mt-1 text-[13px] text-fg-muted">{q.question}</div>
                <div className="mt-1.5 text-[13px] text-fg italic">"{q.answer}"</div>
              </li>
            )
          })}
          {answered.length === 0 && <li className="px-4 py-6 text-center text-xs text-fg-subtle">No answers yet.</li>}
        </ul>
      </Panel>
    </div>
  )
}
