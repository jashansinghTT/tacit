import { createContext, useContext } from 'react'
import type { Skill, Tracks } from '@/lib/api'
import type { LessonDetail, LessonStep } from '@/lib/api/learn'
import type { Playback } from '@/lib/playback'

export interface LessonCtx {
  lesson: LessonDetail
  skill: Skill | undefined
  tracks: Tracks | undefined
  /** One clock for the step video, the captions, the 3D twin and the virtual glove. */
  pb: Playback
  step: LessonStep
}

export const LessonContext = createContext<LessonCtx | null>(null)

export function useLessonCtx(): LessonCtx {
  const c = useContext(LessonContext)
  if (!c) throw new Error('useLessonCtx outside a lesson')
  return c
}
