// 4. Watch. The real clip with what Tacit sees in it, drawn from the skill's own tracks: both hand
// skeletons (MediaPipe + HaMeR), the gaze ray (Gaze-LLE) and the parts (RF-DETR, with its scores).
// Technique: scanline reveal (a beam sweeps the frame and lays the overlays on behind it), a slow
// push-in, latency chips springing in on the beats.
import { R } from '../main.js'
import { footage } from '../lib/footage.js'
import { BONES, drawHand, followHands, gazeAt, objectsAt } from '../lib/hand.js'
import { line, rise } from '../lib/type.js'
import { clamp, inOutCubic, inOutSine, inQuint, mix, outExpo, prog, spring } from '../lib/ease.js'

export const WATCH_FT0 = 21.5 // she draws a stem from the bundle and sets it in the vase, eyes on the vase
export const watchFt = (T, t) => WATCH_FT0 + (t - T.bar(10))
export function watchCam(T, t) {
  const u = inOutSine(clamp((t - T.bar(10)) / (T.bar(13) - T.bar(10))))
  return [mix(540, 505, u), mix(380, 400, u), mix(1.32, 1.6, u)]
}
// Co-hosted wall-clock p50 on chip 0 (CLAIMS.md: .orchestration/evidence/vision/latency_one_at_a_time.jsonl).
const CHIPS = [
  { k: 'hand', model: 'HaMeR', v: '16 ms' },
  { k: 'gaze', model: 'Gaze-LLE', v: '10 ms' },
  { k: 'part', model: 'RF-DETR', v: '12 ms' },
]

