import { request, requestBinary, streamEvents } from './client'
import { TacitSocket } from './socket'
import type * as T from './types'
import { normalizeBox, normalizeSkill, normalizeSummary } from './normalize'

export * from './types'
export { ApiError, MOCK, mediaUrl, setApiUser, getApiUser } from './client'
export { TacitSocket } from './socket'

function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const api = {
  health: () => request<T.Health>('/api/health'),
  box: () => request<T.BoxStatus>('/api/box').then(normalizeBox),
  users: () => request<T.User[]>('/api/users'),
  samples: () => request<T.Sample[]>('/api/samples'),
  /** VGGT verification of a sample clip (cached by the backend). */
  sampleVerify: (id: string) => request<T.SampleVerification>(`/api/samples/${id}/verify`),

  skills: (filter: { status?: string; expert_id?: string } = {}) =>
    request<T.SkillSummary[]>(`/api/skills${qs(filter)}`).then((l) => l.map(normalizeSummary)),
  skill: (id: string) => request<T.Skill>(`/api/skills/${id}`).then(normalizeSkill),
  createSkill: (body: { source: 'sample'; sample_id: string; title?: string } | { source: 'live'; title?: string }) =>
    request<{ skill_id: string; status: T.SkillStatus }>('/api/skills', { method: 'POST', body }),
  uploadSkill: (file: File, title?: string) => {
    const form = new FormData()
    form.append('file', file)
    if (title) form.append('title', title)
    return request<{ skill_id: string; status: T.SkillStatus }>('/api/skills', { method: 'POST', form })
  },
  patchSkill: (id: string, body: Partial<Pick<T.Skill, 'title' | 'summary' | 'steps' | 'qa'>>) =>
    request<T.Skill>(`/api/skills/${id}`, { method: 'PATCH', body }).then(normalizeSkill),
  /** The expert answers a pending why-question after capture, by voice or text. */
  answer: (id: string, input: { audio?: Blob; text?: string; step_index?: number; question?: string }) => {
    const form = new FormData()
    if (input.audio) form.append('file', input.audio, 'answer.wav')
    if (input.text) form.append('text', input.text)
    if (input.step_index !== undefined) form.append('step_index', String(input.step_index))
    if (input.question) form.append('question', input.question)
    return request<{ text: string; skill: T.Skill }>(`/api/skills/${id}/answer`, { method: 'POST', form }).then((r) => ({
      text: r.text,
      skill: normalizeSkill(r.skill),
    }))
  },
  deleteSkill: (id: string) => request<{ ok: boolean }>(`/api/skills/${id}`, { method: 'DELETE' }),
  tracks: (id: string) => request<T.Tracks>(`/api/skills/${id}/tracks`),
  twin: (id: string) => request<T.Twin>(`/api/skills/${id}/twin`),
  pointcloud: async (url: string) => {
    const { buffer, headers } = await requestBinary(url)
    const n = Number(headers.get('X-Points') ?? buffer.byteLength / 24)
    return { points: new Float32Array(buffer, 0, Math.min(n, buffer.byteLength / 24) * 6), count: n }
  },
  process: (id: string) => request<{ job_id: string }>(`/api/skills/${id}/process`, { method: 'POST' }),
  verify: (id: string) => request<{ job_id: string }>(`/api/skills/${id}/verify`, { method: 'POST' }),

  job: <R = Record<string, unknown>>(id: string) => request<T.Job<R>>(`/api/jobs/${id}`),

  tts: (text: string, lang = 'en') =>
    request<T.TtsResponse>('/api/speech/tts', { method: 'POST', body: { text, voice: 'default', lang } }),
  stt: (file: Blob, name = 'speech.wav') => {
    const form = new FormData()
    form.append('file', file, name)
    return request<T.SttResponse>('/api/speech/stt', { method: 'POST', form })
  },

  lessons: () => request<T.LessonSummary[]>('/api/learn/lessons'),
  lesson: (skillId: string) => request<T.Lesson>(`/api/learn/lessons/${skillId}`),
  startSession: (skillId: string, lang: string) =>
    request<{ session_id: string }>('/api/learn/sessions', { method: 'POST', body: { skill_id: skillId, lang } }),
  completeSession: (sessionId: string, quizAnswers: number[]) =>
    request<T.CompleteResult>(`/api/learn/sessions/${sessionId}/complete`, {
      method: 'POST',
      body: { quiz_answers: quizAnswers },
    }),
  progress: () => request<T.ProgressRow[]>('/api/learn/progress'),
  askTutor: (skillId: string, input: { question: string; lang: string } | { audio: Blob; lang: string }) => {
    if ('audio' in input) {
      const form = new FormData()
      form.append('audio', input.audio, 'question.wav')
      form.append('lang', input.lang)
      return streamEvents(`/api/tutor/${skillId}/ask`, { form })
    }
    return streamEvents(`/api/tutor/${skillId}/ask`, { body: input })
  },

  robotScene: () => request<T.RobotScene>('/api/robot/scene'),
  robot: (skillId: string) => request<T.RobotInfo>(`/api/robot/${skillId}`),
  train: (skillId: string, demos = 200, epochs = 30) =>
    request<{ job_id: string }>(`/api/robot/${skillId}/train`, { method: 'POST', body: { demos, epochs } }),
  evaluate: (skillId: string, trials = 20, seed = 0) =>
    request<{ job_id: string }>(`/api/robot/${skillId}/evaluate`, { method: 'POST', body: { trials, seed } }),
  run: (skillId: string, mode: T.RunMode, seed = 3) =>
    request<{ run_id: string }>(`/api/robot/${skillId}/run`, {
      method: 'POST',
      body: { mode, seed, realtime: true },
    }),

  listings: (filter: { q?: string; industry?: string; robot?: string; verified?: boolean } = {}) =>
    request<T.Listing[]>(`/api/exchange/listings${qs(filter)}`),
  listing: (id: string) => request<T.ListingDetail>(`/api/exchange/listings/${id}`),
  createListing: (body: T.CreateListing) =>
    request<T.Listing>('/api/exchange/listings', { method: 'POST', body }),
  license: (listingId: string, licenseType: T.LicenseType) =>
    request<T.LicenseResult>(`/api/exchange/listings/${listingId}/license`, {
      method: 'POST',
      body: { license_type: licenseType },
    }),
  library: () => request<T.LibraryItem[]>('/api/exchange/library'),
  earnings: () => request<T.Earnings>('/api/earnings'),
}

export const sockets = {
  job: (id: string) => new TacitSocket<T.Job, never>(`/ws/jobs/${id}`),
  capture: (skillId: string) => new TacitSocket<T.CaptureServerMsg, T.CaptureClientMsg>(`/ws/capture/${skillId}`),
  learn: (sessionId: string) => new TacitSocket<T.LearnServerMsg, T.LearnClientMsg>(`/ws/learn/${sessionId}`),
  robot: (runId: string) => new TacitSocket<T.RobotServerMsg, never>(`/ws/robot/${runId}`),
}
