// Types for the Tacit backend API. Source of truth: docs/API.md (v1 contract).
// Times are seconds unless a field ends in `_ms`. Pixel coordinates are source-video pixels.

export type Vec2 = [number, number]
export type Vec3 = [number, number, number]
export type Box = [number, number, number, number]

export type Backend = 'tt' | 'cpu' | 'cache' | 'mock'

export interface ServedBy {
  model: string
  chip: number | null
  backend: Backend
  ms: number
}

export interface ApiErrorBody {
  error: {
    code: 'not_found' | 'bad_request' | 'model_unavailable' | 'internal' | string
    message: string
    detail?: Record<string, unknown>
  }
}

// System

export interface Health {
  ok: boolean
  version: string
}

export interface BoxModel {
  key?: string
  name: string
  role: string
  port: number
  healthy: boolean
  /** Health check timed out but it answered within the last 2 min: working, not down. */
  busy?: boolean
  p50_ms: number | null
  calls: number
  errors?: number
  backend: Backend
  // Optional extras the backend may add (cohost status per member).
  dram_gib?: number
  l1_kib?: number
  history_ms?: number[]
}

export interface BoxChip {
  id: number
  board: string
  group: string
  status: 'ok' | 'degraded' | 'down' | 'idle' | string
  models: BoxModel[]
  memory?: {
    dram_gib: number
    dram_total_gib: number
    l1_used_kib?: number
    l1_total_kib?: number
    members?: Record<string, number>
    device_owner?: string | null
  }
}

export interface BoxStatus {
  /** The chip-1 voice gate: queued listen / interactive / batch requests. */
  speech_queue?: { listen: number; interactive: number; batch: number; busy: boolean }
  host: string
  updated_at: string
  chips: BoxChip[]
  totals: { models: number; healthy: number; chips: number }
}

export type Role = 'expert' | 'trainee' | 'manager' | 'buyer'

export interface User {
  id: string
  name: string
  role: Role
  title: string
  avatar: string
}

export interface Sample {
  id: string
  title: string
  video: string
  thumb: string
  duration: number
  kind: 'real' | 'ai-generated'
}

export interface SampleVerification {
  sample_id: string
  kind: Sample['kind']
  status: VerificationStatus
  score: number | null
  method: string
  details: Record<string, number>
  times?: number[]
  pointcloud: string | null
  points?: number
  served_by?: ServedBy[]
}

// Skills

export type SkillStatus = 'draft' | 'processing' | 'ready' | 'failed'
export type VerificationStatus = 'pending' | 'verified' | 'suspect'

export interface PersonRef {
  id: string
  name: string
  title?: string
}

export interface SkillSummary {
  id: string
  title: string
  summary: string
  status: SkillStatus
  created_at: string
  expert: PersonRef
  thumb: string | null
  duration: number | null
  steps_count: number
  verification_status: VerificationStatus
  listed: boolean
  /** live, upload or sample (the seeded demo skills come from samples). */
  source_kind?: string
}

export interface Consent {
  motion: boolean
  gaze: boolean
  voice_text: boolean
  raw_video: boolean
  signed_by?: string | null
  signed_at?: string | null
}

export interface Step {
  id: string
  index: number
  t_start: number
  t_end: number
  title: string
  instruction: string
  why: string
  why_source: 'expert' | 'inferred'
  keyframe: string | null
  objects: string[]
  hand: 'left' | 'right' | 'both' | string | null
  gaze_target: string | null
  tips: string[]
}

export interface QA {
  id?: string
  step_id: string
  t: number
  question: string
  question_audio?: string | null
  answer: string | null
  answer_audio?: string | null
}

export interface QuizItem {
  q: string
  choices: string[]
  answer: number
  explain: string
}

export interface Verification {
  status: VerificationStatus
  score: number | null
  method: string
  /** Known keys: views, reproj_px or reproj_rel, depth_stability, camera_drift, static_pixels. */
  details: { views: number; reproj_px?: number; reproj_rel?: number; depth_stability?: number; camera_drift?: number; [k: string]: unknown }
  checked_at: string | null
  pointcloud: string | null
  served_by?: ServedBy[]
}

export interface RobotAction {
  op: 'pick' | 'place' | string
  object?: string
  target?: string
}

export interface PolicyInfo {
  status: 'untrained' | 'training' | 'trained' | 'failed'
  success_rate: number | null
  trials: number | null
  trained_at: string | null
}

export interface ModelUsage {
  model: string
  chip: number | null
  calls: number
  p50_ms: number | null
  backend: Backend
}

export interface Skill {
  id: string
  title: string
  summary: string
  status: SkillStatus
  created_at: string
  expert: PersonRef
  source: {
    kind: 'live' | 'upload' | 'sample'
    video: string | null
    fps: number
    duration: number
    width: number
    height: number
  }
  consent: Consent
  steps: Step[]
  qa: QA[]
  sop_markdown: string
  quiz: QuizItem[]
  safety: string[]
  verification: Verification
  robot: {
    program: RobotAction[]
    policy: PolicyInfo
    gr00t: { last_run: string | null }
  }
  listing_id: string | null
  models_used: ModelUsage[]
  job_id?: string | null
}

