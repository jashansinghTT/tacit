/**
 * A procedural workbench used only in mock mode. One world model (metres, y up, table at y = 0,
 * the expert behind the table facing -z) drives the synthetic video frames, the 2D tracks and the
 * 3D twin, so overlays line up exactly while the real backend is not available.
 */
import type { Box, HandFrame, PoseFrame, TrackFrame, TwinFrame, Vec2, Vec3 } from '../api/types'
import { clamp, lerp, smoothstep } from '../geometry'

export const SCENE_DURATION = 38.2
export const VIDEO_W = 1280
export const VIDEO_H = 720

// ---------------------------------------------------------------------------------------------
// Camera

const CAM_POS: Vec3 = [0, 0.8, -1.3]
const CAM_TARGET: Vec3 = [0, 0.27, 0.15]
const FOV_Y = (48 * Math.PI) / 180

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}
function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s]
}
function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
function mix3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

const fwd = norm(sub(CAM_TARGET, CAM_POS))
const right = norm(cross(fwd, [0, 1, 0]))
const up = cross(right, fwd)
const focal = VIDEO_H / 2 / Math.tan(FOV_Y / 2)

/** World point to source-video pixels, plus camera depth. */
export function project(p: Vec3): [number, number, number] {
  const d = sub(p, CAM_POS)
  const z = dot(d, fwd)
  const x = dot(d, right)
  const y = dot(d, up)
  return [VIDEO_W / 2 + (x / z) * focal, VIDEO_H / 2 - (y / z) * focal, z]
}

/** World point to camera space (metres, camera looking down +z), like HaMeR's cam_t. */
function toCamera(p: Vec3): Vec3 {
  const d = sub(p, CAM_POS)
  return [dot(d, right), -dot(d, up), dot(d, fwd)]
}

// ---------------------------------------------------------------------------------------------
// Layout

export interface SceneObject {
  label: string
  center: Vec3
  size: Vec3
  color: string
}

export const OBJECTS: SceneObject[] = [
  { label: 'blue bin', center: [-0.36, 0.045, 0.06], size: [0.2, 0.09, 0.16], color: '#2f5fa8' },
  { label: 'orange bin', center: [0.36, 0.045, 0.06], size: [0.2, 0.09, 0.16], color: '#c8641e' },
  { label: 'kit tray', center: [0, 0.012, -0.1], size: [0.32, 0.024, 0.18], color: '#3a3f46' },
  { label: 'work order', center: [-0.13, 0.002, 0.2], size: [0.1, 0.004, 0.14], color: '#e8e4d8' },
]

const SLOT_A: Vec3 = [-0.075, 0.03, -0.1]
const SLOT_B: Vec3 = [0.075, 0.03, -0.1]
const BLUE_IN: Vec3 = [-0.36, 0.05, 0.06]
const ORANGE_IN: Vec3 = [0.36, 0.05, 0.06]
const CARD: Vec3 = [-0.13, 0.0, 0.2]

const REST_L: Vec3 = [-0.17, 0.035, 0.16]
const REST_R: Vec3 = [0.17, 0.035, 0.16]

export const STEP_TIMES: { title: string; t0: number; t1: number }[] = [
  { title: 'Read the work order', t0: 0, t1: 5 },
  { title: 'Pick a bracket from the blue bin', t0: 5, t1: 11.5 },
  { title: 'Seat the bracket in slot A', t0: 11.5, t1: 17 },
  { title: 'Pick two M6 bolts from the orange bin', t0: 17, t1: 24.5 },
  { title: 'Drop the bolts into slot B', t0: 24.5, t1: 30 },
  { title: 'Check the kit and push it to outbound', t0: 30, t1: SCENE_DURATION },
]

// ---------------------------------------------------------------------------------------------
// Motion: keyframed wrist positions and finger curl per hand

interface Key {
  t: number
  p: Vec3
  curl: number
}

const lift = (p: Vec3, h: number): Vec3 => [p[0], p[1] + h, p[2]]

