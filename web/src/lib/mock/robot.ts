// Mock robot runs: a scripted pick-and-place in joint space, solved with the Panda IK.
import type { Vec3 } from '../api/types'
import type { SimScene } from '../api/robot'
import { forward, HOME, JOINT_NAMES, position, solveIK, type V3 } from '../../three/franka'
import { smoothstep } from '../geometry'

// MuJoCo frame: metres, z up, robot base at the origin, table top at z = 0.
export const OBJECT_START: Record<string, Vec3> = {
  bracket: [0.44, 0.24, 0.012],
  bolt: [0.48, -0.22, 0.01],
}
export const TARGETS: Record<string, Vec3> = {
  'slot A': [0.63, 0.07, 0.03],
  'slot B': [0.63, -0.07, 0.03],
}

/**
 * The scene in the sim's `tacit-sim-scene/1` shape (as `GET /api/robot/scene` returns it): the
 * Menagerie Panda's kinematic tree, the table, the program's objects and bins. Meshes are left
 * out so mock mode draws the arm from primitives and never asks the backend for GLBs.
 */
export function mockScene(): SimScene {
  const hinge = (name: string, i: number, range: [number, number]) => ({ name, type: 'hinge' as const, axis: [0, 0, 1] as Vec3, range, qpos_index: i })
  const h = Math.SQRT1_2
  return {
    format: 'tacit-sim-scene/1',
    dt: 1 / 30,
    program: [
      { op: 'pick', object: 'bracket' }, { op: 'place', target: 'slot A' },
      { op: 'pick', object: 'bolt' }, { op: 'place', target: 'slot B' },
    ],
    tasks: [
      { index: 0, object: 'bracket', target: 'slot A' },
      { index: 1, object: 'bolt', target: 'slot B' },
    ],
    bodies: [
      { name: 'table', shape: 'box', pos: [0.265, 0, -0.02], size: [1.03, 1.24, 0.04], legs_height: 0.76 },
      { name: 'floor', shape: 'plane', pos: [0, 0, -0.76], size: [6, 6] },
    ],
    robot: {
      joints: [...JOINT_NAMES, 'panda_finger_joint1', 'panda_finger_joint2'],
      home_qpos: [...HOME, 0.04, 0.04],
      bodies: [
        { name: 'panda_link0', parent: null, pos: [0, 0, 0], quat: [1, 0, 0, 0], joint: null },
        { name: 'panda_link1', parent: 'panda_link0', pos: [0, 0, 0.333], quat: [1, 0, 0, 0], joint: hinge('panda_joint1', 0, [-2.8973, 2.8973]) },
        { name: 'panda_link2', parent: 'panda_link1', pos: [0, 0, 0], quat: [h, -h, 0, 0], joint: hinge('panda_joint2', 1, [-1.7628, 1.7628]) },
        { name: 'panda_link3', parent: 'panda_link2', pos: [0, -0.316, 0], quat: [h, h, 0, 0], joint: hinge('panda_joint3', 2, [-2.8973, 2.8973]) },
        { name: 'panda_link4', parent: 'panda_link3', pos: [0.0825, 0, 0], quat: [h, h, 0, 0], joint: hinge('panda_joint4', 3, [-3.0718, -0.0698]) },
        { name: 'panda_link5', parent: 'panda_link4', pos: [-0.0825, 0.384, 0], quat: [h, -h, 0, 0], joint: hinge('panda_joint5', 4, [-2.8973, 2.8973]) },
        { name: 'panda_link6', parent: 'panda_link5', pos: [0, 0, 0], quat: [h, h, 0, 0], joint: hinge('panda_joint6', 5, [-0.0175, 3.7525]) },
        { name: 'panda_link7', parent: 'panda_link6', pos: [0.088, 0, 0], quat: [h, h, 0, 0], joint: hinge('panda_joint7', 6, [-2.8973, 2.8973]) },
        { name: 'panda_hand', parent: 'panda_link7', pos: [0, 0, 0.107], quat: [0.92388, 0, 0, -0.38268], joint: null },
        { name: 'panda_left_finger', parent: 'panda_hand', pos: [0, 0, 0.0584], quat: [1, 0, 0, 0], joint: { name: 'panda_finger_joint1', type: 'slide', axis: [0, 1, 0], range: [0, 0.04], qpos_index: 7 } },
        { name: 'panda_right_finger', parent: 'panda_hand', pos: [0, 0, 0.0584], quat: [0, 0, 0, 1], joint: { name: 'panda_finger_joint2', type: 'slide', axis: [0, 1, 0], range: [0, 0.04], qpos_index: 8 } },
      ],
    },
    objects: [
      { name: 'bracket', shape: 'box', size: [0.06, 0.03, 0.024], rgba: [0.84, 0.86, 0.88, 1], pos: OBJECT_START.bracket, quat: [1, 0, 0, 0] },
      { name: 'bolt', shape: 'cylinder', size: [0.02, 0.03], rgba: [0.6, 0.63, 0.67, 1], pos: OBJECT_START.bolt, quat: [1, 0, 0, 0] },
    ],
    targets: Object.entries(TARGETS).map(([name, p]) => ({
      name,
      shape: 'bin',
      pos: [p[0], p[1], 0] as Vec3,
      outer_size: [0.12, 0.13, 0.035] as [number, number, number],
      inner_size: [0.108, 0.118] as [number, number],
      wall: 0.006,
      floor: 0.006,
      height: 0.035,
      rgba: name === 'slot A' ? [0.18, 0.37, 0.66, 1] : [0.78, 0.39, 0.12, 1],
    })),
    spawn: { x: [0.38, 0.52], y: [-0.26, 0.26] },
    cameras: {
      exterior: { parent: null, pos: [0.3, 0.66, 0.46], quat: [-0.11221, -0.06369, 0.48951, 0.8624], fovy: 62 },
      wrist: { parent: 'panda_hand', pos: [0.075, 0, 0.045], quat: [0.21342, 0.67413, 0.67413, 0.21342], fovy: 80 },
    },
  }
}