export interface HandFrame {
  side: 'left' | 'right'
  bbox: Box
  lm2d: Vec2[]
  world: Vec3[]
  cam_t: Vec3 | null
  score: number
  source: string
}

export interface PoseFrame {
  lm2d: [number, number, number][]
  world: Vec3[]
}

export interface GazeFrame {
  x: number
  y: number
  inout: number
  target: string | null
}

export interface ObjectDet {
  label: string
  score: number
  box: Box
}

export interface TrackFrame {
  t: number
  hands: HandFrame[]
  pose: PoseFrame | null
  head: { bbox: Box } | null
  gaze: GazeFrame | null
  objects: ObjectDet[]
}

export interface Tracks {
  fps: number
  width: number
  height: number
  frames: TrackFrame[]
}

export interface TwinFrame {
  t: number
  body: Vec3[] | null
  hands: { left: Vec3[] | null; right: Vec3[] | null }
  gaze: { origin: Vec3; target: Vec3 } | null
  objects: { label: string; pos: Vec3 }[]
}

export interface Twin {
  fps: number
  frames: TwinFrame[]
  bounds: { min: Vec3; max: Vec3 }
  up: Vec3
  /** The recording camera in the twin frame (pinhole intrinsics in source pixels). */
  camera?: { position: Vec3; f?: number; cx?: number; cy?: number; person_depth_m?: number }
}

// Jobs

export type JobStatus = 'queued' | 'running' | 'done' | 'failed'
export type StageStatus = 'pending' | 'queued' | 'running' | 'done' | 'failed' | 'skipped'

export interface JobStage {
  name: string
  status: StageStatus
  ms?: number | null
  progress?: number | null
  detail?: string | null
  models?: string[]
}

export interface Job<R = Record<string, unknown>> {
  id: string
  kind: 'process' | 'verify' | 'train' | 'evaluate' | string
  skill_id: string
  status: JobStatus
  progress: number
  stage: string | null
  stages: JobStage[]
  error: string | null
  result: R | null
}

export interface TrainResult {
  loss_curve: [number, number][]
  policy_path?: string
}

export interface EvalTrial {
  seed: number
  success: boolean
  steps: number
  reason: string | null
}

export interface EvalResult {
  success_rate: number
  trials: EvalTrial[]
}

// Live capture (WS /ws/capture/{skill_id})

export interface AnalysisMsg {
  type: 'analysis'
  t: number
  hands: HandFrame[]
  pose: PoseFrame | null
  head: { bbox: Box } | null
  gaze: GazeFrame | null
  objects: ObjectDet[]
  timing_ms: Record<string, number>
  served_by: ServedBy[]
  width?: number
  height?: number
}

export interface CaptureEventMsg {
  type: 'event'
  t: number
  kind: 'grasp' | 'release' | 'move' | 'look' | 'pause'
  hand?: string
  object?: string
}

export interface StepMsg {
  type: 'step'
  step: Partial<Step>
}

export interface CoachMsg {
  type: 'coach'
  id: string
  t: number
  text: string
  audio: string | null
  /** True when the voice is still being synthesised and follows as `coach_audio`. */
  pending_audio?: boolean
}

export interface CoachAudioMsg {
  type: 'coach_audio'
  id: string
  audio: string
  duration: number
}

export interface TranscriptMsg {
  type: 'transcript'
  question_id: string | null
  text: string
  ms: number
}

export interface SavedMsg {
  type: 'saved'
  skill_id: string
  job_id: string
}

export interface ErrorMsg {
  type: 'error'
  message: string
}

export type CaptureServerMsg =
  | AnalysisMsg
  | CaptureEventMsg
  | StepMsg
  | CoachMsg
  | CoachAudioMsg
  | TranscriptMsg
  | SavedMsg
  | ErrorMsg

export type CaptureClientMsg =
  | { type: 'frame'; t: number; jpeg: string }
  | { type: 'answer'; t: number; wav: string; question_id?: string }
  | { type: 'say'; text: string; question_id?: string }
  | { type: 'stop' }

// Speech

export interface TtsResponse {
  audio: string
  duration: number
  served_by: ServedBy[]
}

export interface SttResponse {
  text: string
  served_by: ServedBy[]
}

// Learn

export interface LessonSummary {
  skill_id: string
  title: string
  steps_count: number
  duration: number | null
  expert: PersonRef
  thumb: string | null
  progress: number | null
}

export interface LessonStep {
  index: number
  title: string
  instruction: string
  why: string
  keyframe: string | null
  t_start: number
  t_end: number
  narration_audio: string | null
}

