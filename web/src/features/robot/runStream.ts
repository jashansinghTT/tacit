// One streamed robot run (`WS /ws/robot/{run_id}`).
//
// States arrive at 30 Hz. They go into a plain buffer that the 3D view samples every frame with
// interpolation; React only hears about low-rate changes (phase, GR00T calls, done) through the
// zustand store below, so the page never re-renders at frame rate.
import { create } from 'zustand'
import type { Vec3 } from '@/lib/api'
import { robotApi, type Quat, type RunDone, type RunGr00t, type RunMessage, type RunMeta, type RunMode, type RunState } from '@/lib/api/robot'

/** How far playback trails the newest state, so there is always a pair to interpolate between. */
const LIVE_DELAY = 0.1
const MAX_LAG = 0.6

export interface Pose {
  t: number
  qpos: number[]
  ee: Vec3
  gripper: number
  phase: string | null
  objects: Map<string, { pos: Vec3; quat: Quat }>
}

export function emptyPose(): Pose {
  return { t: 0, qpos: [], ee: [0, 0, 0], gripper: 0.04, phase: null, objects: new Map() }
}

function lerp(a: number, b: number, u: number) {
  return a + (b - a) * u
}

function slerp(a: Quat, b: Quat, u: number, out: Quat) {
  let [aw, ax, ay, az] = a
  const [bw, bx, by, bz] = b
  let dot = aw * bw + ax * bx + ay * by + az * bz
  if (dot < 0) {
    aw = -aw
    ax = -ax
    ay = -ay
    az = -az
    dot = -dot
  }
  let k0 = 1 - u
  let k1 = u
  if (dot < 0.9995) {
    const th = Math.acos(dot)
    const s = Math.sin(th)
    k0 = Math.sin((1 - u) * th) / s
    k1 = Math.sin(u * th) / s
  }
  out[0] = aw * k0 + bw * k1
  out[1] = ax * k0 + bx * k1
  out[2] = ay * k0 + by * k1
  out[3] = az * k0 + bz * k1
  const n = Math.hypot(out[0], out[1], out[2], out[3]) || 1
  for (let i = 0; i < 4; i++) out[i] /= n
  return out
}

export type RunStatus = 'idle' | 'starting' | 'streaming' | 'done' | 'error'

export interface Gr00tStats {
  calls: number
  last: RunGr00t | null
  recent: number[]
  p50: number | null
}

interface RunUi {
  runId: string | null
  mode: RunMode | null
  seed: number | null
  status: RunStatus
  phase: string | null
  error: string | null
  meta: RunMeta | null
  done: RunDone | null
  gr00t: Gr00tStats
  /** Sim time at which replay mode started following the human path. */
  replayStart: number | null
  duration: number
  /** Playback after the run: 'live' follows the stream, 'local' plays the recorded buffer. */
  playback: 'live' | 'local'
  playing: boolean
  speed: number
}

const initialUi: RunUi = {
  runId: null,
  mode: null,
  seed: null,
  status: 'idle',
  phase: null,
  error: null,
  meta: null,
  done: null,
  gr00t: { calls: 0, last: null, recent: [], p50: null },
  replayStart: null,
  duration: 0,
  playback: 'live',
  playing: true,
  speed: 1,
}

export const useRunUi = create<RunUi>(() => ({ ...initialUi }))

type CameraListener = (name: string, src: string) => void

/** The mutable side: the state buffer, the playback clock and the latest camera frames. */
class RunBuffer {
  states: RunState[] = []
  cameras = new Map<string, string>()
  private cameraListeners = new Set<CameraListener>()
  private offset: number | null = null
  private localT = 0
  private lastNow = 0
  private stopping = false

  reset() {
    this.states = []
    this.cameras.clear()
    this.offset = null
    this.localT = 0
    this.lastNow = 0
    for (const fn of this.cameraListeners) fn('*', '')
  }

  get latestT() {
    return this.states.length ? this.states[this.states.length - 1].t : 0
  }

  get startT() {
    return this.states.length ? this.states[0].t : 0
  }

  push(s: RunState) {
    this.states.push(s)
  }

  setCamera(name: string, jpeg: string) {
    const src = `data:image/jpeg;base64,${jpeg}`
    this.cameras.set(name, src)
    for (const fn of this.cameraListeners) fn(name, src)
  }

  onCamera(fn: CameraListener) {
    this.cameraListeners.add(fn)
    return () => void this.cameraListeners.delete(fn)
  }

  /** Jump the local playhead (scrubbing a finished run). */
  seek(t: number) {
    this.localT = Math.max(this.startT, Math.min(this.latestT, t))
  }

  get playhead() {
    return this.localT
  }

  /** The time to show now. Live: trail the stream, hold through stalls, catch up after bursts. */
  clock(nowMs: number): number {
    const ui = useRunUi.getState()
    const now = nowMs / 1000
    const dt = this.lastNow ? Math.min(0.1, now - this.lastNow) : 0
    this.lastNow = now
    if (!this.states.length) return 0
    if (ui.playback === 'local') {
      if (ui.playing) {
        this.localT += dt * ui.speed
        if (this.localT >= this.latestT) {
          this.localT = this.latestT
          if (!this.stopping) {
            this.stopping = true
            queueMicrotask(() => {
              useRunUi.setState({ playing: false })
              this.stopping = false
            })
          }
        }
      }
      return this.localT
    }
    const latest = this.latestT
    if (this.offset === null) this.offset = now - latest
    let t = now - this.offset - LIVE_DELAY
    if (ui.status === 'done' || ui.status === 'error') t = Math.min(t + LIVE_DELAY, latest)
    if (t > latest) {
      this.offset += t - latest
      t = latest
    } else if (t < latest - MAX_LAG) {
      this.offset -= latest - MAX_LAG - t
      t = latest - MAX_LAG
    }
    this.localT = t
    return t
  }

