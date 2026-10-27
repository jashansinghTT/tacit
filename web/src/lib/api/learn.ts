// The training use case (F4) and the Reflex glove. Shapes follow the live backend
// (backend/tacit/app.py), which returns a little more than docs/API.md lists; every extra field
// is optional so the mock layer and older backends still type-check.
import { useQueries, useQuery } from '@tanstack/react-query'
import { useApp } from '../store'
import { MOCK, request, streamEvents, type SseEvent } from './client'
import { api, sockets } from './index'
import type { PersonRef, PolicyInfo, QuizItem, RobotAction, RobotRun, SkillSummary, VerificationStatus } from './types'

// ---------------------------------------------------------------------------------- lessons

export interface LessonProgress {
  steps_done: number
  steps_total: number
  best_score: number | null
  passed: boolean
}

export interface LessonItem {
  skill_id: string
  title: string
  summary?: string
  expert: PersonRef
  thumb: string | null
  duration: number | null
  steps_count: number
  created_at?: string
  verification_status?: VerificationStatus
  progress: LessonProgress | null
}

export interface LessonStep {
  id: string
  index: number
  title: string
  instruction: string
  why: string
  why_source: 'expert' | 'inferred'
  keyframe: string | null
  t_start: number
  t_end: number
  tips: string[]
  objects: string[]
  hand: string | null
  gaze_target: string | null
  narration_audio: string | null
  narration_text: string | null
}

export interface LessonLanguage {
  code: string
  name: string
}

export interface LessonDetail {
  skill_id: string
  /** The language the text is in; narration in it may still be on its way. */
  lang: string
  languages: LessonLanguage[]
  title: string
  summary: string
  expert: PersonRef
  video: string | null
  intro_audio: string | null
  /** What the intro narration says (captions). */
  intro_text: string
  steps: LessonStep[]
  quiz: QuizItem[]
  safety: string[]
}

type RawLessonItem = Partial<LessonItem> & { skill_id: string; progress?: LessonProgress | number | null; id?: string }

function normalizeProgress(p: LessonProgress | number | null | undefined, steps: number): LessonProgress | null {
  if (p === null || p === undefined) return null
  if (typeof p === 'number') {
    // The mock layer answers with a fraction.
    return { steps_done: Math.round(p * steps), steps_total: steps, best_score: null, passed: p >= 1 }
  }
  return p
}

async function fetchLessons(): Promise<LessonItem[]> {
  const raw = await request<RawLessonItem[]>('/api/learn/lessons')
  return raw.map((r) => ({
    skill_id: r.skill_id ?? r.id!,
    title: r.title ?? 'Untitled skill',
    summary: r.summary ?? '',
    expert: r.expert ?? { id: '', name: 'An expert' },
    thumb: r.thumb ?? null,
    duration: r.duration ?? null,
    steps_count: r.steps_count ?? 0,
    created_at: r.created_at,
    verification_status: r.verification_status,
    progress: normalizeProgress(r.progress, r.steps_count ?? 0),
  }))
}

type RawLesson = Partial<LessonDetail> & { skill_id: string; steps: Partial<LessonStep>[] }

/**
 * The lesson (translated when `lang` is not English), filled in from the skill record where the
 * lesson endpoint leaves a field out.
 */
