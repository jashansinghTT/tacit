// Shared paths and the fixture the global setup writes for learn.spec.ts.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const WEB_DIR = fileURLToPath(new URL('..', import.meta.url))
export const MEDIA_DIR = fileURLToPath(new URL('../test-results/learn-media', import.meta.url))
export const FIXTURE_FILE = `${MEDIA_DIR}/fixture.json`
export const EVIDENCE_DIR = fileURLToPath(new URL('../../.orchestration/evidence/web-learn', import.meta.url))

export interface LearnFixture {
  skillId: string
  title: string
  steps: number
  narrated: boolean
  quizAnswers: number[]
  /** A spoken question is available as the fake microphone input. */
  voice: boolean
  question: string | null
}

export function readFixture(): LearnFixture {
  return JSON.parse(readFileSync(FIXTURE_FILE, 'utf8')) as LearnFixture
}
