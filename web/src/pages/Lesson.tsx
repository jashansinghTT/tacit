import { useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Camera, Clock, Eye, GraduationCap, Hand, Languages, Layers, ListChecks, Loader2, ShieldAlert, Volume2 } from 'lucide-react'
import { Page, PageHeader } from '@/components/layout/Page'
import { Avatar, Badge, ButtonLink, Button, EmptyState, ErrorState, Segmented, Select, Skeleton, VerifiedBadge } from '@/components/ui'
import { ApiError, type Skill, type Tracks } from '@/lib/api'
import { useSkill, useTracks, useUsers } from '@/lib/api/queries'
import { useLessonDetail, useLessonList, type LessonDetail } from '@/lib/api/learn'
import { fmtDuration } from '@/lib/format'
import { usePlayback } from '@/lib/playback'
import { useApp } from '@/lib/store'
import { AskExpert } from '@/features/learn/AskExpert'
import { LessonContext, type LessonCtx } from '@/features/learn/context'
import { PracticeStage } from '@/features/learn/PracticeStage'
import { QuizPanel } from '@/features/learn/QuizPanel'
import { StepDetail } from '@/features/learn/StepDetail'
import { StepRail } from '@/features/learn/StepRail'
import { useLesson, type LessonMode } from '@/features/learn/store'
import { TUTOR_LANGS } from '@/features/learn/useTutor'
import { useIntro, WatchStage } from '@/features/learn/WatchStage'
import { GuideStage } from '@/features/reflex/GuideStage'

const MODES: { key: LessonMode; label: string; icon: React.ReactNode; hint: (name: string) => string }[] = [
  { key: 'watch', label: 'Watch', icon: <Eye className="size-3.5" />, hint: (n) => `Watch ${n} do the step, with narration.` },
  { key: 'practise', label: 'Practise', icon: <Camera className="size-3.5" />, hint: (n) => `Do it on camera; Tacit scores your match with ${n}.` },
  { key: 'guide', label: 'Guide my hand', icon: <Hand className="size-3.5" />, hint: () => 'Feel the grip with a Reflex glove, or watch the virtual one.' },
]

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const L = useLesson.getState()
      if (e.key === 'ArrowRight') L.next()
      else if (e.key === 'ArrowLeft') L.prev()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** One language for the lesson text, its narration and the tutor's answers. */