async function fetchLesson(skillId: string, lang = 'en'): Promise<LessonDetail> {
  const [raw, skill] = await Promise.all([
    request<RawLesson>(`/api/learn/lessons/${skillId}${lang !== 'en' ? `?lang=${lang}` : ''}`),
    api.skill(skillId).catch(() => null),
  ])
  const translated = lang !== 'en'
  const byIndex = new Map(skill?.steps.map((s) => [s.index, s]) ?? [])
  // The skill record keeps every narration line with its text; the lesson endpoint drops the intro's.
  const narration = translated ? {} : ((skill as { narration?: Record<string, { text?: string }> } | null)?.narration ?? {})
  const title = raw.title ?? skill?.title ?? 'Lesson'
  const summary = raw.summary ?? skill?.summary ?? ''
  return {
    skill_id: raw.skill_id,
    lang: raw.lang ?? lang,
    languages: raw.languages ?? [],
    title,
    summary,
    expert: raw.expert ?? skill?.expert ?? { id: '', name: 'the expert' },
    video: raw.video ?? skill?.source.video ?? null,
    intro_audio: raw.intro_audio ?? null,
    intro_text: narration.intro?.text ?? `${title}. ${summary}`.trim(),
    quiz: raw.quiz ?? skill?.quiz ?? [],
    safety: raw.safety ?? skill?.safety ?? [],
    steps: raw.steps.map((s, i) => {
      const full = byIndex.get(s.index ?? i + 1)
      const index = s.index ?? i + 1
      const stepTitle = s.title ?? full?.title ?? `Step ${index}`
      const instruction = s.instruction ?? full?.instruction ?? ''
      return {
        id: s.id ?? full?.id ?? `st${i + 1}`,
        index,
        title: stepTitle,
        instruction,
        why: s.why ?? full?.why ?? '',
        why_source: s.why_source ?? full?.why_source ?? 'inferred',
        keyframe: s.keyframe ?? full?.keyframe ?? null,
        t_start: s.t_start ?? full?.t_start ?? 0,
        t_end: s.t_end ?? full?.t_end ?? 0,
        tips: s.tips ?? full?.tips ?? [],
        objects: s.objects ?? full?.objects ?? [],
        hand: s.hand ?? full?.hand ?? null,
        gaze_target: s.gaze_target ?? full?.gaze_target ?? null,
        narration_audio: s.narration_audio ?? null,
        // Same wording the backend speaks (pipeline/process.py, learn/i18n.py), so the line can be
        // voiced on demand while the lesson's own narration is still being made.
        narration_text: s.narration_text ?? (translated ? `${index}. ${stepTitle}. ${instruction}` : `Step ${index}. ${stepTitle}. ${instruction}`),
      }
    }),
  }
}

// ---------------------------------------------------------------------------------- progress

export interface ProgressEntry {
  trainee: PersonRef & { title?: string }
  skill_id: string
  skill_title?: string
  steps_done: number
  steps_total: number
  best_score: number | null
  quiz_score?: number | null
  passed: boolean
  certificate?: string | null
  updated_at: string
}

export interface RobotReadiness {
  program: RobotAction[]
  policy: PolicyInfo
  runs: RobotRun[]
  sim_available?: boolean
}

// ---------------------------------------------------------------------------------- tutor

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export type TutorInput = { question: string } | { audio: Blob; filename?: string }

export interface TutorAudioPart {
  index: number
  audio: string
  duration: number
}

export interface TutorDoneEvent {
  text: string
  audio_parts: number
  sources: string[]
  question: string
}

/** `POST /api/tutor/{id}/ask` as a stream of server-sent events (transcript, delta, audio, done, error). */
export function askTutor(skillId: string, input: TutorInput, lang: string, history: ChatTurn[], signal?: AbortSignal): AsyncGenerator<SseEvent> {
  const path = `/api/tutor/${skillId}/ask`
  if ('audio' in input) {
    const form = new FormData()
    form.append('audio', input.audio, input.filename ?? 'question.wav')
    form.append('lang', lang)
    form.append('history', JSON.stringify(history))
    return streamEvents(path, { form, signal })
  }
  return streamEvents(path, { body: { question: input.question, lang, history }, signal })
}

// ---------------------------------------------------------------------------------- reflex glove

export const FINGER_NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const

export interface ReflexStatus {
  connected: boolean
  url: string
  fingers: string[]
  mock?: boolean | null
  ros_connected?: boolean | null
  state?: string | null
  movement?: string | null
}

/** Curls of the expert's working hand: rows of [t, thumb, index, middle, ring, pinky], 0 open .. 1 closed. */
export interface FingerTrack {
  fingers: string[]
  hand: string
  t_start: number | null
  frames: number[][]
  fps: number
}

export interface ReflexPose {
  pose: number[]
  seconds: number
}

export interface GuideResult {
  connected: boolean
  name: string
  steps: ReflexPose[]
  seconds: number
  message?: string
}

async function mockLearn() {
  return import('../mock/learn')
}