export default function watch(T) {
  const s = { id: 'watch', z: 4, post: 0.1 }
  let tracks, follow, foot, fx, word, chips, beamEl, shade, chipX = []
  s.load = async () => {
    tracks = await R.json('/data/assets/tracks_vase.json')
    follow = followHands(tracks, WATCH_FT0, watchFt(T, T.bar(13)))
  }
  s.build = (root) => {
    foot = footage(root, { dir: '/data/plates/vase', fps: 30, count: 1335 })
    fx = R.canvas(root)
    beamEl = R.el('div', 'abs', root)
    beamEl.style.cssText = 'left:0;right:0;height:2px;background:#bff4ff;box-shadow:0 0 18px 4px rgba(60,215,255,0.85),0 0 90px 30px rgba(60,215,255,0.25)'
    shade = R.el('div', 'abs', root)
    shade.style.cssText = 'left:0;right:0;bottom:0;height:560px;background:linear-gradient(0deg, rgba(4,5,6,0.8), rgba(4,5,6,0.35) 55%, rgba(4,5,6,0))'
    const wbox = R.el('div', 'abs', root)
    wbox.style.cssText = 'left:104px;bottom:70px'
    word = line(wbox, ['Watch.'], { size: 290, style: 'text-shadow:0 10px 60px rgba(0,0,0,0.5)' })
    chips = CHIPS.map((c) => {
      const el = R.el('div', 'chip abs', root, `<span class="dot"></span>${c.model}<span class="v">${c.v}</span>`)
      el.style.fontSize = '32px'
      el.style.padding = '16px 28px 16px 22px'
      el.style.transformOrigin = '0% 50%'
      return el
    })
    // Chips sit in a row where the word was; measure them once.
    root.style.display = 'block'
    let x = 108
    chipX = chips.map((el) => { const at = x; x += el.getBoundingClientRect().width + 22; return at })
    root.style.display = ''
  }

  s.render = (t) => {
    const [b10, b11, b12, b13] = [10, 11, 12, 13].map((k) => T.bar(k))
    const beat = T.beat
    const ft = watchFt(T, t)
    const at = [b11, b11 + 2 * beat, b12]
    const pulse = (i) => (t >= at[i] ? Math.exp(-(t - at[i]) * 3.5) : 0)
    foot.set(ft, { blend: false })
    foot.camera(...watchCam(T, t))
    foot.grade({ brightness: 0.86, saturate: 0.9, contrast: 1.12 })

    // The beam sweeps down once; the picture and overlays exist only above it.
    const yb = mix(-30, 1110, prog(t, b10 + 0.2, 1.15, inOutCubic))
    foot.box.style.clipPath = `inset(0 0 ${Math.max(0, 1080 - yb)}px 0)`
    beamEl.style.top = `${yb}px`
    beamEl.style.opacity = yb > -20 && yb < 1100 ? '1' : '0'

    fx.clear()
    const g = fx.g
    g.save()
    g.beginPath(); g.rect(0, 0, R.W, Math.max(0, yb)); g.clip()
    const z = foot.cam.zoom
    const behind = (y) => clamp((yb - y) / 90)

    // Parts: RF-DETR boxes for the vases, corner brackets springing in.
    for (const o of objectsAt(tracks, ft)) {
      if (o.label !== 'vase') continue
      const [x1, y1] = foot.toStage(o.box[0], o.box[1])
      const [x2, y2] = foot.toStage(o.box[2], o.box[3])
      const k = spring(t, b10 + 0.2 + 1.15 * clamp(y1 / 1080), { zeta: 0.6, omega: 14 }) * behind(y1)
      if (k <= 0) continue
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2
      const w = ((x2 - x1) / 2) * (0.8 + 0.2 * k), h = ((y2 - y1) / 2) * (0.8 + 0.2 * k)
      const L = 22 * z
      g.strokeStyle = '#7cf5c4'
      g.lineWidth = 2.5 + 3 * pulse(2)
      g.globalAlpha = Math.min(1, k)
      g.beginPath()
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const px = cx + sx * w, py = cy + sy * h
        g.moveTo(px - sx * L, py); g.lineTo(px, py); g.lineTo(px, py - sy * L)
      }
      g.stroke()
      g.fillStyle = 'rgba(4,5,6,0.78)'
      g.font = '500 17px "Geist Mono"'
      const label = `vase ${Math.round(o.score * 100)}`
      const tw = g.measureText(label).width
      g.fillRect(cx - w, cy - h - 34, tw + 18, 26)
      g.fillStyle = '#7cf5c4'
      g.fillText(label, cx - w + 9, cy - h - 15)
      g.globalAlpha = 1
    }

    // Gaze: a ray from the head to where she looks, drawn on after the beam.
    const gz = gazeAt(tracks, ft)
    let gazePt = null
    if (gz) {
      const [hx1, hy1] = foot.toStage(gz.head[0], gz.head[1])
      const [hx2, hy2] = foot.toStage(gz.head[2], gz.head[3])
      const head = [(hx1 + hx2) / 2, hy1 + (hy2 - hy1) * 0.45]
      const tgt = foot.toStage(gz.x, gz.y)
      gazePt = tgt
      const d = prog(t, b10 + 1.25, 0.55, outExpo)
      if (d > 0) {
        const ex = mix(head[0], tgt[0], d), ey = mix(head[1], tgt[1], d)
        const grad = g.createLinearGradient(head[0], head[1], tgt[0], tgt[1])
        grad.addColorStop(0, 'rgba(255,200,87,0.15)')
        grad.addColorStop(1, 'rgba(255,200,87,1)')
        g.strokeStyle = grad
        g.lineCap = 'round'
        for (const [w, a] of [[14, 0.12], [3.2, 1]]) {
          g.globalAlpha = a
          g.lineWidth = w
          g.beginPath(); g.moveTo(head[0], head[1]); g.lineTo(ex, ey); g.stroke()
        }
        g.globalAlpha = 1
        const rk = spring(t, b10 + 1.7, { zeta: 0.55, omega: 13 })
        if (rk > 0) {
          g.strokeStyle = '#ffc857'
          g.lineWidth = 2.5
          g.beginPath(); g.arc(tgt[0], tgt[1], 16 * rk, 0, Math.PI * 2); g.stroke()
          g.fillStyle = '#ffc857'
          g.beginPath(); g.arc(tgt[0], tgt[1], 4.5 * Math.min(1, rk), 0, Math.PI * 2); g.fill()
          g.globalAlpha = 0.25 * Math.min(1, rk)
          g.beginPath(); g.arc(tgt[0], tgt[1], 34 * rk, 0, Math.PI * 2); g.fill()
          const pp = pulse(1)
          if (pp > 0.02) {
            g.globalAlpha = 0.8 * pp
            g.lineWidth = 3
            g.beginPath(); g.arc(tgt[0], tgt[1], 20 + 80 * (1 - pp), 0, Math.PI * 2); g.stroke()
          }
          g.globalAlpha = 1
        }
      }
    }

    // Hands: both skeletons, followed by continuity so each keeps its colour; joints lit as the
    // beam passes them.
    const hands = {}
    for (const [k, color] of [[0, '#3cd7ff'], [1, '#a78bfa']]) {
      const lm = follow.at(k, ft)
      const a = follow.alpha(k, ft)
      if (!lm || a <= 0.02) continue
      const P = lm.map(([x, y]) => foot.toStage(x, y))
      hands[k ? 'right' : 'left'] = P
      drawHand(g, P, { color, alpha: a, width: 2.9 * z * (1 + 0.5 * pulse(0)), jointR: 4.4 * z, glow: 1.35 + 2 * pulse(0), draw: (i) => behind(P[BONES[i][1]][1]) })
    }
    g.restore()

    // Type.
    rise(word.words[0], prog(t, b10, 0.65, outExpo))
    const wout = prog(t, b11 + beat - 0.35, 0.35, inQuint)
    word.el.style.opacity = String(1 - wout)
    word.el.style.transform = `translateY(${wout * 40}px)`

    // Chips on the beats, in a row where the word was; what each measures flares as it lands.
    const cy = 968
    chips.forEach((el, i) => {
      const k = spring(t, at[i], { zeta: 0.6, omega: 15 })
      const out = prog(t, b13 - 0.75, 0.35, inQuint)
      const a = Math.min(1, Math.max(0, k)) * (1 - out)
      el.style.left = `${chipX[i]}px`
      el.style.top = `${cy}px`
      el.style.opacity = String(a)
      el.style.transform = `translateY(-50%) translateX(${(1 - Math.min(1, k)) * -24}px)`
    })
    shade.style.opacity = String(Math.max(1 - wout, ...chips.map((c) => Number(c.style.opacity) || 0)) * prog(t, b10 + 0.3, 0.8))
  }
  return s
}