const LEFT_KEYS: Key[] = [
  { t: 0, p: REST_L, curl: 0.25 },
  { t: 5.2, p: REST_L, curl: 0.25 },
  { t: 7.4, p: lift(BLUE_IN, 0.14), curl: 0.05 },
  { t: 8.4, p: lift(BLUE_IN, 0.035), curl: 0.1 },
  { t: 9.4, p: lift(BLUE_IN, 0.035), curl: 0.85 },
  { t: 11.2, p: lift(BLUE_IN, 0.16), curl: 0.85 },
  { t: 13.6, p: lift(SLOT_A, 0.12), curl: 0.85 },
  { t: 14.6, p: lift(SLOT_A, 0.03), curl: 0.85 },
  { t: 15.6, p: lift(SLOT_A, 0.03), curl: 0.1 },
  { t: 16.8, p: REST_L, curl: 0.25 },
  { t: 31, p: REST_L, curl: 0.25 },
  { t: 32.6, p: [-0.15, 0.03, -0.02], curl: 0.35 },
  { t: 35.4, p: [-0.15, 0.03, -0.12], curl: 0.35 },
  { t: 37.2, p: REST_L, curl: 0.25 },
  { t: SCENE_DURATION, p: REST_L, curl: 0.25 },
]

const RIGHT_KEYS: Key[] = [
  { t: 0, p: REST_R, curl: 0.25 },
  { t: 17.2, p: REST_R, curl: 0.25 },
  { t: 19.4, p: lift(ORANGE_IN, 0.14), curl: 0.05 },
  { t: 20.4, p: lift(ORANGE_IN, 0.03), curl: 0.1 },
  { t: 21.6, p: lift(ORANGE_IN, 0.03), curl: 0.9 },
  { t: 23.6, p: lift(ORANGE_IN, 0.16), curl: 0.9 },
  { t: 26.6, p: lift(SLOT_B, 0.13), curl: 0.9 },
  { t: 27.6, p: lift(SLOT_B, 0.05), curl: 0.9 },
  { t: 28.4, p: lift(SLOT_B, 0.05), curl: 0.15 },
  { t: 29.8, p: REST_R, curl: 0.25 },
  { t: 31, p: REST_R, curl: 0.25 },
  { t: 32.6, p: [0.15, 0.03, -0.02], curl: 0.35 },
  { t: 35.4, p: [0.15, 0.03, -0.12], curl: 0.35 },
  { t: 37.2, p: REST_R, curl: 0.25 },
  { t: SCENE_DURATION, p: REST_R, curl: 0.25 },
]

function sampleKeys(keys: Key[], t: number) {
  const tt = clamp(t, 0, SCENE_DURATION)
  let i = 0
  while (i < keys.length - 2 && keys[i + 1].t < tt) i++
  const a = keys[i]
  const b = keys[i + 1]
  const u = smoothstep((tt - a.t) / Math.max(1e-6, b.t - a.t))
  // A small idle tremor so still hands do not look frozen.
  const wob = 0.004 * Math.sin(tt * 2.3 + a.t)
  const p = mix3(a.p, b.p, u)
  return { p: [p[0] + wob, p[1], p[2] + wob * 0.5] as Vec3, curl: lerp(a.curl, b.curl, u) }
}

function gazeTargetAt(t: number): { point: Vec3; label: string } {
  if (t < 5) return { point: CARD, label: 'work order' }
  if (t < 9.6) return { point: BLUE_IN, label: 'blue bin' }
  if (t < 17) return { point: SLOT_A, label: 'kit tray' }
  if (t < 21.8) return { point: ORANGE_IN, label: 'orange bin' }
  if (t < 30) return { point: SLOT_B, label: 'kit tray' }
  const u = (t - 30) / 8
  return { point: [lerp(-0.1, 0.1, 0.5 + 0.5 * Math.sin(u * 7)), 0.02, -0.1 - 0.06 * smoothstep(u * 2)], label: 'kit tray' }
}

// ---------------------------------------------------------------------------------------------
// Hand model: a template in hand space (x across the knuckles, z along the fingers, y up),
// fingers bent down by the curl amount.