interface Waypoint {
  q: number[]
  grip: number
  secs: number
  phase: string
  attach?: string | null
  release?: string
}

const up = (p: Vec3, h: number): V3 => [p[0], p[1], p[2] + h]

export function buildTrajectory(jitter = 0): Waypoint[] {
  const out: Waypoint[] = [{ q: HOME, grip: 0.04, secs: 0.6, phase: 'home' }]
  let seed = HOME
  const go = (p: V3, grip: number, secs: number, phase: string, extra: Partial<Waypoint> = {}) => {
    const target: V3 = [p[0] + (Math.random() - 0.5) * jitter, p[1] + (Math.random() - 0.5) * jitter, p[2]]
    seed = solveIK(target, seed, 80)
    out.push({ q: seed, grip, secs, phase, ...extra })
  }
  const pick = (name: string) => {
    const p = OBJECT_START[name]
    go(up(p, 0.16), 0.04, 1.4, `reach ${name}`)
    go(up(p, 0.012), 0.04, 0.9, `pick ${name}`)
    go(up(p, 0.012), 0.008, 0.5, `pick ${name}`, { attach: name })
    go(up(p, 0.18), 0.008, 0.9, `lift ${name}`)
  }
  const place = (name: string, target: string) => {
    const p = TARGETS[target]
    go(up(p, 0.16), 0.008, 1.4, `move to ${target}`)
    go(up(p, 0.025), 0.008, 0.9, `place ${name}`)
    go(up(p, 0.025), 0.04, 0.5, `place ${name}`, { release: name })
    go(up(p, 0.16), 0.04, 0.8, 'retreat')
  }
  pick('bracket')
  place('bracket', 'slot A')
  pick('bolt')
  place('bolt', 'slot B')
  out.push({ q: HOME, grip: 0.04, secs: 1.4, phase: 'home' })
  return out
}

export interface RobotFrame {
  t: number
  qpos: number[]
  ee: Vec3
  gripper: number
  phase: string
  objects: { name: string; pos: Vec3; quat: [number, number, number, number] }[]
}