  /** Interpolated pose at sim time `t`, written into `out`. Returns false when there is no data. */
  sample(t: number, out: Pose): boolean {
    const s = this.states
    if (!s.length) return false
    let a = s[0]
    let b = s[0]
    let u = 0
    if (t <= s[0].t) {
      a = b = s[0]
    } else if (t >= s[s.length - 1].t) {
      a = b = s[s.length - 1]
    } else {
      let lo = 0
      let hi = s.length - 1
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (s[mid].t <= t) lo = mid
        else hi = mid
      }
      a = s[lo]
      b = s[hi]
      u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0
    }
    out.t = t
    if (out.qpos.length !== a.qpos.length) out.qpos = a.qpos.slice()
    for (let i = 0; i < a.qpos.length; i++) out.qpos[i] = lerp(a.qpos[i], b.qpos[i] ?? a.qpos[i], u)
    for (let i = 0; i < 3; i++) out.ee[i] = lerp(a.ee[i], b.ee[i], u)
    out.gripper = lerp(a.gripper, b.gripper, u)
    out.phase = u < 0.5 ? a.phase : b.phase
    for (let k = 0; k < a.objects.length; k++) {
      const oa = a.objects[k]
      const ob = b.objects.find((o) => o.name === oa.name) ?? oa
      let slot = out.objects.get(oa.name)
      if (!slot) {
        slot = { pos: [0, 0, 0], quat: [1, 0, 0, 0] }
        out.objects.set(oa.name, slot)
      }
      for (let i = 0; i < 3; i++) slot.pos[i] = lerp(oa.pos[i], ob.pos[i], u)
      slerp(oa.quat, ob.quat, u, slot.quat)
    }
    return true
  }
}

export const runBuffer = new RunBuffer()

function median(xs: number[]) {
  if (!xs.length) return null
  const s = [...xs].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

let socket: ReturnType<typeof robotApi.socket> | null = null
const allMs: number[] = []

function handle(msg: RunMessage) {
  const ui = useRunUi.getState()
  switch (msg.type) {
    case 'meta':
      useRunUi.setState({ meta: msg, status: 'streaming' })
      break
    case 'state': {
      runBuffer.push(msg)
      const patch: Partial<RunUi> = {}
      if (msg.phase !== ui.phase) patch.phase = msg.phase
      if (msg.phase === 'replay' && ui.replayStart === null) patch.replayStart = msg.t
      if (ui.status === 'starting') patch.status = 'streaming'
      // Duration only matters for the scrubber after the run; update it at a low rate.
      if (msg.t - ui.duration > 0.5) patch.duration = msg.t
      if (Object.keys(patch).length) useRunUi.setState(patch)
      break
    }
    case 'camera':
      runBuffer.setCamera(msg.name, msg.jpeg)
      break
    case 'gr00t': {
      allMs.push(msg.ms)
      useRunUi.setState({
        gr00t: { calls: ui.gr00t.calls + 1, last: msg, recent: [...ui.gr00t.recent.slice(-59), msg.ms], p50: median(allMs) },
      })
      break
    }
    case 'done':
      useRunUi.setState({ done: msg, status: 'done', duration: runBuffer.latestT })
      break
    case 'error':
      useRunUi.setState({ error: msg.message, status: 'error' })
      break
  }
}

/** Starts a run on the backend and streams it into the buffer. Resolves with the run id. */
export async function startRun(skillId: string, mode: RunMode, seed: number): Promise<string> {
  stopRun()
  runBuffer.reset()
  allMs.length = 0
  useRunUi.setState({ ...initialUi, mode, seed, status: 'starting' })
  let runId: string
  try {
    ;({ run_id: runId } = await robotApi.run(skillId, mode, seed))
  } catch (err) {
    useRunUi.setState({ status: 'error', error: (err as Error).message })
    throw err
  }
  useRunUi.setState({ runId })
  const sock = robotApi.socket(runId)
  socket = sock
  sock.onMessage(handle)
  sock.onState((s) => {
    if (socket !== sock) return
    const st = useRunUi.getState().status
    if ((s === 'closed' || s === 'error') && st !== 'done' && st !== 'error') {
      useRunUi.setState({
        status: 'error',
        error: s === 'error' ? 'The run stream failed. Is the backend on :8710 running?' : 'The run stream closed before the run finished.',
      })
    }
  })
  return runId
}

export function stopRun() {
  if (socket) {
    const s = socket
    socket = null
    s.close()
  }
  const st = useRunUi.getState().status
  if (st === 'starting' || st === 'streaming') useRunUi.setState({ status: 'idle' })
}

/** Clears the viewer back to the scene at rest. */
export function clearRun() {
  stopRun()
  runBuffer.reset()
  useRunUi.setState({ ...initialUi })
}

/** Plays the recorded run again from the start (or from `t`). */
export function replayLocally(t?: number) {
  runBuffer.seek(t ?? runBuffer.startT)
  useRunUi.setState({ playback: 'local', playing: true })
}

export function setPlaying(playing: boolean) {
  const ui = useRunUi.getState()
  if (playing && ui.playback === 'local' && runBuffer.playhead >= runBuffer.latestT - 1e-3) runBuffer.seek(runBuffer.startT)
  useRunUi.setState({ playback: 'local', playing })
}

export function seekRun(t: number) {
  runBuffer.seek(t)
  useRunUi.setState({ playback: 'local' })
}