const FINGERS: { base: [number, number]; lens: number[]; spread: number }[] = [
  { base: [-0.022, 0.03], lens: [0.04, 0.032, 0.028], spread: -0.75 }, // thumb (from CMC)
  { base: [-0.024, 0.085], lens: [0.04, 0.024, 0.02], spread: -0.08 },
  { base: [-0.002, 0.09], lens: [0.044, 0.027, 0.021], spread: 0 },
  { base: [0.018, 0.085], lens: [0.041, 0.025, 0.02], spread: 0.08 },
  { base: [0.035, 0.074], lens: [0.032, 0.019, 0.018], spread: 0.18 },
]

/** 21 landmarks in hand-local metres (origin at the wrist). */
function handLocal(curl: number, mirror: number): Vec3[] {
  const pts: Vec3[] = [[0, 0, 0]]
  FINGERS.forEach((f, fi) => {
    const thumb = fi === 0
    let pos: Vec3 = [f.base[0] * mirror, 0, f.base[1]]
    if (thumb) pts.push([f.base[0] * 0.5 * mirror, 0, f.base[1] * 0.5])
    else pts.push(pos)
    let pitch = thumb ? -0.2 : 0
    const yaw = f.spread * mirror
    f.lens.forEach((len, j) => {
      pitch -= curl * (thumb ? 0.5 : j === 0 ? 0.9 : 1.15)
      const dir: Vec3 = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)]
      if (thumb) {
        // The thumb swings across the palm as the hand closes.
        dir[0] = Math.sin(yaw * (1 - curl * 0.7)) * mirror * -Math.sign(yaw || 1) * Math.abs(Math.cos(pitch))
      }
      pos = add(pos, scale(dir, len))
      pts.push(pos)
    })
  })
  return pts
}

/** Rotate hand-local points so the fingers point along `forward` and the palm faces down. */
function placeHand(local: Vec3[], wrist: Vec3, yawRad: number, pitchDown: number): Vec3[] {
  const cy = Math.cos(yawRad)
  const sy = Math.sin(yawRad)
  const cp = Math.cos(pitchDown)
  const sp = Math.sin(pitchDown)
  return local.map(([x, y, z]) => {
    // pitch about x (fingers tilt down toward the table), then yaw about y
    const y1 = y * cp - z * sp
    const z1 = y * sp + z * cp
    const x2 = x * cy + z1 * sy
    const z2 = -x * sy + z1 * cy
    return [wrist[0] + x2, wrist[1] + y1, wrist[2] + z2]
  })
}

interface HandState {
  side: 'left' | 'right'
  world: Vec3[]
  wrist: Vec3
  curl: number
}

function handsAt(t: number): HandState[] {
  const l = sampleKeys(LEFT_KEYS, t)
  const r = sampleKeys(RIGHT_KEYS, t)
  // Fingers point away from the expert (toward -z) and slightly inward.
  const lw = placeHand(handLocal(l.curl, -1), l.p, Math.PI + 0.35, 0.25)
  const rw = placeHand(handLocal(r.curl, 1), r.p, Math.PI - 0.35, 0.25)
  return [
    { side: 'left', world: lw, wrist: l.p, curl: l.curl },
    { side: 'right', world: rw, wrist: r.p, curl: r.curl },
  ]
}

// ---------------------------------------------------------------------------------------------
// Body

const HEAD: Vec3 = [0, 0.615, 0.5]
const SHOULDER_L: Vec3 = [-0.19, 0.42, 0.46]
const SHOULDER_R: Vec3 = [0.19, 0.42, 0.46]
const HIP_L: Vec3 = [-0.14, -0.08, 0.46]
const HIP_R: Vec3 = [0.14, -0.08, 0.46]

function elbow(shoulder: Vec3, wrist: Vec3, outward: number): Vec3 {
  const mid = mix3(shoulder, wrist, 0.5)
  return [mid[0] + outward * 0.09, mid[1] - 0.07, mid[2] + 0.07]
}

