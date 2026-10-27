import { useMemo, useState } from 'react'
import { ArrowRight, BookOpen, Camera, GraduationCap, Hand, MessageCircle, Sparkles } from 'lucide-react'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button, ButtonLink, EmptyState, ErrorState, Segmented, Skeleton, Stat } from '@/components/ui'
import { useLessonList, type LessonItem } from '@/lib/api/learn'
import { useUsers } from '@/lib/api/queries'
import { personaOf, useApp } from '@/lib/store'
import { ContinueCard, LessonCard, lessonState } from '@/features/learn/LessonCard'

type Filter = 'all' | 'progress' | 'new' | 'certified'

function pickContinue(lessons: LessonItem[]): LessonItem | undefined {
  return lessons.find((l) => lessonState(l) === 'progress') ?? lessons.find((l) => lessonState(l) === 'new' && l.verification_status === 'verified') ?? lessons[0]
}

const HOW = [
  { icon: BookOpen, title: 'Watch', body: 'Each step looped from the expert’s own recording, narrated, with their reason in their words.' },
  { icon: Camera, title: 'Practise', body: 'Do the step on camera. Your hands are lined up with the expert’s and scored live.' },
  { icon: MessageCircle, title: 'Ask', body: 'Ask why, by voice or text. Answers come from the expert’s record, spoken in your language.' },
  { icon: Hand, title: 'Feel', body: 'With a Reflex glove the expert’s finger motion moves your hand. No glove? Watch the virtual one.' },
]

function PersonaNote() {
  const persona = useApp((s) => s.persona)
  const setPersona = useApp((s) => s.setPersona)
  const users = useUsers()
  const p = personaOf(persona)
  if (p.role === 'trainee') return null
  const name = users.data?.find((u) => u.id === persona)?.name ?? p.name
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg bg-ion/[0.05] px-4 py-3 text-[13px] text-fg-muted shadow-[inset_0_0_0_1px_rgb(60_215_255/0.2)]" data-testid="persona-note">
      <Sparkles className="size-4 text-ion" />
      <span>
        You are viewing as <span className="text-fg">{name}</span> ({p.roleLabel.toLowerCase()}). Progress and certificates are saved for whoever is learning.
      </span>
      <Button size="xs" variant="secondary" className="ml-auto" onClick={() => setPersona('u_sam')} data-testid="view-as-trainee">
        View as Sam, the trainee
      </Button>
    </div>
  )
}

export default function LearnPage() {
  const lessons = useLessonList()
  const [filter, setFilter] = useState<Filter>('all')
  const list = useMemo(() => lessons.data ?? [], [lessons.data])
  const counts = useMemo(() => {
    const c = { progress: 0, new: 0, certified: 0 }
    for (const l of list) c[lessonState(l)] += 1
    return c
  }, [list])
  const best = list.map((l) => l.progress?.best_score ?? 0).filter((v) => v > 0)
  const avgBest = best.length ? best.reduce((a, b) => a + b, 0) / best.length : null
  const featured = pickContinue(list)
  const shown = list.filter((l) => filter === 'all' || lessonState(l) === filter)

  return (
    <Page testId="page-learn">
      <PageHeader
        eyebrow="Training"
        title="Learn"
        description="Lessons built from an expert's recorded hands: watch each step, practise it on camera with a live score, ask the expert why, and earn a certificate."
      />
      <PersonaNote />

      {lessons.isLoading ? (
        <div className="space-y-6" aria-busy="true">
          <Skeleton className="h-[280px]" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[300px]" />
            ))}
          </div>
        </div>
      ) : lessons.error ? (
        <ErrorState error={lessons.error} onRetry={() => void lessons.refetch()} />
      ) : list.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<GraduationCap className="size-5" />}
            title="No lessons yet"
            action={
              <ButtonLink to="/studio" variant="primary" size="sm" iconRight={<ArrowRight className="size-3.5" />}>
                Capture a skill
              </ButtonLink>
            }
          >
            A lesson appears here as soon as an expert's recorded skill finishes processing.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            {featured && <ContinueCard lesson={featured} />}
            <section className="panel grid grid-cols-2 gap-x-4 gap-y-5 p-5 xl:grid-cols-1 xl:content-center" data-testid="learn-stats">
              <Stat label="Lessons" value={list.length} hint={`${counts.new} not started`} />
              <Stat label="In progress" value={counts.progress} tone={counts.progress ? 'ion' : 'neutral'} />
              <Stat label="Certified" value={counts.certified} tone={counts.certified ? 'ok' : 'neutral'} />
              <Stat label="Average best match" value={avgBest === null ? '–' : Math.round(avgBest * 100)} unit={avgBest === null ? undefined : '/ 100'} />
            </section>
          </div>

          <section className="mt-10" aria-labelledby="all-lessons">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="all-lessons" className="text-lg font-medium tracking-[-0.02em] text-fg">
                  All lessons
                </h2>
                <p className="mt-0.5 text-[13px] text-fg-subtle">Every skill captured on this box becomes a lesson.</p>
              </div>
              <Segmented
                label="Filter lessons"
                value={filter}
                onChange={setFilter}
                items={[
                  { key: 'all', label: `All ${list.length}` },
                  { key: 'progress', label: `In progress ${counts.progress}` },
                  { key: 'new', label: `New ${counts.new}` },
                  { key: 'certified', label: `Certified ${counts.certified}` },
                ]}
              />
            </div>
            {shown.length ? (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="lesson-grid">
                {shown.map((l, i) => (
                  <LessonCard key={l.skill_id} lesson={l} index={i} />
                ))}
              </ul>
            ) : (
              <p className="panel-flat px-4 py-8 text-center text-[13px] text-fg-subtle">No lessons in this group yet.</p>
            )}
          </section>

          <section className="mt-12 border-t border-line pt-8" aria-label="How a lesson works">
            <div className="eyebrow mb-4">How a lesson works</div>
            <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {HOW.map((h, i) => (
                <li key={h.title} className="flex gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.03] text-ion shadow-[inset_0_0_0_1px_var(--color-line-strong)]">
                    <h.icon className="size-4" />
                  </span>
                  <div>
                    <div className="text-[13px] font-medium text-fg">
                      <span className="telemetry mr-1.5 text-fg-faint">{String(i + 1).padStart(2, '0')}</span>
                      {h.title}
                    </div>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-fg-subtle">{h.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </Page>
  )
}