export interface Lesson {
  skill_id: string
  title: string
  steps: LessonStep[]
  quiz: QuizItem[]
  intro_audio: string | null
}

export type LearnServerMsg =
  | (Omit<AnalysisMsg, 'type'> & { type: 'analysis' })
  | {
      type: 'feedback'
      step_index: number
      score: number
      phase: number
      hint: string | null
      done: boolean
    }
  | { type: 'step_done'; step_index: number; score: number }
  | ErrorMsg

export type LearnClientMsg =
  | { type: 'frame'; t: number; jpeg: string }
  | { type: 'step'; index: number }
  | { type: 'stop' }

export interface CompleteResult {
  score: number
  passed: boolean
  certificate: string | null
}

export interface ProgressRow {
  trainee: PersonRef & { title?: string; avatar?: string }
  skill_id: string
  skill_title?: string
  steps_done: number
  steps_total: number
  best_score: number | null
  passed: boolean
  updated_at: string
}

export interface TutorDone {
  text: string
  audio: string | null
  sources: string[]
  served_by: ServedBy[]
}

// Robot Lab

export interface SceneBody {
  name: string
  mesh?: string
  pos?: Vec3
  quat?: [number, number, number, number]
  size?: Vec3
  color?: string
  [k: string]: unknown
}

export interface RobotScene {
  bodies: SceneBody[]
  robot: { urdf_glb: string; joints: string[]; links?: unknown[]; [k: string]: unknown }
  objects: SceneBody[]
  targets: SceneBody[]
  cameras: Record<string, unknown>
}

export interface RobotRun {
  id: string
  mode: RunMode
  success: boolean | null
  at: string
}

export interface RobotInfo {
  program: RobotAction[]
  policy: PolicyInfo
  runs: RobotRun[]
}

export type RunMode = 'replay' | 'policy' | 'gr00t' | 'scripted'

export type RobotServerMsg =
  | { type: 'meta'; joints: string[]; objects: string[]; dt: number }
  | {
      type: 'state'
      t: number
      qpos: number[]
      objects: { name: string; pos: Vec3; quat: [number, number, number, number] }[]
      ee: Vec3
      gripper: number
      phase: string | null
    }
  | { type: 'camera'; name: 'exterior' | 'wrist'; jpeg: string }
  | { type: 'gr00t'; ms: number; instruction: string }
  | { type: 'done'; success: boolean; reason: string | null }
  | ErrorMsg

// Exchange

export type LicenseType = 'training' | 'robot_deploy' | 'exclusive'

export interface Listing {
  id: string
  skill_id: string
  title: string
  summary: string
  thumb: string | null
  preview_video: string | null
  expert: PersonRef
  plant: string
  industry: string
  robot_types: string[]
  verified: boolean
  consent: Consent
  price: Record<LicenseType, number>
  currency: string
  royalty_split: { expert: number; plant: number }
  licenses_sold: number
  rating: number | null
  created_at: string
  demo: boolean
}

export interface ListingDetail extends Listing {
  skill: Skill
  contents: { episodes: number; hours_of_motion: number; formats: string[] }
  terms: string
}

export interface CreateListing {
  skill_id: string
  price: Record<LicenseType, number>
  royalty_split: { expert: number; plant: number }
  industry: string
  robot_types: string[]
  consent: Consent
}

export interface LicenseResult {
  license_id: string
  receipt: {
    amount: number
    currency: string
    royalties: { to: string; amount: number }[]
  }
  download: string
}

export interface LicenseRecord {
  id: string
  listing_id: string
  license_type: LicenseType
  buyer_id?: string
  amount?: number
  currency?: string
  created_at?: string
  download?: string
}

export interface LibraryItem {
  license: LicenseRecord
  listing: Listing
}

export interface EarningsEntry {
  at: string
  listing_id: string
  skill_title: string
  buyer: string
  license_type: LicenseType
  amount: number
}

export interface Earnings {
  total: number
  currency: string
  by_month: [string, number][]
  entries: EarningsEntry[]
}

// Quality and safety audit (use case 5)

export type AuditStepStatus = 'done' | 'missing' | 'out_of_order'

export interface AuditStep {
  index: number
  title: string
  status: AuditStepStatus
  score: number | null
  expert_seconds: number | null
  /** Where the step starts in the worker's run (the backend may send [start, end]). */
  run_t: number | null
  run_t_end?: number | null
  run_seconds: number | null
  /** Targets as lists after normalisation (the backend may send a string or a list). */
  gaze_check: { expert_looked_at: string[]; worker_looked_at: string[]; ok: boolean | null } | null
}

export interface AuditSummary {
  steps_total: number
  done: number
  out_of_order: number
  missing: number
  gaze_checks_ok: number
  score: number | null
}

export interface AuditListItem {
  id: string
  worker: string
  created_at: string
  summary: AuditSummary | null
  narrative: string | null
  video: string | null
}

export interface Audit extends AuditListItem {
  skill_id: string
  steps: AuditStep[]
}