/** Sample a trajectory at time t, carrying attached objects with the TCP. */
export function sampler(traj: Waypoint[]) {
  const starts: number[] = []
  let acc = 0
  for (const w of traj) {
    starts.push(acc)
    acc += w.secs
  }
  const total = acc
  const objPos: Record<string, Vec3> = { ...OBJECT_START }
  let held: string | null = null
  let lastIdx = -1
  const sample = (t: number): RobotFrame => {
    let i = 0
    while (i < traj.length - 1 && starts[i + 1] <= t) i++
    // fire attach/release events once as we pass each waypoint
    for (let k = lastIdx + 1; k <= i; k++) {
      if (traj[k].attach) held = traj[k].attach!
      if (traj[k].release) {
        const r = traj[k].release!
        const tgt = r === 'bracket' ? TARGETS['slot A'] : TARGETS['slot B']
        objPos[r] = [tgt[0], tgt[1], 0.012]
        held = null
      }
    }
    lastIdx = i
    const a = traj[Math.max(0, i - 1)]
    const b = traj[i]
    const u = i === 0 ? 1 : smoothstep((t - starts[i]) / b.secs)
    const from = i === 0 ? b : a
    const q = from.q.map((v, j) => v + (b.q[j] - v) * u)
    const grip = from.grip + (b.grip - from.grip) * u
    const tcp = position(forward(q).tcp) as Vec3
    if (held) objPos[held] = [tcp[0], tcp[1], tcp[2] - 0.012]
    return {
      t,
      qpos: [...q, grip, grip],
      ee: tcp,
      gripper: grip,
      phase: b.phase,
      objects: Object.entries(objPos).map(([name, pos]) => ({ name, pos: [...pos] as Vec3, quat: [1, 0, 0, 0] })),
    }
  }
  return { sample, total }
}

/** A schematic camera frame (exterior or wrist) for GR00T mode, as a base64 JPEG. */
export async function cameraJpeg(name: 'exterior' | 'wrist', f: RobotFrame): Promise<string> {
  const W = 320
  const H = 180
  const c = new OffscreenCanvas(W, H)
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#1d2126')
  g.addColorStop(1, '#2c3238')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  if (name === 'exterior') {
    // side-on: x to the right, z up
    const px = (x: number) => 40 + x * 330
    const pz = (z: number) => 150 - z * 300
    ctx.fillStyle = '#3a4048'
    ctx.fillRect(0, pz(0), W, H - pz(0))
    for (const [x, w, col] of [[0.44, 0.18, '#2f5fa8'], [0.48, 0.18, '#c8641e'], [0.63, 0.16, '#555b63']] as const) {
      ctx.fillStyle = col
      ctx.fillRect(px(x - w / 2), pz(0.05), w * 330, pz(0) - pz(0.05))
    }
    ctx.strokeStyle = '#e9ecef'
    ctx.lineWidth = 7
    ctx.lineCap = 'round'
    const links = forward(f.qpos.slice(0, 7)).links.map((m) => position(m))
    ctx.beginPath()
    ctx.moveTo(px(0), pz(0))
    for (const p of links) ctx.lineTo(px(p[0]), pz(p[2]))
    ctx.lineTo(px(f.ee[0]), pz(f.ee[2]))
    ctx.stroke()
    for (const o of f.objects) {
      ctx.fillStyle = o.name === 'bracket' ? '#d5dae0' : '#9aa1aa'
      ctx.fillRect(px(o.pos[0]) - 5, pz(o.pos[2]) - 4, 10, 6)
    }
  } else {
    // looking down from the hand: objects drawn relative to the TCP
    const s = 900
    ctx.fillStyle = '#3a4048'
    ctx.fillRect(0, 0, W, H)
    for (const o of f.objects) {
      const dx = (o.pos[1] - f.ee[1]) * s
      const dy = (o.pos[0] - f.ee[0]) * s
      const r = Math.max(4, 16 - (f.ee[2] - o.pos[2]) * 40)
      ctx.fillStyle = o.name === 'bracket' ? '#d5dae0' : '#9aa1aa'
      ctx.fillRect(W / 2 - dx - r, H / 2 - dy - r / 2, r * 2, r)
    }
    ctx.fillStyle = '#c9cdd2'
    const open = f.gripper * 900
    ctx.fillRect(W / 2 - open - 14, H - 50, 12, 50)
    ctx.fillRect(W / 2 + open + 2, H - 50, 12, 50)
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillRect(0, 0, W, 16)
  ctx.fillStyle = '#c8ccd1'
  ctx.font = '10px monospace'
  ctx.fillText(`${name} · t=${f.t.toFixed(1)}s`, 6, 11)
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.7 })
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
  return btoa(bin)
}
