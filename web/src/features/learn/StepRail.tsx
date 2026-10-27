import { Check, GraduationCap } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { LessonDetail } from '@/lib/api/learn'
import { fmtDuration } from '@/lib/format'
import { useLesson } from './store'

function scoreTone(v: number) {
  return v >= 0.8 ? 'text-ok' : v >= 0.6 ? 'text-warn' : 'text-fault'
}

/** The lesson's steps, top to bottom, then the quiz. Shows practice results per step. */
export function StepRail({ lesson, quizPassed }: { lesson: LessonDetail; quizPassed: boolean }) {
  const step = useLesson((s) => s.step)
  const view = useLesson((s) => s.view)
  const practice = useLesson((s) => s.practice)
  const goStep = useLesson((s) => s.goStep)
  const openQuiz = useLesson((s) => s.openQuiz)
  const doneCount = lesson.steps.filter((s) => practice[s.index]?.done != null).length

  return (
    <nav aria-label="Lesson steps" className="panel flex flex-col overflow-hidden" data-testid="step-rail">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="eyebrow">Steps</span>
        <span className="telemetry text-[11px] text-fg-subtle">
          {doneCount}/{lesson.steps.length} practised
        </span>
      </div>
      <ol className="flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible">
        {lesson.steps.map((s) => {
          const active = view === 'step' && s.index === step
          const p = practice[s.index]
          const done = p?.done != null
          return (
            <li key={s.id} className="min-w-[220px] lg:min-w-0">
              <button
                onClick={() => goStep(s.index)}
                aria-current={active ? 'step' : undefined}
                data-testid={`rail-step-${s.index}`}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors',
                  active ? 'bg-ion/[0.08] shadow-[inset_0_0_0_1px_rgb(60_215_255/0.45)]' : 'hover:bg-white/[0.04]',
                )}
              >
                <span className="relative h-10 w-16 shrink-0 overflow-hidden rounded-sm bg-ink-700 shadow-[inset_0_0_0_1px_var(--color-line)]">
                  {s.keyframe && <img src={s.keyframe} alt="" className={cn('size-full object-cover transition-opacity', active ? 'opacity-100' : 'opacity-60 group-hover:opacity-85')} loading="lazy" />}
                  <span
                    className={cn(
                      'telemetry absolute top-0.5 left-0.5 grid h-4 min-w-4 place-items-center rounded-[3px] px-0.5 text-[10px] font-medium',
                      done ? 'bg-ok text-ink-950' : active ? 'bg-ion text-ion-ink' : 'bg-ink-950/80 text-fg-muted',
                    )}
                  >
                    {done ? <Check className="size-2.5" strokeWidth={3.5} /> : s.index}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('line-clamp-2 text-[13px] leading-snug font-medium', active ? 'text-fg' : 'text-fg-muted group-hover:text-fg')}>{s.title}</span>
                  <span className="telemetry mt-0.5 flex items-center gap-2 text-[10.5px] text-fg-subtle">
                    {fmtDuration(s.t_start)}–{fmtDuration(s.t_end)}
                    {p && p.best > 0 && <span className={cn('ml-auto', scoreTone(p.best))}>{Math.round(p.best * 100)}</span>}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
        <li className="min-w-[220px] lg:mt-1 lg:min-w-0 lg:border-t lg:border-line lg:pt-1">
          <button
            onClick={openQuiz}
            aria-current={view === 'quiz' ? 'step' : undefined}
            data-testid="rail-quiz"
            className={cn(
              'group flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors',
              view === 'quiz' ? 'bg-ion/[0.08] shadow-[inset_0_0_0_1px_rgb(60_215_255/0.45)]' : 'hover:bg-white/[0.04]',
            )}
          >
            <span className={cn('grid h-10 w-16 shrink-0 place-items-center rounded-sm shadow-[inset_0_0_0_1px_var(--color-line)]', quizPassed ? 'bg-ok/15 text-ok' : 'bg-ink-700 text-fg-subtle')}>
              <GraduationCap className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('block text-[13px] font-medium', view === 'quiz' ? 'text-fg' : 'text-fg-muted group-hover:text-fg')}>Quiz and certificate</span>
              <span className="telemetry mt-0.5 block text-[10.5px] text-fg-subtle">
                {quizPassed ? 'passed' : `${lesson.quiz.length} question${lesson.quiz.length === 1 ? '' : 's'}`}
              </span>
            </span>
          </button>
        </li>
      </ol>
    </nav>
  )
}