function LanguagePicker({ lesson, translating }: { lesson: LessonDetail; translating: boolean }) {
  const lang = useApp((s) => s.lang)
  const setLang = useApp((s) => s.setLang)
  const offered = lesson.languages.length ? TUTOR_LANGS.filter((l) => lesson.languages.some((x) => x.code === l.code)) : TUTOR_LANGS
  return (
    <label className="flex items-center gap-2" title="Lesson language: text, narration and the tutor's answers">
      {translating ? <Loader2 className="size-4 animate-spin text-ion" aria-hidden /> : <Languages className="size-4 text-fg-subtle" aria-hidden />}
      <span className="sr-only">Lesson language</span>
      <Select value={lang} onChange={(e) => setLang(e.target.value)} className="w-[124px]" data-testid="lesson-lang">
        {offered.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </Select>
    </label>
  )
}

function LessonHeader({ lesson, skill, passed, translating }: { lesson: LessonDetail; skill: Skill | undefined; passed: boolean; translating: boolean }) {
  const persona = useApp((s) => s.persona)
  const users = useUsers()
  const me = users.data?.find((u) => u.id === persona)
  const practice = useLesson((s) => s.practice)
  const setMode = useLesson((s) => s.setMode)
  const goStep = useLesson((s) => s.goStep)
  const narrate = useLesson((s) => s.narrate)
  const setNarrate = useLesson((s) => s.setNarrate)
  const playIntro = useIntro()
  const done = Object.values(practice).filter((p) => p.done != null).length
  const voiced = lesson.steps.filter((s) => s.narration_audio).length
  const langName = TUTOR_LANGS.find((l) => l.code === lesson.lang)?.label ?? lesson.lang
  const duration = skill?.source.duration ?? lesson.steps.at(-1)?.t_end ?? null
  return (
    <PageHeader
      crumbs={[{ label: 'Learn', to: '/learn' }, { label: lesson.title }]}
      eyebrow="Lesson"
      title={<span data-testid="lesson-title">{lesson.title}</span>}
      description={lesson.summary}
      meta={
        <>
          <span className="inline-flex items-center gap-2 text-[13px] text-fg-muted">
            <Avatar name={lesson.expert.name} size={22} />
            Taught by <span className="text-fg">{lesson.expert.name}</span>
            {lesson.expert.title && <span className="text-fg-subtle">· {lesson.expert.title}</span>}
          </span>
          <Badge icon={<ListChecks className="size-3" />}>{lesson.steps.length} steps</Badge>
          {duration != null && <Badge icon={<Clock className="size-3" />}>{fmtDuration(duration)}</Badge>}
          {skill && <VerifiedBadge status={skill.verification.status} score={skill.verification.score} />}
          {passed ? (
            <Badge tone="ok" icon={<GraduationCap className="size-3" />}>
              Certified
            </Badge>
          ) : done > 0 ? (
            <Badge tone="ion" mono>
              {done}/{lesson.steps.length} practised
            </Badge>
          ) : null}
          {translating ? (
            <Badge tone="ion" dot pulse data-testid="lesson-translating">
              Translating with gpt-oss-20b…
            </Badge>
          ) : lesson.lang !== 'en' ? (
            <Badge tone={voiced === lesson.steps.length ? 'ok' : 'neutral'} icon={<Languages className="size-3" />} data-testid="lesson-lang-status">
              {langName}
              {voiced < lesson.steps.length && <span className="telemetry opacity-80">· narration {voiced}/{lesson.steps.length}</span>}
            </Badge>
          ) : null}
          {me && <span className="text-xs text-fg-subtle">Learning as {me.name}</span>}
        </>
      }
      actions={
        <>
          <LanguagePicker lesson={lesson} translating={translating} />
          <Button
            variant="secondary"
            icon={<Volume2 className="size-4" />}
            onClick={() => {
              if (!narrate) setNarrate(true)
              setMode('watch')
              goStep(1)
              playIntro()
            }}
            data-testid="play-intro"
          >
            Play intro
          </Button>
          <ButtonLink to={`/skills/${lesson.skill_id}`} variant="ghost" icon={<Layers className="size-4" />}>
            Skill record
          </ButtonLink>
        </>
      }
    />
  )
}

function SafetyCard({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <section className="panel-flat p-4" data-testid="lesson-safety">
      <div className="eyebrow mb-2.5 flex items-center gap-1.5 text-warn">
        <ShieldAlert className="size-3.5" /> Safety
      </div>
      <ul className="space-y-2">
        {items.map((s, i) => (
          <li key={i} className="text-[12.5px] leading-relaxed text-fg-muted">
            {s}
          </li>
        ))}
      </ul>
    </section>
  )
}

function ModeBar({ expert }: { expert: string }) {
  const mode = useLesson((s) => s.mode)
  const setMode = useLesson((s) => s.setMode)
  const hint = MODES.find((m) => m.key === mode)?.hint(expert)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3" data-testid="mode-bar">
      <Segmented label="Lesson mode" value={mode} onChange={setMode} size="md" items={MODES.map((m) => ({ key: m.key, label: m.label, icon: m.icon }))} />
      <span className="text-xs text-fg-subtle">{hint}</span>
    </div>
  )
}