function bodyAt(t: number, hands: HandState[]): Vec3[] {
  const sway = 0.006 * Math.sin(t * 0.9)
  const head: Vec3 = [HEAD[0] + sway, HEAD[1], HEAD[2]]
  const gaze = gazeTargetAt(t).point
  const look = norm(sub(gaze, head))
  const nose = add(head, scale(look, 0.09))
  const lw = hands[0].wrist
  const rw = hands[1].wrist
  const le = elbow(SHOULDER_L, lw, -1)
  const re = elbow(SHOULDER_R, rw, 1)
  const pts: Vec3[] = new Array(33).fill(null).map(() => [0, -0.6, 0.46] as Vec3)
  pts[0] = nose
  const eyeOff = 0.032
  pts[1] = add(nose, [-eyeOff * 0.6, 0.035, 0.03])
  pts[2] = add(nose, [-eyeOff, 0.035, 0.035])
  pts[3] = add(nose, [-eyeOff * 1.4, 0.035, 0.04])
  pts[4] = add(nose, [eyeOff * 0.6, 0.035, 0.03])
  pts[5] = add(nose, [eyeOff, 0.035, 0.035])
  pts[6] = add(nose, [eyeOff * 1.4, 0.035, 0.04])
  pts[7] = add(head, [-0.075, 0.0, 0.0])
  pts[8] = add(head, [0.075, 0.0, 0.0])
  pts[9] = add(nose, [-0.022, -0.04, 0.02])
  pts[10] = add(nose, [0.022, -0.04, 0.02])
  pts[11] = SHOULDER_L
  pts[12] = SHOULDER_R
  pts[13] = le
  pts[14] = re
  pts[15] = lw
  pts[16] = rw
  pts[17] = hands[0].world[17]
  pts[18] = hands[1].world[17]
  pts[19] = hands[0].world[5]
  pts[20] = hands[1].world[5]
  pts[21] = hands[0].world[2]
  pts[22] = hands[1].world[2]
  pts[23] = HIP_L
  pts[24] = HIP_R
  return pts
}

// ---------------------------------------------------------------------------------------------
// Objects that move: the bracket and bolts follow the hand while held, then sit in the tray.

function carriedObjects(t: number, hands: HandState[]) {
  const tray = trayOffset(t)
  const bracket: Vec3 =
    t < 9.4 ? [-0.36, 0.06, 0.06] : t < 15.4 ? add(hands[0].world[9], [0, -0.02, 0]) : add(SLOT_A, [0, -0.01, tray])
  const bolts: Vec3 =
    t < 21.6 ? [0.36, 0.06, 0.06] : t < 28.2 ? add(hands[1].world[9], [0, -0.02, 0]) : add(SLOT_B, [0, -0.012, tray])
  return { bracket, bolts }
}

function trayOffset(t: number) {
  return -0.1 * smoothstep((t - 32.6) / 2.8)
}

// ---------------------------------------------------------------------------------------------
// Public samplers

function boxOf(points: Vec2[], pad: number): Box {
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const [x, y] of points) {
    x1 = Math.min(x1, x)
    y1 = Math.min(y1, y)
    x2 = Math.max(x2, x)
    y2 = Math.max(y2, y)
  }
  return [x1 - pad, y1 - pad, x2 + pad, y2 + pad]
}

function boxCorners(c: Vec3, s: Vec3): Vec3[] {
  const out: Vec3[] = []
  for (const dx of [-0.5, 0.5]) for (const dy of [-0.5, 0.5]) for (const dz of [-0.5, 0.5]) {
    out.push([c[0] + dx * s[0], c[1] + dy * s[1], c[2] + dz * s[2]])
  }
  return out
}

const r1 = (v: number) => Math.round(v * 10) / 10
const r3 = (v: number) => Math.round(v * 1000) / 1000

