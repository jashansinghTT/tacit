// Robot Lab API (F5): the sim scene, robot readiness, train/evaluate jobs and streamed runs.
// Shapes follow docs/API.md plus the fields the backend and tacit_sim actually send
// (`tacit-sim-scene/1` scenes, `sim_available`, the policy's stored loss curve, richer run messages).
import { useQueries, useQuery } from '@tanstack/react-query'
import { ApiError, rawFetch, request } from './client'
import { TacitSocket } from './socket'
import type { EvalTrial, RobotAction, RunMode, Vec3 } from './types'

export type { RunMode } from './types'

/** MuJoCo quaternion order: [w, x, y, z]. */
export type Quat = [number, number, number, number]

export interface SimJoint {
  name: string
  type: 'hinge' | 'slide'
  axis: Vec3
  range: [number, number]
  qpos_index: number
}

export interface SimBody {
  name: string
  parent: string | null
  pos: Vec3
  quat: Quat
  mesh?: string | null
  joint: SimJoint | null
}

export interface SimRobot {
  urdf_glb?: string
  joints: string[]
  home_qpos?: number[]
  bodies: SimBody[]
  source?: string
}

/** Static scene bodies: the table (box, `pos` = centre, `size` = full extents) and the floor plane. */
export interface SimStatic {
  name: string
  shape: 'box' | 'plane' | string
  pos: Vec3
  size: number[]
  rgba?: number[]
  legs_height?: number
}

/** Program objects: box `size` = full extents; cylinder `size` = [diameter, height], axis z. */
export interface SimObject {
  name: string
  id?: string
  shape: 'box' | 'cylinder' | string
  size: number[]
  rgba?: number[]
  pos: Vec3
  quat?: Quat
}

/** Open bins: `pos` is the centre of the bin's floor on the table. */
export interface SimTarget {
  name: string
  id?: string
  shape: 'bin' | string
  pos: Vec3
  inner_size?: [number, number]
  outer_size?: [number, number, number]
  wall?: number
  floor?: number
  height?: number
  rgba?: number[]
}

/** MuJoCo cameras look along their -z axis with +y up in the image (the same as three.js). */
export interface SimCamera {
  parent: string | null
  pos: Vec3
  quat: Quat
  fovy: number
}

export interface SimScene {
  format?: string
  dt?: number
  program?: RobotAction[]
  tasks?: { index: number; object: string; target: string | null }[]
  bodies: SimStatic[]
  robot: SimRobot
  objects: SimObject[]
  targets: SimTarget[]
  spawn?: { x: [number, number]; y: [number, number] }
  cameras: Record<string, SimCamera>
}

export interface RobotPolicy {
  status: 'untrained' | 'training' | 'trained' | 'failed'
  success_rate?: number | null
  trials?: number | null
  trained_at?: string | null
  evaluated_at?: string | null
  demos?: number | null
  loss_curve?: [number, number][]
  /** Per-trial results of the last evaluation. */
  last_eval?: EvalTrial[]
  /** Why training failed (for example a backend restart that interrupted it). */
  error?: string | null
}

export interface RobotRunRecord {
  id: string
  mode: RunMode
  success: boolean | null
  at: string
}

export interface RobotStatus {
  program: RobotAction[]
  policy: RobotPolicy
  runs: RobotRunRecord[]
  sim_available?: boolean
}

export interface TrainJobResult {
  loss_curve?: [number, number][]
  policy_path?: string
}

export interface EvalJobResult {
  success_rate?: number
  trials?: EvalTrial[]
  seconds?: number
}

/** The expert's retargeted wrist path in replay mode (robot frame, metres, z up). */
export interface HumanPath {
  times: number[]
  points: Vec3[]
  grip?: number[] | null
  transform?: { matrix?: number[][]; scale?: number; [k: string]: unknown }
}

export interface RunMeta {
  type: 'meta'
  mode?: RunMode
  seed?: number
  joints: string[]
  objects: string[]
  targets?: string[]
  dt: number
  instruction?: string
  human?: HumanPath
}

export interface RunObjectPose {
  name: string
  pos: Vec3
  quat: Quat
}

export interface RunState {
  type: 'state'
  t: number
  qpos: number[]
  objects: RunObjectPose[]
  ee: Vec3
  gripper: number
  phase: string | null
}

export interface RunCamera {
  type: 'camera'
  name: 'exterior' | 'wrist' | string
  jpeg: string
  t?: number
}

export interface RunGr00t {
  type: 'gr00t'
  ms: number
  server_ms?: number | null
  device_ms?: number | null
  instruction: string
  step?: number
}

export interface RunDone {
  type: 'done'
  success: boolean
  reason: string | null
  steps?: number
  seconds?: number
  regrasps?: number
  tasks_done?: number
  gr00t?: { calls: number; p50_ms: number | null; max_ms: number | null }
  tracking_error_m?: number | null
}

export type RunMessage = RunMeta | RunState | RunCamera | RunGr00t | RunDone | { type: 'error'; message: string }

/** Pulls the message out of either error shape the backend uses: `{error: {...}}` or FastAPI's `{detail}`. */
async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await rawFetch(path, { method: 'POST', body })
  } catch {
    throw new ApiError(0, 'network', 'The Tacit box did not answer. Is the backend running on :8710?')
  }
  const data = (await res.json().catch(() => null)) as
    | (T & { error?: { code: string; message: string }; detail?: unknown })
    | null
  if (!res.ok) {
    const msg = data?.error?.message ?? (typeof data?.detail === 'string' ? data.detail : `${res.status} ${res.statusText}`)
    throw new ApiError(res.status, data?.error?.code ?? (res.status === 503 ? 'sim_unavailable' : 'bad_request'), msg)
  }
  return data as T
}

export const robotApi = {
  scene: (skillId?: string) => request<SimScene>(`/api/robot/scene${skillId ? `?skill_id=${encodeURIComponent(skillId)}` : ''}`),
  status: (skillId: string) => request<RobotStatus>(`/api/robot/${skillId}`),
  train: (skillId: string, demos: number, epochs: number) =>
    post<{ job_id: string }>(`/api/robot/${skillId}/train`, { demos, epochs }),
  evaluate: (skillId: string, trials: number, seed: number) =>
    post<{ job_id: string }>(`/api/robot/${skillId}/evaluate`, { trials, seed }),
  run: (skillId: string, mode: RunMode, seed: number) =>
    post<{ run_id: string }>(`/api/robot/${skillId}/run`, { mode, seed, realtime: true }),
  socket: (runId: string) => new TacitSocket<RunMessage, never>(`/ws/robot/${runId}`),
}

export const robotKeys = {
  scene: (skillId: string) => ['robot', 'scene', skillId] as const,
  status: (skillId: string) => ['robot', 'status', skillId] as const,
}

export const useSimScene = (skillId: string | undefined) =>
  useQuery({
    queryKey: robotKeys.scene(skillId ?? ''),
    queryFn: () => robotApi.scene(skillId),
    enabled: Boolean(skillId),
    staleTime: Infinity,
    retry: 1,
  })

export const useRobotStatus = (skillId: string | undefined) =>
  useQuery({
    queryKey: robotKeys.status(skillId ?? ''),
    queryFn: () => robotApi.status(skillId!),
    enabled: Boolean(skillId),
    refetchInterval: (q) => (q.state.data?.policy.status === 'training' ? 4000 : false),
  })

export const useRobotStatuses = (skillIds: string[]) =>
  useQueries({
    queries: skillIds.map((id) => ({
      queryKey: robotKeys.status(id),
      queryFn: () => robotApi.status(id),
      staleTime: 10_000,
    })),
  })