export const learnApi = {
  lessons: fetchLessons,
  lesson: fetchLesson,
  progress: () => request<ProgressEntry[]>('/api/learn/progress'),
  robot: (skillId: string) => request<RobotReadiness>(`/api/robot/${skillId}`),
  startSession: (skillId: string, lang: string) =>
    request<{ session_id: string }>('/api/learn/sessions', { method: 'POST', body: { skill_id: skillId, lang } }),
  complete: (sessionId: string, quizAnswers: number[]) =>
    request<{ score: number; passed: boolean; certificate: string | null }>(`/api/learn/sessions/${sessionId}/complete`, {
      method: 'POST',
      body: { quiz_answers: quizAnswers },
    }),
  practiceSocket: (sessionId: string) => sockets.learn(sessionId),

  reflexStatus: async (): Promise<ReflexStatus> => (MOCK ? (await mockLearn()).reflexStatus() : request<ReflexStatus>('/api/reflex/status')),
  fingers: async (skillId: string, step?: number): Promise<FingerTrack> =>
    MOCK
      ? (await mockLearn()).fingerTrack(skillId, step)
      : request<FingerTrack>(`/api/skills/${skillId}/fingers${step ? `?step=${step}` : ''}`),
  guide: async (skillId: string, stepIndex?: number): Promise<GuideResult> =>
    MOCK
      ? (await mockLearn()).guide(skillId, stepIndex)
      : request<GuideResult>('/api/reflex/guide', { method: 'POST', body: { skill_id: skillId, step_index: stepIndex ?? null } }),
  stopGlove: async () => (MOCK ? { ok: true } : request<{ ok: boolean }>('/api/reflex/stop', { method: 'POST', body: {} })),
  reflexFileUrl: (skillId: string, step?: number) => `/api/skills/${skillId}/reflex.py${step ? `?step=${step}` : ''}`,
}

// ---------------------------------------------------------------------------------- hooks

export const learnKeys = {
  lessons: (user: string) => ['learn', 'lessons', user] as const,
  lesson: (id: string, lang = 'en') => ['learn', 'lesson', id, lang] as const,
  progress: ['learn', 'progress'] as const,
  robot: (id: string) => ['learn', 'robot', id] as const,
  reflex: ['reflex', 'status'] as const,
  fingers: (id: string, step: number) => ['reflex', 'fingers', id, step] as const,
}

export function useLessonList() {
  const persona = useApp((s) => s.persona)
  return useQuery({ queryKey: learnKeys.lessons(persona), queryFn: fetchLessons })
}

/** The lesson in `lang`. Keeps showing the previous language while a translation loads, and polls until its narration is voiced. */
export const useLessonDetail = (skillId: string | undefined, lang = 'en') =>
  useQuery({
    queryKey: learnKeys.lesson(skillId ?? '', lang),
    queryFn: () => fetchLesson(skillId!, lang),
    enabled: Boolean(skillId),
    staleTime: 60_000,
    placeholderData: (prev) => (prev?.skill_id === skillId ? prev : undefined),
    refetchInterval: (q) => {
      const d = q.state.data
      const waiting = d && (d.steps.some((s) => !s.narration_audio) || !d.intro_audio)
      return waiting && q.state.dataUpdateCount < 60 ? 5000 : false
    },
  })

export interface IntroMusic {
  audio: string
  duration: number
  model: string
  chip: number
  credit: string
}

export const useIntroMusic = () =>
  useQuery({ queryKey: ['music', 'intro'], queryFn: () => request<IntroMusic>('/api/music/intro'), staleTime: Infinity, retry: false })

export const useTeamProgress = () => useQuery({ queryKey: learnKeys.progress, queryFn: learnApi.progress, refetchInterval: 10_000 })

export const useCapturedSkills = () =>
  useQuery<SkillSummary[]>({ queryKey: ['skills', {}], queryFn: () => api.skills({}), refetchInterval: 15_000 })

/** Robot readiness for each skill id, fetched in parallel. */
export function useRobotReadiness(skillIds: string[]) {
  return useQueries({
    queries: skillIds.map((id) => ({
      queryKey: learnKeys.robot(id),
      queryFn: () => learnApi.robot(id),
      staleTime: 30_000,
      retry: 1,
    })),
  })
}

export const useReflexStatus = () =>
  useQuery({ queryKey: learnKeys.reflex, queryFn: learnApi.reflexStatus, refetchInterval: 10_000, staleTime: 5000, retry: false })

export const useFingerTrack = (skillId: string | undefined, step: number) =>
  useQuery({
    queryKey: learnKeys.fingers(skillId ?? '', step),
    queryFn: () => learnApi.fingers(skillId!, step),
    enabled: Boolean(skillId) && step > 0,
    staleTime: Infinity,
  })