/** The analysis for one frame, in the exact shape of a Tracks frame. */
export function trackAt(t: number, jitter = 0): TrackFrame {
  const hands = handsAt(t)
  const body = bodyAt(t, hands)
  const j = () => (Math.random() - 0.5) * jitter
  const handFrames: HandFrame[] = hands.map((h) => {
    const lm2d = h.world.map((p) => {
      const [x, y] = project(p)
      return [r1(x + j()), r1(y + j())] as Vec2
    })
    const center = h.world[9]
    return {
      side: h.side,
      bbox: boxOf(lm2d, 14).map(r1) as Box,
      lm2d,
      world: h.world.map((p) => sub(p, center).map(r3) as Vec3),
      cam_t: toCamera(h.wrist).map(r3) as Vec3,
      score: 0.95 + 0.04 * Math.sin(t + (h.side === 'left' ? 0 : 1)),
      source: 'hamer+mediapipe',
    }
  })
  const pose: PoseFrame = {
    lm2d: body.map((p, i) => {
      const [x, y] = project(p)
      const visible = i <= 22 ? 0.98 : i <= 24 ? 0.4 : 0.05
      return [r1(x), r1(y), visible] as [number, number, number]
    }),
    world: body.map((p) => sub(p, mix3(HIP_L, HIP_R, 0.5)).map(r3) as Vec3),
  }
  const headPts = boxCorners(HEAD, [0.17, 0.22, 0.17]).map((p) => {
    const [x, y] = project(p)
    return [x, y] as Vec2
  })
  const gz = gazeTargetAt(t)
  const [gx, gy] = project(gz.point)
  const { bracket, bolts } = carriedObjects(t, hands)
  const tray = trayOffset(t)
  const objects = [
    ...OBJECTS.map((o) => {
      const c: Vec3 = o.label === 'kit tray' ? add(o.center, [0, 0, tray]) : o.center
      const pts = boxCorners(c, o.size).map((p) => {
        const [x, y] = project(p)
        return [x, y] as Vec2
      })
      return { label: o.label, score: 0.9, box: boxOf(pts, 2).map(r1) as Box }
    }),
    { label: 'bracket', score: 0.83, box: boxOf(boxCorners(bracket, [0.06, 0.02, 0.04]).map((p) => project(p).slice(0, 2) as Vec2), 2).map(r1) as Box },
    { label: 'bolt', score: 0.71, box: boxOf(boxCorners(bolts, [0.04, 0.02, 0.03]).map((p) => project(p).slice(0, 2) as Vec2), 2).map(r1) as Box },
  ].map((o, i) => ({ ...o, score: r3(clamp(o.score + 0.03 * Math.sin(t * 1.7 + i), 0, 1)) }))
  return {
    t: Math.round(t * 100) / 100,
    hands: handFrames,
    pose,
    head: { bbox: boxOf(headPts, 0).map(r1) as Box },
    gaze: { x: r1(gx), y: r1(gy), inout: 0.93, target: gz.label },
    objects,
  }
}

/** The twin frame for time t, in the exact shape of the Twin API. */
export function twinAt(t: number): TwinFrame {
  const hands = handsAt(t)
  const body = bodyAt(t, hands)
  const gz = gazeTargetAt(t)
  const { bracket, bolts } = carriedObjects(t, hands)
  const tray = trayOffset(t)
  return {
    t: Math.round(t * 100) / 100,
    body: body.map((p) => p.map(r3) as Vec3),
    hands: {
      left: hands[0].world.map((p) => p.map(r3) as Vec3),
      right: hands[1].world.map((p) => p.map(r3) as Vec3),
    },
    gaze: { origin: body[0].map(r3) as Vec3, target: gz.point.map(r3) as Vec3 },
    objects: [
      ...OBJECTS.map((o) => ({ label: o.label, pos: (o.label === 'kit tray' ? add(o.center, [0, 0, tray]) : o.center).map(r3) as Vec3 })),
      { label: 'bracket', pos: bracket.map(r3) as Vec3 },
      { label: 'bolt', pos: bolts.map(r3) as Vec3 },
    ],
  }
}

export function stepIndexAt(t: number) {
  const i = STEP_TIMES.findIndex((s) => t >= s.t0 && t < s.t1)
  return i < 0 ? STEP_TIMES.length - 1 : i
}

export function gazeLabelAt(t: number) {
  return gazeTargetAt(t).label
}

