import { ChevronLeft, ChevronRight, Eye, Hand, Lightbulb, MessageCircleQuestion, Package, Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'
import { fmtDuration } from '@/lib/format'
import { Avatar, Badge, Button } from '@/components/ui'
import { useLessonCtx } from './context'
import { useLesson } from './store'

function firstName(name: string) {
  return name.split(' ')[0] || name
}

/** The expert's reason for the step, shown as their quote, and honest about where it came from. */
export function WhyQuote() {
  const { lesson, step, skill } = useLessonCtx()
  const name = firstName(lesson.expert.name)
  const own = step.why_source === 'expert'
  const asked = skill?.qa.find((q) => q.step_id === step.id && q.answer)
  if (!step.why) return null
  return (
    <figure
      className={cn(
        'relative overflow-hidden rounded-lg p-5 pl-6',
        own ? 'bg-ion/[0.05] shadow-[inset_0_0_0_1px_rgb(60_215_255/0.22)]' : 'bg-white/[0.02] shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
      )}
      data-testid="why-quote"
      data-source={step.why_source}
    >
      <span className={cn('absolute inset-y-4 left-0 w-[3px] rounded-r-full', own ? 'bg-ion shadow-[0_0_12px_rgb(60_215_255/0.6)]' : 'bg-[repeating-linear-gradient(to_bottom,var(--color-fg-faint)_0_6px,transparent_6px_10px)]')} aria-hidden />
      <div className="eyebrow mb-2 flex items-center gap-2">Why it matters</div>
      {asked && own && (
        <p className="mb-2 flex items-start gap-1.5 text-xs text-fg-subtle">
          <MessageCircleQuestion className="mt-px size-3.5 shrink-0" />
          <span>
            Asked during the capture: <span className="text-fg-muted">“{asked.question}”</span>
          </span>
        </p>
      )}
      <span className={cn('pointer-events-none absolute top-1 right-4 font-serif text-[88px] leading-none select-none', own ? 'text-ion/25' : 'text-white/[0.06]')} aria-hidden>
        ”
      </span>
      <blockquote className={cn('relative font-serif text-[22px] leading-snug italic', own ? 'text-fg' : 'text-fg-muted')}>{step.why}</blockquote>
      <figcaption className="mt-4 flex flex-wrap items-center gap-2.5 text-xs">
        <Avatar name={lesson.expert.name} size={24} />
        <span className="font-medium text-fg">{lesson.expert.name}</span>
        {own ? (
          <Badge tone="ion" data-testid="why-source">
            In {name}'s words
          </Badge>
        ) : (
          <Badge tone="warn" icon={<Sparkles className="size-3" />} data-testid="why-source">
            Inferred from the video, not yet confirmed by {name}
          </Badge>
        )}
      </figcaption>
    </figure>
  )
}

function Chip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.03] px-2 py-1 text-xs shadow-[inset_0_0_0_1px_var(--color-line)]">
      <span className="text-fg-subtle">{icon}</span>
      <span className="text-fg-subtle">{label}</span>
      <span className="text-fg">{value}</span>
    </span>
  )
}

export function StepDetail({ compact }: { compact?: boolean }) {
  const { lesson, step } = useLessonCtx()
  const next = useLesson((s) => s.next)
  const prev = useLesson((s) => s.prev)
  const n = lesson.steps.length
  const handLabel = step.hand === 'both' ? 'Both hands' : step.hand ? `${step.hand[0].toUpperCase()}${step.hand.slice(1)} hand` : null
  return (
    <section className="panel p-5" data-testid="step-detail" aria-labelledby="step-title">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow flex items-center gap-2">
            Step {step.index} of {n}
            <span className="text-fg-faint">·</span>
            <span className="telemetry normal-case">{(step.t_end - step.t_start).toFixed(1)} s</span>
            <span className="text-fg-faint">·</span>
            <span className="telemetry normal-case">
              {fmtDuration(step.t_start)}–{fmtDuration(step.t_end)}
            </span>
          </div>
          <h2 id="step-title" className="mt-1.5 text-[22px] leading-tight font-medium tracking-[-0.02em] text-fg">
            {step.title}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm" variant="ghost" icon={<ChevronLeft className="size-4" />} onClick={prev} disabled={step.index <= 1} data-testid="step-prev">
            Back
          </Button>
          <Button size="sm" variant="secondary" iconRight={<ChevronRight className="size-4" />} onClick={next} data-testid="step-next">
            {step.index >= n ? 'Quiz' : 'Next'}
          </Button>
        </div>
      </div>
      <p className="mt-3 max-w-3xl text-[17px] leading-relaxed text-fg" data-testid="step-instruction">
        {step.instruction}
      </p>
      {(handLabel || step.gaze_target || step.objects.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {handLabel && <Chip icon={<Hand className="size-3.5" />} label="Use" value={handLabel} />}
          {step.gaze_target && <Chip icon={<Eye className="size-3.5" />} label="Eyes on" value={step.gaze_target} />}
          {step.objects.length > 0 && <Chip icon={<Package className="size-3.5" />} label="Parts" value={step.objects.join(', ')} />}
        </div>
      )}
      {!compact && (
        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <WhyQuote />
          {step.tips.length > 0 && (
            <div className="rounded-lg bg-white/[0.02] p-4 shadow-[inset_0_0_0_1px_var(--color-line)]" data-testid="step-tips">
              <div className="eyebrow mb-2.5">Tips from the floor</div>
              <ul className="space-y-2.5">
                {step.tips.map((t, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-fg-muted">
                    <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-warn" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
