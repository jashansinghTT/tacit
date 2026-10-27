// 2. "Their hands know things." The cold open freezes; both of her hands light up as the skeletons
// Tacit tracked on exactly those hands, then the left one lifts into 3D (its MediaPipe world
// landmarks, playing her real motion in slow motion) while the type lands. On the riser the hand
// dissolves down to its index finger, whose four joints become the Tacit mark.
// Technique: light draw-on (bone by bone, joints popping), 2D-to-3D lift, orbit.
import { R } from '../main.js'
import { footage } from '../lib/footage.js'
import { BONES, DEPTH, drawHand, handAt, project, rot } from '../lib/hand.js'
import { chainAt, drawMark } from '../lib/logo.js'
import { line, rise } from '../lib/type.js'
import { clamp, inCubic, inOutCubic, inOutQuint, inQuint, mix, noise1, outCubic, outExpo, prog, rng } from '../lib/ease.js'
import { FREEZE } from './coldopen.js'

export const MARK_K = 20 // px per logo unit in the title lockup (a 480 px mark)
export const SILENCE_K = 25 // the chain alone, larger, in the silence before the drop
export const SILENCE_GROW = 1.07 // it creeps in through the silence; the title starts from here
export const SNAP = 21.3 // the riser's peak in take 11 (RMS -15 dB), then near-silence to the drop
const INDEX = [5, 6, 7, 8]
const INDEX_BONES = [5, 6, 7]
const FINGER_OF = (c) => (c <= 4 ? 0 : c <= 8 ? 1 : c <= 12 ? 2 : c <= 16 ? 3 : 4)

