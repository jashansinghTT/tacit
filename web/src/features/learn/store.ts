import { create } from 'zustand'
import { learnApi } from '@/lib/api/learn'

export type LessonMode = 'watch' | 'practise' | 'guide'
export type LessonView = 'step' | 'quiz'

export interface StepPractice {
  /** Live match scores, oldest first (capped). */
  scores: number[]
  best: number
  /** Score the server reported when the step was completed. */
  done: number | null
}

interface LessonState {
  skillId: string
  stepCount: number
  step: number
  view: LessonView
  mode: LessonMode
  narrate: boolean
  autoAdvance: boolean
  practice: Record<number, StepPractice>
  sessionId: string | null

  reset: (skillId: string, stepCount: number) => void
  goStep: (step: number) => void
  next: () => void
  prev: () => void
  openQuiz: () => void
  setMode: (m: LessonMode) => void
  setNarrate: (v: boolean) => void
  setAutoAdvance: (v: boolean) => void
  recordScore: (step: number, score: number) => void
  recordDone: (step: number, score: number) => void
  ensureSession: (lang: string) => Promise<string>
  /** Forget the session (the backend restarted and no longer knows it). */
  dropSession: () => void
}

const MAX_SCORES = 160

export const useLesson = create<LessonState>((set, get) => ({
  skillId: '',
  stepCount: 0,
  step: 1,
  view: 'step',
  mode: 'watch',
  narrate: true,
  autoAdvance: true,
  practice: {},
  sessionId: null,

  reset: (skillId, stepCount) => {
    if (get().skillId === skillId) {
      set({ stepCount })
      return
    }
    set({ skillId, stepCount, step: 1, view: 'step', mode: 'watch', practice: {}, sessionId: null })
  },
  goStep: (step) => {
    const n = get().stepCount
    set({ step: Math.max(1, Math.min(n || 1, step)), view: 'step' })
  },
  next: () => {
    const { step, stepCount } = get()
    if (step >= stepCount) set({ view: 'quiz' })
    else get().goStep(step + 1)
  },
  prev: () => {
    const { step, view } = get()
    if (view === 'quiz') set({ view: 'step' })
    else get().goStep(step - 1)
  },
  openQuiz: () => set({ view: 'quiz' }),
  setMode: (mode) => set({ mode, view: 'step' }),
  setNarrate: (narrate) => set({ narrate }),
  setAutoAdvance: (autoAdvance) => set({ autoAdvance }),
  recordScore: (step, score) =>
    set((s) => {
      const p = s.practice[step] ?? { scores: [], best: 0, done: null }
      const scores = [...p.scores, score].slice(-MAX_SCORES)
      return { practice: { ...s.practice, [step]: { ...p, scores, best: Math.max(p.best, score) } } }
    }),
  recordDone: (step, score) =>
    set((s) => {
      const p = s.practice[step] ?? { scores: [], best: 0, done: null }
      return { practice: { ...s.practice, [step]: { ...p, best: Math.max(p.best, score), done: score } } }
    }),
  dropSession: () => set({ sessionId: null }),
  ensureSession: async (lang) => {
    const existing = get().sessionId
    if (existing) return existing
    const { session_id } = await learnApi.startSession(get().skillId, lang)
    set({ sessionId: session_id })
    return session_id
  },
}))
