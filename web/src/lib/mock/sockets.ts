// Fake WebSockets for mock mode, speaking the message shapes in docs/API.md.
import type { SocketLike } from '../api/socket'
import type { CaptureClientMsg, LearnClientMsg } from '../api/types'
import { getJob, startJob, db } from './state'
import { SCENE_DURATION, STEP_TIMES, stepIndexAt, trackAt } from './scene'
import { buildTrajectory, cameraJpeg, sampler } from './robot'
import { silentWav } from './audio'

class MockSocket implements SocketLike {
  onopen: (() => void) | null = null
  onmessage: ((data: string) => void) | null = null
  onclose: ((code: number, reason: string) => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  timers: ReturnType<typeof setTimeout>[] = []
  handler: ((msg: unknown) => void) | null = null
  cleanup: (() => void) | null = null

  constructor() {
    setTimeout(() => this.onopen?.(), 40)
  }
  push(msg: unknown) {
    if (!this.closed) this.onmessage?.(JSON.stringify(msg))
  }
  later(ms: number, fn: () => void) {
    this.timers.push(setTimeout(() => !this.closed && fn(), ms))
  }
  send(data: string) {
    if (this.closed) return
    this.handler?.(JSON.parse(data))
  }
  close() {
    if (this.closed) return
    this.closed = true
    this.timers.forEach(clearTimeout)
    this.cleanup?.()
    setTimeout(() => this.onclose?.(1000, ''), 0)
  }
}

const jitter = (base: number, spread: number) => Math.round((base + (Math.random() - 0.5) * spread) * 10) / 10

function jobSocket(id: string) {
  const s = new MockSocket()
  let last = ''
  const tick = () => {
    const j = getJob(id)
    if (!j) {
      s.push({ type: 'error', message: `job ${id} not found` })
      s.close()
      return
    }
    const key = JSON.stringify([j.status, j.stage, j.progress])
    if (key !== last) {
      last = key
      s.push(j)
    }
    if (j.status === 'done' || j.status === 'failed') s.close()
  }
  const iv = setInterval(tick, 250)
  s.cleanup = () => clearInterval(iv)
  setTimeout(tick, 60)
  return s
}

const COACH_QUESTIONS: Record<number, string> = {
  0: 'You read the whole card before reaching for anything. What are you checking?',
  1: 'Why did you take the bracket from the blue bin and not the grey one?',
  2: 'You pressed the bracket once after placing it. What does that tell you?',
  3: 'How do you know you have exactly two bolts without looking?',
}

const ANSWERS = [
  'Which bracket variant. B4 and B6 look the same from the top.',
  'Blue is pre-drilled, so they line up with the jig.',
  'If it rocks it is the wrong variant. Better I find it than the line.',
  'I roll them in my fingers. Two feels different from three.',
]

function captureSocket(skillId: string) {
  const s = new MockSocket()
  let lastStep = -1
  let lastQuestion: string | null = null
  let qn = 0
  let answered = 0
  s.handler = (raw) => {
    const msg = raw as CaptureClientMsg
    if (msg.type === 'frame') {
      const st = msg.t % SCENE_DURATION
      const tr = trackAt(st, 1.5)
      const timing = { mediapipe: jitter(8.6, 2), hamer: jitter(4.9, 0.8), gaze: jitter(7.1, 1), rfdetr: jitter(11.8, 2), total: 0 }
      timing.total = Math.round((timing.mediapipe + timing.hamer * 2 + timing.gaze + timing.rfdetr + 4) * 10) / 10
      s.later(timing.total, () =>
        s.push({
          type: 'analysis', ...tr, t: msg.t, timing_ms: timing, width: 1280, height: 720,
          served_by: [
            { model: 'MediaPipe', chip: null, backend: 'cpu', ms: timing.mediapipe },
            { model: 'HaMeR', chip: 0, backend: 'mock', ms: timing.hamer },
            { model: 'Gaze-LLE', chip: 0, backend: 'mock', ms: timing.gaze },
            { model: 'RF-DETR', chip: 0, backend: 'mock', ms: timing.rfdetr },
          ],
        }),
      )
      const idx = stepIndexAt(st)
      if (lastStep === -1) lastStep = idx
      if (idx !== lastStep) {
        const closed = STEP_TIMES[lastStep]
        s.push({ type: 'event', t: msg.t, kind: idx % 2 ? 'grasp' : 'release', hand: idx < 3 ? 'left' : 'right', object: idx < 3 ? 'bracket' : 'bolt' })
        s.push({ type: 'step', step: { id: `st${lastStep + 1}`, index: lastStep + 1, title: closed.title, t_start: closed.t0, t_end: closed.t1 } })
        const q = COACH_QUESTIONS[lastStep]
        if (q) {
          const id = `q${++qn}`
          lastQuestion = id
          s.later(1400, () => s.push({ type: 'coach', id, t: msg.t + 1.4, text: q, audio: null, pending_audio: true }))
          s.later(3600, () => s.push({ type: 'coach_audio', id, audio: silentWav(q.length / 15), duration: q.length / 15 }))
        }
        lastStep = idx
      }
    } else if (msg.type === 'answer' || msg.type === 'say') {
      const text = msg.type === 'say' ? msg.text : ANSWERS[answered % ANSWERS.length]
      answered++
      const qid = msg.question_id ?? lastQuestion
      s.later(msg.type === 'say' ? 120 : 520, () => s.push({ type: 'transcript', question_id: qid, text, ms: msg.type === 'say' ? 0 : 176 }))
    } else if (msg.type === 'stop') {
      const sk = db.skills.get(skillId)
      if (sk) sk.status = 'processing'
      const job_id = startJob('process', skillId, () => {
        const k = db.skills.get(skillId)
        if (k) {
          k.status = 'ready'
          k.title = 'Kit an M6 bracket set (live)'
          k.verification = { ...k.verification, status: 'verified', score: 0.93, checked_at: new Date().toISOString() }
        }
      })
      if (sk) sk.job_id = job_id
      s.later(300, () => {
        s.push({ type: 'saved', skill_id: skillId, job_id })
        s.close()
      })
    }
  }
  return s
}

const HINTS = [
  'Turn your wrist a little more so the holes face up.',
  'Slow down as you lower into the slot.',
  'Pinch the long edge, not the corner.',
  'Lift straight up before you move across.',
]

function learnSocket() {
  const s = new MockSocket()
  let step = 1
  let phase = 0
  let best = 0
  let frames = 0
  s.handler = (raw) => {
    const msg = raw as LearnClientMsg
    if (msg.type === 'step') {
      step = msg.index
      phase = 0
      best = 0
      frames = 0
    } else if (msg.type === 'frame') {
      frames++
      const tr = trackAt(msg.t % SCENE_DURATION, 3)
      s.later(30, () => s.push({ type: 'analysis', t: msg.t, hands: tr.hands, pose: null, head: null, gaze: null, objects: [], timing_ms: { mediapipe: jitter(8.4, 2), hamer: jitter(5, 1), total: jitter(20, 4) }, served_by: [], width: 1280, height: 720 }))
      phase = Math.min(1, phase + 0.012)
      const score = Math.min(0.97, 0.45 + phase * 0.42 + 0.06 * Math.sin(frames / 4))
      best = Math.max(best, score)
      const done = phase >= 1
      if (frames % 3 === 0 || done) {
        s.push({ type: 'feedback', step_index: step, score: Math.round(score * 100) / 100, phase: Math.round(phase * 100) / 100, hint: score < 0.8 ? HINTS[(step + Math.floor(frames / 25)) % HINTS.length] : null, done })
      }
      if (done) {
        s.push({ type: 'step_done', step_index: step, score: Math.round(best * 100) / 100 })
        phase = 0
        best = 0
        frames = 0
        step++
      }
    }
  }
  return s
}

function robotSocket(runId: string) {
  const s = new MockSocket()
  let mode = 'scripted'
  for (const runs of db.runs.values()) {
    const r = runs.find((x) => x.id === runId)
    if (r) mode = r.mode
  }
  const traj = buildTrajectory(mode === 'policy' ? 0.01 : 0)
  const { sample, total } = sampler(traj)
  const dt = 1 / 30
  let t = 0
  let frame = 0
  s.later(60, () => s.push({ type: 'meta', joints: ['panda_joint1', 'panda_joint2', 'panda_joint3', 'panda_joint4', 'panda_joint5', 'panda_joint6', 'panda_joint7', 'panda_finger_joint1', 'panda_finger_joint2'], objects: ['bracket', 'bolt'], dt }))
  const iv = setInterval(() => {
    if (s.closed) return
    const f = sample(t)
    s.push({ type: 'state', ...f })
    if (mode === 'gr00t' && frame % 6 === 0) {
      void cameraJpeg('exterior', f).then((jpeg) => s.push({ type: 'camera', name: 'exterior', jpeg }))
      void cameraJpeg('wrist', f).then((jpeg) => s.push({ type: 'camera', name: 'wrist', jpeg }))
    }
    if (mode === 'gr00t' && frame % 12 === 0) {
      s.push({ type: 'gr00t', ms: jitter(66, 8), instruction: `${f.phase} and put it in the kit tray` })
    }
    frame++
    t += dt
    if (t > total) {
      clearInterval(iv)
      for (const runs of db.runs.values()) {
        const r = runs.find((x) => x.id === runId)
        if (r) r.success = true
      }
      s.push({ type: 'done', success: true, reason: null })
      s.close()
    }
  }, 1000 / 30)
  s.cleanup = () => clearInterval(iv)
  return s
}

export function openMockSocket(path: string): SocketLike {
  const [, kind, id] = path.match(/^\/ws\/(\w+)\/([\w-]+)/) ?? []
  switch (kind) {
    case 'jobs':
      return jobSocket(id)
    case 'capture':
      return captureSocket(id)
    case 'learn':
      return learnSocket()
    case 'robot':
      return robotSocket(id)
    default: {
      const s = new MockSocket()
      s.later(50, () => {
        s.push({ type: 'error', message: `no mock for ${path}` })
        s.close()
      })
      return s
    }
  }
}