/** A dense coloured point cloud of the table, bins and back wall, as VGGT would rebuild it. */
export function pointCloud(n = 24000, fake = false): Float32Array {
  const out = new Float32Array(n * 6)
  let seed = 7
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
  for (let i = 0; i < n; i++) {
    const r = rnd()
    let p: Vec3
    let c: number[]
    if (r < 0.5) {
      p = [lerp(-0.62, 0.62, rnd()), 0, lerp(-0.36, 0.36, rnd())]
      const g = 0.16 + 0.05 * rnd() + ((Math.floor((p[0] + 1) * 25) + Math.floor((p[2] + 1) * 25)) % 2) * 0.02
      c = [g, g * 1.02, g * 1.06]
    } else if (r < 0.62) {
      p = [lerp(-0.7, 0.7, rnd()), lerp(0, 0.9, rnd()), 0.62]
      const g = 0.1 + 0.04 * rnd()
      c = [g, g, g * 1.1]
    } else {
      const o = OBJECTS[Math.floor(rnd() * OBJECTS.length)]
      const face = Math.floor(rnd() * 3)
      const u = rnd() - 0.5
      const v = rnd() - 0.5
      const s = rnd() < 0.5 ? -0.5 : 0.5
      const local: Vec3 = face === 0 ? [s, u, v] : face === 1 ? [u, 0.5, v] : [u, v, s]
      p = [o.center[0] + local[0] * o.size[0], o.center[1] + local[1] * o.size[1], o.center[2] + local[2] * o.size[2]]
      const base = hex(o.color)
      const shade = 0.75 + 0.35 * rnd()
      c = base.map((x) => clamp(x * shade, 0, 1))
    }
    if (fake) {
      // An AI-made clip does not rebuild into one rigid scene: points smear and drift.
      const drift = 0.06 * Math.sin(p[0] * 9 + p[2] * 4)
      p = [p[0] + (rnd() - 0.5) * 0.05, p[1] + drift + (rnd() - 0.5) * 0.04, p[2] + (rnd() - 0.5) * 0.08]
    }
    out.set([p[0], p[1], p[2], c[0], c[1], c[2]], i * 6)
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Canvas renderer for the synthetic video

function poly(ctx: CanvasRenderingContext2D, pts: Vec3[]) {
  ctx.beginPath()
  pts.forEach((p, i) => {
    const [x, y] = project(p)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
}

function shade(hex: string, f: number) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const c = (v: number) => Math.round(clamp(v * f, 0, 255))
  return `rgb(${c(r)},${c(g)},${c(b)})`
}

function drawBox(ctx: CanvasRenderingContext2D, c: Vec3, s: Vec3, color: string, open: boolean) {
  const [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2]
  const v = (x: number, y: number, z: number): Vec3 => [c[0] + x * hx, c[1] + y * hy, c[2] + z * hz]
  // Faces seen from the front camera: top, front (-z) and the side facing the centre.
  if (open) {
    poly(ctx, [v(-1, 1, -1), v(1, 1, -1), v(1, 1, 1), v(-1, 1, 1)])
    ctx.fillStyle = shade(color, 0.45)
    ctx.fill()
    poly(ctx, [v(-0.9, 1, -0.9), v(0.9, 1, -0.9), v(0.9, 1, 0.9), v(-0.9, 1, 0.9)])
    ctx.fillStyle = shade(color, 0.3)
    ctx.fill()
  } else {
    poly(ctx, [v(-1, 1, -1), v(1, 1, -1), v(1, 1, 1), v(-1, 1, 1)])
    ctx.fillStyle = shade(color, 1.1)
    ctx.fill()
  }
  const side = c[0] < 0 ? 1 : -1
  poly(ctx, [v(side, -1, -1), v(side, 1, -1), v(side, 1, 1), v(side, -1, 1)])
  ctx.fillStyle = shade(color, 0.7)
  ctx.fill()
  poly(ctx, [v(-1, -1, -1), v(1, -1, -1), v(1, 1, -1), v(-1, 1, -1)])
  ctx.fillStyle = shade(color, 0.92)
  ctx.fill()
}

const SKIN = '#c99a7e'
const SKIN_DARK = '#9e7058'
const SLEEVE = '#2b3a4a'

function limb(ctx: CanvasRenderingContext2D, a: Vec3, b: Vec3, w: number, color: string) {
  const [ax, ay, az] = project(a)
  const [bx, by, bz] = project(b)
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineWidth = (w * focal) / ((az + bz) / 2)
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(bx, by)
  ctx.stroke()
}

function drawHand(ctx: CanvasRenderingContext2D, h: HandState) {
  const w = h.world
  // Palm
  poly(ctx, [w[0], w[1], w[5], w[9], w[13], w[17]])
  ctx.fillStyle = SKIN
  ctx.fill()
  const fingers = [
    [1, 2, 3, 4],
    [5, 6, 7, 8],
    [9, 10, 11, 12],
    [13, 14, 15, 16],
    [17, 18, 19, 20],
  ]
  for (const f of fingers) {
    for (let i = 0; i < f.length - 1; i++) limb(ctx, w[f[i]], w[f[i + 1]], 0.019 - i * 0.002, SKIN_DARK)
    for (let i = 0; i < f.length - 1; i++) limb(ctx, w[f[i]], w[f[i + 1]], 0.015 - i * 0.002, SKIN)
  }
}

export interface DrawOptions {
  fake?: boolean
  noise?: boolean
}

/** Draw the synthetic camera frame at time t. Sized to VIDEO_W × VIDEO_H. */
export function drawFrame(ctx: CanvasRenderingContext2D, t: number, opts: DrawOptions = {}) {
  const W = VIDEO_W
  const H = VIDEO_H
  ctx.save()
  // Back wall
  const wall = ctx.createLinearGradient(0, 0, 0, H * 0.5)
  wall.addColorStop(0, '#2a2e33')
  wall.addColorStop(1, '#3a3f45')
  ctx.fillStyle = wall
  ctx.fillRect(0, 0, W, H)
  // Pegboard dots on the wall
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  for (let y = 24; y < H * 0.45; y += 26) for (let x = 14 + ((y / 26) % 2) * 13; x < W; x += 26) ctx.fillRect(x, y, 3, 3)

  const fakeWarp = opts.fake ? 0.03 * Math.sin(t * 0.8) : 0
  const hands = handsAt(t)
  const body = bodyAt(t, hands)

  // Torso, neck, head (behind the table)
  poly(ctx, [
    [SHOULDER_L[0] - 0.03, SHOULDER_L[1] + 0.02, SHOULDER_L[2]],
    [SHOULDER_R[0] + 0.03, SHOULDER_R[1] + 0.02, SHOULDER_R[2]],
    [0.2, -0.1, 0.46],
    [-0.2, -0.1, 0.46],
  ])
  ctx.fillStyle = SLEEVE
  ctx.fill()
  limb(ctx, [0, 0.43, 0.48], [0, 0.52, 0.5], 0.075, SKIN_DARK)
  const [hx, , hz] = project(body[0])
  const [cx, cy] = project(HEAD)
  const headR = (0.098 * focal) / hz
  ctx.fillStyle = SKIN
  ctx.beginPath()
  ctx.ellipse(cx * 0.7 + hx * 0.3, cy, headR * 0.86, headR * 1.08, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#1d1a18'
  ctx.beginPath()
  ctx.ellipse(cx, cy - headR * 0.45, headR * 0.92, headR * 0.7, 0, Math.PI, Math.PI * 2)
  ctx.fill()
  // Eyes follow the gaze
  ctx.fillStyle = '#2a201b'
  for (const i of [2, 5]) {
    const [ex, ey] = project(body[i])
    ctx.beginPath()
    ctx.arc(ex, ey + 2, headR * 0.07, 0, Math.PI * 2)
    ctx.fill()
  }

  // Table (a dark cutting mat with a grid)
  const T = (x: number, z: number): Vec3 => [x + fakeWarp * Math.sin(z * 8 + t), 0, z]
  poly(ctx, [T(-0.66, -0.4), T(0.66, -0.4), T(0.66, 0.38), T(-0.66, 0.38)])
  ctx.fillStyle = '#20302a'
  ctx.fill()
  ctx.strokeStyle = 'rgba(160, 220, 190, 0.12)'
  ctx.lineWidth = 1
  for (let x = -0.6; x <= 0.61; x += 0.05) {
    const [ax, ay] = project(T(x, -0.4))
    const [bx, by] = project(T(x, 0.38))
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.stroke()
  }
  for (let z = -0.4; z <= 0.39; z += 0.05) {
    const [ax, ay] = project(T(-0.66, z))
    const [bx, by] = project(T(0.66, z))
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.stroke()
  }
  // Table front edge
  poly(ctx, [T(-0.66, -0.4), T(0.66, -0.4), [0.66, -0.05, -0.4], [-0.66, -0.05, -0.4]])
  ctx.fillStyle = '#15191c'
  ctx.fill()

  // Objects
  const tray = trayOffset(t)
  for (const o of OBJECTS) {
    const c: Vec3 = o.label === 'kit tray' ? [o.center[0], o.center[1], o.center[2] + tray] : o.center
    const size: Vec3 = opts.fake ? [o.size[0] * (1 + 0.08 * Math.sin(t * 1.3 + o.center[0] * 9)), o.size[1], o.size[2]] : o.size
    if (o.label === 'work order') {
      poly(ctx, [
        [c[0] - size[0] / 2, 0.003, c[2] - size[2] / 2],
        [c[0] + size[0] / 2, 0.003, c[2] - size[2] / 2],
        [c[0] + size[0] / 2, 0.003, c[2] + size[2] / 2],
        [c[0] - size[0] / 2, 0.003, c[2] + size[2] / 2],
      ])
      ctx.fillStyle = o.color
      ctx.fill()
      ctx.strokeStyle = 'rgba(40,40,40,0.5)'
      for (let k = 0; k < 5; k++) {
        const z = c[2] - size[2] / 2 + 0.025 + k * 0.022
        const [ax, ay] = project([c[0] - 0.04, 0.004, z])
        const [bx, by] = project([c[0] + 0.03 - (k % 2) * 0.02, 0.004, z])
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
        ctx.stroke()
      }
      continue
    }
    drawBox(ctx, c, size, o.color, o.label !== 'kit tray')
    if (o.label === 'kit tray') {
      for (const s of [SLOT_A, SLOT_B]) {
        const sc: Vec3 = [s[0], 0.025, s[2] + tray]
        poly(ctx, [
          [sc[0] - 0.055, sc[1], sc[2] - 0.06],
          [sc[0] + 0.055, sc[1], sc[2] - 0.06],
          [sc[0] + 0.055, sc[1], sc[2] + 0.06],
          [sc[0] - 0.055, sc[1], sc[2] + 0.06],
        ])
        ctx.fillStyle = '#272b30'
        ctx.fill()
      }
    }
  }
  // Parts left in the bins
  ctx.fillStyle = '#b8bec6'
  for (let k = 0; k < 7; k++) {
    const [px, py] = project([-0.4 + (k % 4) * 0.025, 0.07, 0.03 + Math.floor(k / 4) * 0.04])
    ctx.fillRect(px - 9, py - 3, 18, 6)
  }
  ctx.fillStyle = '#8a9099'
  for (let k = 0; k < 12; k++) {
    const [px, py] = project([0.32 + (k % 4) * 0.022, 0.07, 0.03 + Math.floor(k / 4) * 0.025])
    ctx.beginPath()
    ctx.arc(px, py, 4, 0, Math.PI * 2)
    ctx.fill()
  }
  const { bracket, bolts } = carriedObjects(t, hands)
  const [bx, by] = project(bracket)
  ctx.fillStyle = '#d5dae0'
  ctx.fillRect(bx - 14, by - 5, 28, 10)
  const [ox, oy] = project(bolts)
  ctx.fillStyle = '#9aa1aa'
  for (const dx of [-6, 6]) {
    ctx.beginPath()
    ctx.arc(ox + dx, oy, 4.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // Arms over the table edge, then hands
  for (const [s, e, w] of [
    [11, 13, 15],
    [12, 14, 16],
  ] as const) {
    limb(ctx, body[s], body[e], 0.075, SLEEVE)
    limb(ctx, body[e], mix3(body[e], body[w], 0.55), 0.066, SLEEVE)
    limb(ctx, mix3(body[e], body[w], 0.5), body[w], 0.046, SKIN)
  }
  for (const h of hands) drawHand(ctx, h)

  // Lens vignette and sensor noise, so it reads as a camera
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, 'rgba(0,0,0,0.45)')
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, W, H)
  if (opts.noise) {
    ctx.fillStyle = 'rgba(255,255,255,0.025)'
    for (let k = 0; k < 900; k++) ctx.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5)
  }
  ctx.restore()
}