export default function hands(T) {
  const s = { id: 'hands', z: 2 }
  let tracks, foot, fx, text
  const rand = rng(7)
  const fadeAt = BONES.map(() => rand())
  s.load = async () => {
    tracks = await R.json('/data/assets/tracks_vase.json')
  }
  s.build = (root) => {
    foot = footage(root, { dir: '/data/plates/vase60', fps: 60, count: 312 })
    fx = R.canvas(root)
    const box = R.el('div', 'abs', root)
    box.style.cssText = 'left:150px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:0'
    text = [line(box, ['Their', 'hands'], { size: 150 }), line(box, [{ t: 'know', serif: true, grad: true }, 'things.'], { size: 150 })]
  }

  s.render = (t) => {
    const [b3, b4, b5, b6, b7, b8, b9] = [3, 4, 5, 6, 7, 8, 9].map((k) => T.bar(k))
    const g = fx.g
    fx.clear()

    // Frozen footage, dimming out under the skeletons.
    foot.set(FREEZE)
    foot.camera(720, 575, 2.25)
    const flash = Math.exp(-Math.max(0, t - b3) * 6) * (t >= b3 ? 0.22 : 0)
    // The freeze dims and defocuses into a plate behind the 3D hand (depth), then leaves on the riser.
    const dim = 1 - prog(t, b3 + 0.2, b4 + 0.6 - b3, inOutCubic)
    const plateK = 1 - prog(t, b7 + 0.4, 1.2, inCubic)
    foot.grade({ brightness: (0.5 * dim + 0.32 * (1 - dim)) * plateK + flash, saturate: 0.55 * dim + 0.35 * (1 - dim), contrast: 1.1 })
    foot.box.style.filter += ` blur(${(1 - dim) * 34}px)`
    foot.box.style.opacity = plateK > 0.001 ? '1' : '0'

    // 2D: both hands where they were at the freeze, mapped through the same camera.
    const L2 = handAt(tracks, 'left', FREEZE).lm2d.map(([x, y]) => foot.toStage(x, y))
    const Rh = handAt(tracks, 'right', FREEZE)
    const R2 = Rh ? Rh.lm2d.map(([x, y]) => foot.toStage(x, y)) : null
    const drawOn = (i) => {
      const c = BONES[i][1]
      return prog(t, b3 + 0.04 + DEPTH[c] * 0.11 + FINGER_OF(c) * 0.035, 0.34, outCubic)
    }

    // 3D: the left hand's world landmarks, her real motion from 22.5 s (the hand opening and
    // reaching, the clearest pose in the clip) at 0.3x speed.
    const ft3 = 22.5 + Math.max(0, t - b4) * 0.3
    const W = handAt(tracks, 'left', ft3).world
    const c0 = W.reduce((a, p) => a.map((v, k) => v + p[k] / 21), [0, 0, 0])
    const spin = inOutCubic(prog(t, b7, b8 + 0.4 - b7)) * Math.PI * 2
    const yaw = 0.8 + 0.3 * Math.sin(0.33 * Math.max(0, t - b4)) + spin
    const pitch = -0.18 + 0.1 * noise1(t * 0.3, 3)
    const toCentre = inOutCubic(prog(t, b7 + 0.2, b8 - b7))
    const view = { cx: mix(1290, 960, toCentre), cy: mix(548, 540, toCentre), f: 2900, dist: mix(0.6, 0.52, toCentre) }
    const P3 = W.map((p) => project(rot([p[0] - c0[0], p[1] - c0[1], p[2] - c0[2]], yaw, pitch), view))
    // Nearer joints draw thicker and brighter (only once lifted into 3D).
    const depthScale = (j) => mix(1, clamp((view.dist / P3[j][2]) ** 3, 0.45, 1.8), lift)

    const lift = prog(t, b4, 1.4, inOutQuint)
    const P = L2.map((p, j) => [mix(p[0], P3[j][0], lift), mix(p[1], P3[j][1], lift)])

    // Dissolve to the index finger on the riser.
    const keep = (i) => INDEX_BONES.includes(i)
    // The riser builds: the hand stays big and burns brighter, and only in the last moments before
    // the morph does it shed every bone but the index finger.
    const boneAlpha = (i) => (keep(i) ? 1 : 1 - prog(t, b8 - 0.75 + fadeAt[i] * 0.45, 0.35, inCubic))
    const jointAlpha = (j) => (INDEX.includes(j) ? 1 : 1 - prog(t, b8 - 0.7 + fadeAt[j % 21] * 0.45, 0.3, inCubic))
    const burn = prog(t, b7, b8 - b7, inCubic)
    // Into the mark: accelerating into the swell's peak, landing on it.
    const toMark = prog(t, b8 + 0.1, SNAP - (b8 + 0.1), inCubic)
    const burst = t >= SNAP ? Math.exp(-(t - SNAP) * 5) : 0
    const width = mix(3.4, 4.2, lift)

    if (t < SNAP + 0.05) {
      drawHand(g, P, { draw: drawOn, boneAlpha, jointAlpha, depthScale, alpha: 1 - toMark, width: width * (1 + 0.35 * burn), jointR: mix(5.5, 8, lift) * (1 + 0.3 * burn), glow: 1.25 + 1.6 * burn })
    }
    if (R2) {
      const ra = 1 - prog(t, b4, 0.7, outCubic)
      if (ra > 0) drawHand(g, R2, { color: '#a78bfa', draw: drawOn, alpha: ra, width })
    }

    // The index chain becomes the mark, centred, and holds through the silence before the drop.
    if (t >= b8) {
      const grow = mix(1, SILENCE_GROW, prog(t, SNAP, b9 - SNAP, (x) => x)) * (1 + 0.06 * burst)
      const target = chainAt(960, 540, SILENCE_K * grow)
      const breathe = 1 + 0.03 * Math.sin((t - b8) * 3.2)
      const pts = INDEX.map((j, i) => [mix(P[j][0], target[i][0], toMark), mix(P[j][1], target[i][1], toMark)])
      drawMark(g, 960, 540, SILENCE_K * grow, { pts, box: 0, ring: burst * 1.4, alpha: Math.min(1, toMark * 1.3), glow: breathe * mix(2.2, 1.2, toMark) + 3 * burst, width: mix(0.5, 1, toMark) })
    }

    // Type.
    const beat = T.beat
    rise(text[0].words[0], prog(t, b5, 0.7, outExpo))
    rise(text[0].words[1], prog(t, b5 + beat, 0.7, outExpo))
    rise(text[1].words[0], prog(t, b6, 0.7, outExpo))
    rise(text[1].words[1], prog(t, b6 + beat, 0.7, outExpo))
    const out = prog(t, b7 - 0.36, 0.36, inQuint)
    for (const l of text) {
      l.el.style.opacity = String(1 - out)
      l.el.style.transform = `translateY(${-out * 30}px)`
      l.el.style.filter = out > 0.001 ? `blur(${out * 8}px)` : 'none'
    }
  }
  return s
}
