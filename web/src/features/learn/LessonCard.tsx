import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Clock, GraduationCap, ListChecks, Play } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { LessonItem } from '@/lib/api/learn'
import { fmtDuration } from '@/lib/format'
import { Avatar, Badge, Spotlight, VerifiedBadge } from '@/components/ui'

export function lessonState(l: LessonItem): 'certified' | 'progress' | 'new' {
  if (l.progress?.passed) return 'certified'
  if (l.progress && (l.progress.steps_done > 0 || (l.progress.best_score ?? 0) > 0)) return 'progress'
  return 'new'
}

/** Steps done as a row of segments, one per step. */
export function StepSegments({ done, total, className }: { done: number; total: number; className?: string }) {
  const n = Math.max(1, total)
  return (
    <div className={cn('flex gap-[3px]', className)} role="meter" aria-label="Steps practised" aria-valuemin={0} aria-valuemax={n} aria-valuenow={done}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={cn('h-1 flex-1 rounded-full', i < done ? 'bg-ion shadow-[0_0_8px_rgb(60_215_255/0.5)]' : 'bg-white/[0.08]')} />
      ))}
    </div>
  )
}

function StateBadge({ lesson }: { lesson: LessonItem }) {
  const s = lessonState(lesson)
  if (s === 'certified')
    return (
      <Badge tone="ok" icon={<GraduationCap className="size-3" />}>
        Certified
      </Badge>
    )
  if (s === 'progress') return <Badge tone="ion">In progress</Badge>
  return <Badge>New</Badge>
}

export function LessonCard({ lesson, index = 0 }: { lesson: LessonItem; index?: number }) {
  const p = lesson.progress
  const total = p?.steps_total || lesson.steps_count
  return (
    <motion.li initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.04, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
      <Spotlight className="h-full rounded-xl">
        <Link
          to={`/learn/${lesson.skill_id}`}
          className="panel group flex h-full flex-col overflow-hidden rounded-xl transition-shadow hover:shadow-raised"
          data-testid={`lesson-card-${lesson.skill_id}`}
        >
          <div className="relative aspect-video overflow-hidden bg-ink-700">
            {lesson.thumb && <img src={lesson.thumb} alt="" loading="lazy" className="size-full object-cover opacity-85 transition-[transform,opacity] duration-500 group-hover:scale-[1.03] group-hover:opacity-100" />}
            <div className="absolute inset-0 bg-gradient-to-t from-ink-850 via-ink-850/10 to-transparent" />
            <div className="absolute top-2.5 left-2.5 rounded-full bg-ink-950/75 backdrop-blur">
              <StateBadge lesson={lesson} />
            </div>
            {lesson.verification_status && (
              <div className="absolute top-2.5 right-2.5 rounded-full bg-ink-950/75 backdrop-blur">
                <VerifiedBadge status={lesson.verification_status} />
              </div>
            )}
            <span className="absolute bottom-3 left-3 grid size-9 place-items-center rounded-full bg-white/10 text-fg opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
              <Play className="size-4 translate-x-px fill-current" />
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-3 p-4 pt-3">
            <div>
              <h3 className="line-clamp-1 text-[15px] font-medium text-fg">{lesson.title}</h3>
              {lesson.summary && <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-fg-subtle">{lesson.summary}</p>}
            </div>
            <div className="mt-auto flex items-center gap-3 text-[11.5px] text-fg-subtle">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Avatar name={lesson.expert.name} size={18} />
                <span className="truncate text-fg-muted">{lesson.expert.name}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <ListChecks className="size-3" /> {lesson.steps_count}
              </span>
              <span className="telemetry inline-flex items-center gap-1">
                <Clock className="size-3" /> {fmtDuration(lesson.duration)}
              </span>
              {p?.best_score ? <span className={cn('telemetry ml-auto', p.best_score >= 0.8 ? 'text-ok' : p.best_score >= 0.6 ? 'text-warn' : 'text-fg-muted')}>best {Math.round(p.best_score * 100)}</span> : null}
            </div>
            <StepSegments done={p?.steps_done ?? 0} total={total} />
          </div>
        </Link>
      </Spotlight>
    </motion.li>
  )
}

/** The lesson to pick up next, shown large at the top of the Learn page. */
export function ContinueCard({ lesson }: { lesson: LessonItem }) {
  const s = lessonState(lesson)
  const p = lesson.progress
  const total = p?.steps_total || lesson.steps_count
  return (
    <Link
      to={`/learn/${lesson.skill_id}`}
      className="panel group relative grid overflow-hidden rounded-xl transition-shadow hover:shadow-raised md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
      data-testid="continue-lesson"
    >
      <div className="relative aspect-video overflow-hidden bg-ink-700 md:aspect-auto md:min-h-[260px]">
        {lesson.thumb && <img src={lesson.thumb} alt="" className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-[1.02]" />}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-ink-850 max-md:bg-gradient-to-t" />
        <span className="absolute top-1/2 left-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-ion text-ion-ink shadow-[0_0_0_8px_rgb(60_215_255/0.15),0_12px_40px_-8px_rgb(60_215_255/0.8)] transition-transform group-hover:scale-105">
          <Play className="size-6 translate-x-0.5 fill-current" />
        </span>
      </div>
      <div className="relative flex flex-col justify-center gap-4 p-6 lg:p-8">
        <div className="eyebrow text-ion">{s === 'progress' ? 'Continue where you left off' : s === 'certified' ? 'Practise again' : 'Start here'}</div>
        <div>
          <h2 className="text-[26px] leading-tight font-medium tracking-[-0.025em] text-fg">{lesson.title}</h2>
          {lesson.summary && <p className="mt-2 line-clamp-3 max-w-lg text-[14px] leading-relaxed text-fg-muted">{lesson.summary}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
          <Avatar name={lesson.expert.name} size={22} />
          Taught by <span className="text-fg">{lesson.expert.name}</span>
          <span className="text-fg-faint">·</span>
          {lesson.steps_count} steps
          <span className="text-fg-faint">·</span>
          <span className="telemetry">{fmtDuration(lesson.duration)}</span>
        </div>
        <div className="max-w-md">
          <div className="mb-1.5 flex justify-between text-[11px] text-fg-subtle">
            <span>
              {p?.steps_done ?? 0} of {total} steps practised
            </span>
            {p?.best_score ? <span className="telemetry">best match {Math.round(p.best_score * 100)}</span> : null}
          </div>
          <StepSegments done={p?.steps_done ?? 0} total={total} />
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-md bg-ion px-4 py-2.5 text-sm font-medium text-ion-ink shadow-[0_0_0_1px_rgb(60_215_255/0.6),0_8px_24px_-8px_rgb(60_215_255/0.6)] transition-colors group-hover:bg-[#6ee2ff]">
          {s === 'progress' ? 'Continue lesson' : 'Start lesson'} <ArrowRight className="size-4" />
        </span>
      </div>
    </Link>
  )
}
