// 6. Teach. The lesson's 3D twin, rendered from the skill's own data (its VGGT cloud and the twin's
// 3D hands, GET /api/skills/sk_c28f1461/pointcloud and /twin, one processing run) rather than a screen
// capture, turning slowly; the nine languages the lesson can be taught in flash over it on the
// half-beat, as the Lesson page names them. Ends by pushing into the twin's hand.
// Technique: a beat-cut word flash over a slow orbit; zoom-through into the next section.
import { R } from '../main.js'
import { loadCloud, projector, raster } from '../lib/cloud.js'
import { drawHand } from '../lib/hand.js'
import { line, rise } from '../lib/type.js'
import { clamp, inCubic, inOutSine, inQuint, mix, outExpo, prog } from '../lib/ease.js'

// The Lesson page's language selector, in its order (GET /api/learn/lessons/... lists the same nine).
const LANGS = [
  ['English', 'latin'], ['Español', 'latin'], ['Français', 'latin'], ['Deutsch', 'latin'], ['Português', 'latin'],
  ['हिन्दी', 'deva'], ['中文', 'cjk'], ['日本語', 'cjk'], ['한국어', 'cjk'],
]
const FONT = {
  latin: "'Instrument Serif', serif",
  deva: "'Noto Serif Devanagari', serif",
  cjk: "'Noto Serif CJK JP', 'Noto Serif CJK KR', serif",
}
const AIM = [-0.3, 0.22, -0.28] // the look-at point in the twin's frame: between her hands and the wall
const HAND_FT0 = 21.5 // twin time at the start of the section (she draws a stem and sets it in the vase)

export default function teach(T) {
  const s = { id: 'teach', z: 6 }
  let cloud, twin, rs, hx, word, sub, names, glow
  const b16 = T.bar(16), b18 = T.bar(18)
  const beat = T.beat
  const PUSH = 0.5
  s.blur = [[b18 - PUSH, b18, 6]]
  s.load = async () => {
    cloud = await loadCloud('/data/assets/pointcloud_vase_now.bin', { recentre: false })
    twin = await R.json('/data/assets/twin_vase_now.json')
  }
  s.build = (root) => {
    rs = raster(root)
    hx = R.canvas(root)
    glow = R.el('div', 'abs', root)
    glow.style.cssText = 'inset:0;background:radial-gradient(55% 40% at 50% 42%, rgba(4,5,6,0.5), rgba(4,5,6,0.15) 65%, rgba(4,5,6,0.7) 100%)'
    names = LANGS.map(([n, script]) => {
      const el = R.el('div', 'abs', root, n)
      el.style.cssText = `left:0;right:0;top:360px;text-align:center;font-family:${FONT[script]};font-style:${script === 'latin' ? 'italic' : 'normal'};` +
        `font-size:${script === 'latin' ? 230 : 190}px;line-height:1;color:#eceef1;white-space:nowrap;letter-spacing:-0.01em;` +
        'text-shadow:0 0 40px rgba(4,5,6,0.9),0 10px 70px rgba(0,0,0,0.8)'
      return el
    })
    const wbox = R.el('div', 'abs', root)
    wbox.style.cssText = 'left:104px;bottom:70px;display:flex;flex-direction:column;gap:6px'
    word = line(wbox, ['Teach.'], { size: 290, style: 'text-shadow:0 10px 60px rgba(0,0,0,0.6)' })
    sub = line(wbox, [{ t: 'in nine languages.', serif: true, grad: true }], { size: 92, style: 'margin-left:10px' })
  }

  /** The twin's right hand (the one placing the stem) at twin time ft, interpolated. */
  function handAt(ft) {
    const fr = twin.frames
    let i = 0
    while (i < fr.length - 2 && fr[i + 1].t <= ft) i++
    const a = fr[i].hands?.right, b = fr[i + 1]?.hands?.right
    if (!a && !b) return null
    if (!a || !b) return a || b
    const u = clamp((ft - fr[i].t) / (fr[i + 1].t - fr[i].t))
    return a.map((p, j) => p.map((v, k) => mix(v, b[j][k], u)))
  }

  s.render = (t) => {
    const lt = t - b16
    const drift = prog(t, b16, b18 - b16, inOutSine)
    const P = projector({ yaw: mix(-0.42, 0.18, drift), pitch: 0.12, dist: 1.25, f: 2100, cx: 1000, cy: 470, scale: 1 })
    const proj = (x, y, z) => P(x - AIM[0], y - AIM[1], z - AIM[2])
    // Zoom-through at the end: into her hand, carrying it to the centre where Do picks it up.
    const push = prog(t, b18 - PUSH, PUSH)
    const e = inCubic(push)
    const Z = mix(1, 5, e)
    const H = handAt(HAND_FT0 + lt)
    const wp = H ? proj(...H[9]) : [960, 540]
    const zoom = (sx, sy) => [960 + (sx - wp[0]) * Z + (wp[0] - 960) * (1 - e), 540 + (sy - wp[1]) * Z + (wp[1] - 540) * (1 - e)]

    rs.clear()
    const D = R.DPR
    const fade = prog(t, b16, 0.4)
    for (let i = 0; i < cloud.n; i++) {
      const p = proj(cloud.pos[i * 3], cloud.pos[i * 3 + 1], cloud.pos[i * 3 + 2])
      if (!p) continue
      const dn = clamp((p[2] - 1.25 + 0.4) / 0.8)
      const shade = mix(1.6, 0.75, dn) * fade
      const [sx, sy] = zoom(p[0], p[1])
      rs.splat(sx * D, sy * D, p[2], Math.min(255, cloud.col[i * 3] * shade), Math.min(255, cloud.col[i * 3 + 1] * shade),
        Math.min(255, cloud.col[i * 3 + 2] * shade), mix(5.4, 3.6, dn) * Math.sqrt(Z))
    }
    rs.flush()

    hx.clear()
    if (H) {
      const pts = H.map((q) => { const p = proj(...q); const z = zoom(p[0], p[1]); return [z[0], z[1], p[2]] })
      const near = Math.min(...pts.map((p) => p[2]))
      drawHand(hx.g, pts, { color: '#a78bfa', width: 3.2 * Math.sqrt(Z), jointR: 5.5 * Math.sqrt(Z), glow: 1.3, alpha: fade,
        depthScale: (j) => clamp(near / pts[j][2], 0.7, 1) ** 2 })
    }

    // Language names, one per half-beat, each a hard cut with a quick settle.
    const t0 = b16 + beat
    names.forEach((el, i) => {
      const a = t0 + i * (beat / 2), b = a + beat / 2
      const on = t >= a && t < b
      el.style.display = on ? 'block' : 'none'
      if (on) {
        const q = prog(t, a, 0.18, outExpo)
        el.style.transform = `scale(${mix(1.08, 1, q)})`
        el.style.opacity = String(mix(0.4, 1, q))
      }
    })
    glow.style.opacity = String(1 - push)
    rise(word.words[0], prog(t, b16 + 0.05, 0.65, outExpo))
    rise(sub.words[0], prog(t, t0 + 9 * (beat / 2), 0.65, outExpo))
    const out = prog(t, b18 - 0.5, 0.35, inQuint)
    for (const l of [word, sub]) {
      l.el.style.opacity = String(1 - out)
      l.el.style.transform = `translateY(${out * 40}px)`
    }
  }
  return s
}
