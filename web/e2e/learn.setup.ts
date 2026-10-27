// Picks the lesson to test and builds the fake capture media from the box's own data:
// the camera plays the expert's recording of step 1 (so practice has real hands to match), and
// the microphone plays a question voiced by the box's own speech model (S2 Pro).
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import type { FullConfig } from '@playwright/test'
import { EVIDENCE_DIR, FIXTURE_FILE, MEDIA_DIR, type LearnFixture } from './learn.fixtures'

interface LessonRow {
  skill_id: string
  title: string
  steps_count: number
  verification_status?: string
}

interface LessonDetail {
  title: string
  video: string | null
  steps: { index: number; t_start: number; t_end: number; narration_audio: string | null }[]
  quiz: { answer: number }[]
}

interface SkillRecord {
  qa?: { question: string; question_audio?: string | null }[]
}

// The seeded demo skills, in order of preference.
const PREFERRED = ['sk_c28f1461', 'sk_3b7c613d']

async function json<T>(base: string, path: string): Promise<T> {
  const r = await fetch(base + path, { headers: { 'X-Tacit-User': 'u_sam' } })
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
  return (await r.json()) as T
}

async function download(base: string, path: string, to: string) {
  const r = await fetch(base + path)
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
  writeFileSync(to, Buffer.from(await r.arrayBuffer()))
}

function ffmpeg(args: string[]) {
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' })
}

export default async function setup(config: FullConfig) {
  const base = String(config.projects[0]?.use.baseURL ?? 'http://127.0.0.1:5711')
  mkdirSync(MEDIA_DIR, { recursive: true })
  mkdirSync(EVIDENCE_DIR, { recursive: true })

  const lessons = await json<LessonRow[]>(base, '/api/learn/lessons')
  const usable = lessons.filter((l) => l.steps_count >= 2)
  const wanted = process.env.LEARN_SKILL
  const pick =
    (wanted && usable.find((l) => l.skill_id === wanted)) ||
    PREFERRED.map((id) => usable.find((l) => l.skill_id === id)).find(Boolean) ||
    usable.find((l) => l.verification_status === 'verified') ||
    usable[0]
  if (!pick) throw new Error('No ready lesson with at least two steps on the backend; seed a sample first.')

  const lesson = await json<LessonDetail>(base, `/api/learn/lessons/${pick.skill_id}`)
  const step = lesson.steps[0]
  if (!lesson.video) throw new Error(`${pick.skill_id} has no source video`)
  const src = `${MEDIA_DIR}/source.mp4`
  await download(base, lesson.video, src)
  // A little before and after the step so the alignment sees the whole motion.
  const t0 = Math.max(0, step.t_start - 0.5)
  const dur = step.t_end - step.t_start + 1
  ffmpeg(['-ss', String(t0), '-t', String(dur), '-i', src, '-vf', 'scale=640:-2,fps=15', '-q:v', '4', `${MEDIA_DIR}/practice.mjpeg`])

  // The spoken question: voiced by S2 Pro now, or else one the coach voiced during a capture.
  let question: string | null = null
  const ask = 'Why do I use my left hand for this step?'
  try {
    const r = await fetch(base + '/api/speech/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: ask, voice: 'default', lang: 'en' }),
      signal: AbortSignal.timeout(90_000),
    })
    if (r.ok) {
      const { audio } = (await r.json()) as { audio: string }
      await download(base, audio, `${MEDIA_DIR}/question_raw.wav`)
      question = ask
    }
  } catch {
    question = null
  }
  if (!question) {
    const all = await json<{ id: string }[]>(base, '/api/skills?include_test=1').catch(() => [])
    for (const l of all) {
      const sk = await json<SkillRecord>(base, `/api/skills/${l.id}`).catch(() => null)
      const qa = sk?.qa?.find((q) => q.question_audio && /\?\s*$/.test(q.question))
      if (qa?.question_audio) {
        await download(base, qa.question_audio, `${MEDIA_DIR}/question_raw.wav`)
        question = qa.question
        break
      }
    }
  }
  if (question) {
    // Silence before and after, so the push-to-talk cut-off ends the utterance.
    ffmpeg(['-i', `${MEDIA_DIR}/question_raw.wav`, '-af', 'adelay=600|600,apad=pad_dur=3', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', `${MEDIA_DIR}/question.wav`])
  } else {
    ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '3', '-c:a', 'pcm_s16le', `${MEDIA_DIR}/question.wav`])
  }

  const fixture: LearnFixture = {
    skillId: pick.skill_id,
    title: lesson.title,
    steps: lesson.steps.length,
    narrated: lesson.steps.some((s) => s.narration_audio),
    quizAnswers: lesson.quiz.map((q) => q.answer),
    voice: Boolean(question),
    question,
  }
  writeFileSync(FIXTURE_FILE, JSON.stringify(fixture, null, 2))
  console.log(`learn e2e: ${fixture.skillId} "${fixture.title}", ${fixture.steps} steps, voice question: ${question ?? 'none'}`)
}