function LessonPlayer({
  lesson,
  skill,
  tracks,
  passed,
  savedDone,
  translating,
}: {
  lesson: LessonDetail
  skill: Skill | undefined
  tracks: Tracks | undefined
  passed: boolean
  savedDone: number
  translating: boolean
}) {
  const reset = useLesson((s) => s.reset)
  const stepIndex = useLesson((s) => s.step)
  const view = useLesson((s) => s.view)
  const mode = useLesson((s) => s.mode)
  const step = lesson.steps.find((s) => s.index === stepIndex) ?? lesson.steps[0]
  const duration = skill?.source.duration || lesson.steps.at(-1)?.t_end || 0
  const pb = usePlayback(duration, true)
  const { setLoop, seek } = pb
  useShortcuts()

  useEffect(() => {
    reset(lesson.skill_id, lesson.steps.length)
  }, [reset, lesson.skill_id, lesson.steps.length])

  // Loop the current step. Stop just short of the end so the video never parks on `ended`.
  useEffect(() => {
    const end = duration ? Math.min(step.t_end, duration - 0.08) : step.t_end
    setLoop([step.t_start, Math.max(step.t_start + 0.2, end)])
    seek(step.t_start)
  }, [step.id, step.t_start, step.t_end, duration, setLoop, seek])

  const ctx = useMemo<LessonCtx>(() => ({ lesson, skill, tracks, pb, step }), [lesson, skill, tracks, pb, step])
  const first = lesson.expert.name.split(' ')[0]

  return (
    <LessonContext.Provider value={ctx}>
      <LessonHeader lesson={lesson} skill={skill} passed={passed} translating={translating} />
      <div className="grid items-start gap-4 lg:grid-cols-[232px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)_368px]">
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-[calc(var(--header-h)+16px)]">
          <StepRail lesson={lesson} quizPassed={passed} savedDone={savedDone} />
          <div className="hidden lg:block">
            <SafetyCard items={lesson.safety} />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4" data-testid="lesson-main" data-mode={mode} data-view={view} data-step={step.index}>
          {view === 'quiz' ? (
            <QuizPanel />
          ) : (
            <>
              <ModeBar expert={first} />
              {mode === 'watch' && <WatchStage />}
              {mode === 'practise' && <PracticeStage />}
              {mode === 'guide' && <GuideStage />}
              <StepDetail />
            </>
          )}
        </div>
        <AskExpert className="h-[560px] lg:col-span-2 xl:sticky xl:top-[calc(var(--header-h)+16px)] xl:col-span-1 xl:h-[calc(100vh-var(--header-h)-40px)]" />
      </div>
    </LessonContext.Provider>
  )
}

function LessonSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the lesson">
      <Skeleton className="mb-3 h-4 w-40" />
      <Skeleton className="mb-8 h-9 w-[420px] max-w-full" />
      <div className="grid gap-4 lg:grid-cols-[232px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)_368px]">
        <Skeleton className="h-[420px]" />
        <div className="space-y-4">
          <Skeleton className="aspect-video" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="hidden h-[560px] xl:block" />
      </div>
    </div>
  )
}

export default function LessonPage() {
  const { skillId } = useParams()
  const lang = useApp((s) => s.lang)
  const lesson = useLessonDetail(skillId, lang)
  const translating = lesson.isPlaceholderData && lesson.isFetching
  const skill = useSkill(skillId)
  const tracks = useTracks(skillId)
  const lessons = useLessonList()
  const saved = lessons.data?.find((l) => l.skill_id === skillId)?.progress
  const passed = Boolean(saved?.passed)
  const notFound = lesson.error instanceof ApiError && lesson.error.status === 404

  return (
    <Page wide testId="page-lesson">
      {lesson.isLoading ? (
        <LessonSkeleton />
      ) : notFound ? (
        <EmptyState
          icon={<GraduationCap className="size-5" />}
          title="This lesson does not exist"
          action={
            <ButtonLink to="/learn" variant="secondary" size="sm">
              All lessons
            </ButtonLink>
          }
        >
          There is no skill with the id <span className="telemetry text-fg-muted">{skillId}</span> on this box.
        </EmptyState>
      ) : lesson.error ? (
        <ErrorState error={lesson.error} onRetry={() => void lesson.refetch()} />
      ) : lesson.data && lesson.data.steps.length === 0 ? (
        <EmptyState icon={<GraduationCap className="size-5" />} title="No steps yet" action={<Link to="/learn" className="text-[13px] text-ion hover:underline">Back to lessons</Link>}>
          The skill is still being processed. Its lesson appears when the steps are written.
        </EmptyState>
      ) : lesson.data ? (
        <LessonPlayer key={lesson.data.skill_id} lesson={lesson.data} skill={skill.data} tracks={tracks.data} passed={passed} savedDone={saved?.steps_done ?? 0} translating={translating} />
      ) : null}
    </Page>
  )
}
