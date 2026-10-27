// 5. Check. A second pass of the beam turns the frame into points (each carries its pixel's colour);
// they fly into VGGT's 3D rebuild of the same clip, which turns to show one rigid scene. Then a split
// screen: the real recording's cloud against the AI-made clip's warped one, with the verdicts slammed
// on like stamps. Scores from the sample verification files (CLAIMS.md).
// Technique: particle dissolve into 3D, then split screen with spring stamps and an RGB-split glitch.
import { R } from '../main.js'
import { loadCloud, projector, raster } from '../lib/cloud.js'
import { line, rise } from '../lib/type.js'
import { clamp, inCubic, inOutCubic, inOutSine, inQuint, mix, noise1, outCubic, outExpo, prog, rng, spring } from '../lib/ease.js'
import { watchCam, watchFt } from './watch.js'

export default function check(T) {
  const s = { id: 'check', z: 5, pre: 0.6 }
  const b13 = T.bar(13)
  let real, fake, rs, rf, word, stamps, labels, divider, beamEl, start, startCol, frameImg, delay, fill
  const tBeam = b13 - 0.55
  s.blur = [[T.bar(14) + 2 * T.beat - 0.05, T.bar(14) + 2 * T.beat + 0.12, 4], [T.bar(15) - 0.05, T.bar(15) + 0.12, 4],
    [T.bar(16) - 0.4, T.bar(16), 6]]

  s.load = async () => {
    real = await loadCloud('/data/assets/smp_vase.pointcloud.bin')
    fake = await loadCloud('/data/assets/smp_fake.pointcloud.bin')
    // The frame the beam freezes, read back to colour the particles.
    const ft = watchFt(T, tBeam)
    const img = new Image()
    img.src = `/data/plates/vase/f_${String(Math.round(ft * 30)).padStart(5, '0')}.jpg`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = 2560
    c.height = 1440
    c.getContext('2d').drawImage(img, 0, 0)
    frameImg = c.getContext('2d').getImageData(0, 0, 2560, 1440).data
  }

  const viewReal = (t) => {
    const u = prog(t, b13, T.bar(14) - b13 + 0.6, inOutCubic)
    const split = prog(t, T.bar(14), 0.9, inOutCubic)
    return {
      yaw: mix(0, -0.55, u) + 0.32 * Math.sin((t - T.bar(14)) * 0.7) * split,
      pitch: mix(0, 0.16, u),
      f: 1500, dist: 2.2, scale: mix(1.9, 1.45, split),
      cx: mix(960, 520, split), cy: mix(540, 560, split),
    }
  }

  s.build = (root) => {
    rs = raster(root)
    rf = raster(root)
    rf.c.style.clipPath = 'inset(0 0 0 961px)'
    // Start state: every real-cloud point placed where it falls in the frame-shaped box, coloured
    // from the frozen frame under it.
    const P0 = projector({ ...viewReal(b13 - 1), yaw: 0, pitch: 0 })
    const n = real.n
    const uv = new Float32Array(n * 2)
    let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity
    for (let i = 0; i < n; i++) {
      const p = P0(real.pos[i * 3], real.pos[i * 3 + 1], real.pos[i * 3 + 2])
      uv[i * 2] = p[0]
      uv[i * 2 + 1] = p[1]
    }
    const us = Array.from({ length: n }, (_, i) => uv[i * 2]).sort((a, b) => a - b)
    const vs = Array.from({ length: n }, (_, i) => uv[i * 2 + 1]).sort((a, b) => a - b)
    umin = us[Math.floor(n * 0.01)]; umax = us[Math.floor(n * 0.99)]
    vmin = vs[Math.floor(n * 0.01)]; vmax = vs[Math.floor(n * 0.99)]
    start = new Float32Array(n * 2)
    startCol = new Uint8ClampedArray(n * 3)
    delay = new Float32Array(n)
    const [cx, cy, zoom] = watchCam(T, tBeam)
    const rnd = rng(11)
    for (let i = 0; i < n; i++) {
      const x = clamp((uv[i * 2] - umin) / (umax - umin)) * R.W
      const y = clamp((uv[i * 2 + 1] - vmin) / (vmax - vmin)) * R.H
      start[i * 2] = x
      start[i * 2 + 1] = y
      const sx = cx + (x - R.W / 2) / (1.5 * zoom)
      const sy = cy + (y - R.H / 2) / (1.5 * zoom)
      const px = Math.min(2559, Math.max(0, Math.round(sx * 2)))
      const py = Math.min(1439, Math.max(0, Math.round(sy * 2)))
      const o = (py * 2560 + px) * 4
      startCol[i * 3] = frameImg[o]
      startCol[i * 3 + 1] = frameImg[o + 1]
      startCol[i * 3 + 2] = frameImg[o + 2]
      delay[i] = 0.45 * (y / R.H) + 0.25 * rnd()
    }
    // Filler points on a jittered grid so the frame of points has no holes; they fall away as the
    // rebuild assembles (they have no 3D point to go to).
    const cols = 300, rows = 169
    fill = { n: cols * rows, xy: new Float32Array(cols * rows * 2), col: new Uint8ClampedArray(cols * rows * 3), d: new Float32Array(cols * rows) }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i
      const x = ((i + rnd()) / cols) * R.W, y = ((j + rnd()) / rows) * R.H
      fill.xy[k * 2] = x; fill.xy[k * 2 + 1] = y
      const sx = cx + (x - R.W / 2) / (1.5 * zoom), sy = cy + (y - R.H / 2) / (1.5 * zoom)
      const o = (Math.min(1439, Math.max(0, Math.round(sy * 2))) * 2560 + Math.min(2559, Math.max(0, Math.round(sx * 2)))) * 4
      fill.col[k * 3] = frameImg[o]; fill.col[k * 3 + 1] = frameImg[o + 1]; fill.col[k * 3 + 2] = frameImg[o + 2]
      fill.d[k] = 0.45 * (y / R.H) + 0.25 * rnd()
    }
    frameImg = null

    beamEl = R.el('div', 'abs', root)
    beamEl.style.cssText = 'left:0;right:0;height:2px;background:#bff4ff;box-shadow:0 0 18px 4px rgba(60,215,255,0.85),0 0 90px 30px rgba(60,215,255,0.25)'
    divider = R.el('div', 'abs', root)
    divider.style.cssText = 'top:0;width:2px;height:1080px;background:linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,0.35) 20%,rgba(255,255,255,0.35) 80%,rgba(255,255,255,0));transform-origin:50% 0'
    labels = ['Real camera', 'AI-made clip'].map((txt, i) => {
      const el = R.el('div', 'mono abs', root, txt)
      el.style.cssText += `;font-size:26px;color:#c9ced5;top:116px;${i ? 'left:1340px' : 'left:400px'}`
      return el
    })
    stamps = [['Verified', '0.90', '#3ddc97', -5], ['Suspect', '0.24', '#ff5d5d', 4]].map(([w, v, c, rot], i) => {
      const el = R.el('div', 'abs', root, `<span>${w}</span><span style="opacity:0.85">${v}</span>`)
      el.style.cssText = `top:760px;${i ? 'left:1180px' : 'left:240px'};display:flex;gap:28px;align-items:baseline;padding:20px 34px 18px;` +
        `border:6px solid ${c};border-radius:18px;color:${c};font-family:'Geist Mono',monospace;font-weight:700;font-size:70px;` +
        `letter-spacing:0.04em;text-transform:uppercase;background:rgba(4,5,6,0.55);box-shadow:0 0 60px -10px ${c};transform-origin:50% 50%`
      el.dataset.rot = rot
      return el
    })
    const wbox = R.el('div', 'abs', root)
    wbox.style.cssText = 'left:104px;bottom:70px'
    word = line(wbox, ['Check.'], { size: 290 })
  }

  function drawCloud(target, cl, view, t, { morph = null, glitch = 0, size = 3, wobble = 0 } = {}) {
    const P = projector(view)
    const D = R.DPR
    for (let i = 0; i < cl.n; i++) {
      let x = cl.pos[i * 3], y = cl.pos[i * 3 + 1], z = cl.pos[i * 3 + 2]
      if (wobble) {
        // The AI-made clip's geometry does not hold still between views: let it breathe.
        const w = wobble * noise1(x * 6 + t * 1.3, 5) * 0.03
        z += w
        y += w * 0.4
      }
      const p = P(x, y, z)
      if (!p) continue
      let sx = p[0], sy = p[1], r = cl.col[i * 3], g = cl.col[i * 3 + 1], b = cl.col[i * 3 + 2], sz = size
      if (morph) {
        const e = morph(i)
        if (e < 1) {
          const lift = Math.sin(e * Math.PI) * 60 * (0.5 + delay[i])
          sx = mix(start[i * 2], sx, e)
          sy = mix(start[i * 2 + 1], sy, e) - lift
          r = mix(startCol[i * 3], r, e); g = mix(startCol[i * 3 + 1], g, e); b = mix(startCol[i * 3 + 2], b, e)
          sz = mix(5, size, e)
        }
      }
      if (glitch > 0.03) {
        const dx = 22 * glitch * D
        target.splatCh(sx * D + dx, sy * D, 0, r, sz)
        target.splatCh(sx * D, sy * D, 1, g, sz)
        target.splatCh(sx * D - dx, sy * D, 2, b, sz)
      } else target.splat(sx * D, sy * D, p[2], r, g, b, sz)
    }
    if (glitch > 0.03) applyGlitch(target, glitch, t)
  }

  function applyGlitch(target, k, t) {
    // A few displaced slices, deterministic in t (the colour split happens in drawCloud).
    const { px, W, H } = target
    const slices = Math.round(6 * k)
    if (!slices) return
    const rnd = rng(Math.floor(t * 30) + 101)
    const xmin = Math.floor(W * 0.5)
    for (let j = 0; j < slices; j++) {
      const y0 = Math.floor(rnd() * H), h = Math.floor(8 + rnd() * 50) * 2, dx = Math.round((rnd() - 0.5) * 120 * k) * 2
      for (let y = y0; y < Math.min(H, y0 + h); y++) {
        const row = px.subarray(y * W * 4 + xmin * 4, (y + 1) * W * 4)
        row.copyWithin(Math.max(0, dx) * 4, Math.max(0, -dx) * 4)
      }
    }
  }

  s.render = (t) => {
    const b14 = T.bar(14), b15 = T.bar(15), b16 = T.bar(16), beat = T.beat
    // Beam: everything above it is this section; below it, Watch still plays.
    const yb = mix(-30, 1110, prog(t, tBeam, 0.55, inOutCubic))
    s.layer.style.clipPath = t < b13 + 0.05 ? `inset(0 0 ${Math.max(0, 1080 - yb)}px 0)` : 'none'
    s.layer.style.background = '#040506'
    beamEl.style.top = `${yb}px`
    beamEl.style.opacity = t < b13 + 0.05 ? '1' : '0'

    rs.clear()
    const morph = (i) => prog(t, b13 + delay[i] * 1.2, 1.1, inOutCubic)
    const split = prog(t, b14, 0.9, inOutCubic)
    const exit = prog(t, b16 - 0.4, 0.4, inQuint)
    if (t < b13 + 2) {
      const D = R.DPR
      for (let k = 0; k < fill.n; k++) {
        const e = prog(t, b13 + fill.d[k] * 1.2, 0.7, inCubic)
        if (e >= 1) continue
        const x = fill.xy[k * 2], y = fill.xy[k * 2 + 1] + e * e * 220
        const a = 1 - e
        rs.splat(x * D, y * D, 9 + e, fill.col[k * 3] * a, fill.col[k * 3 + 1] * a, fill.col[k * 3 + 2] * a, 5)
      }
    }
    drawCloud(rs, real, viewReal(t), t, { morph: t < b13 + 2.6 ? morph : null, size: mix(3.5, 4, split) })
    if (t >= b14) {
      const k = prog(t, b14, 0.9, outExpo)
      const glitchAt = [b14, b14 + 3 * beat, b15, b15 + 2 * beat + 0.2]
      let glitch = 0
      for (const g0 of glitchAt) glitch = Math.max(glitch, t >= g0 ? Math.exp(-(t - g0) * 9) : 0)
      rf.clear()
      drawCloud(rf, fake, { yaw: 0.45 + 0.4 * Math.sin((t - b14) * 0.8), pitch: 0.14, f: 1500, dist: 2.2, scale: 1.2,
        cx: mix(2300, 1430, k), cy: 560 }, t, { size: 4, wobble: 1, glitch: glitch * 0.9 })
      rf.flush()
    }
    rf.c.style.display = t >= b14 ? 'block' : 'none'
    rs.c.style.clipPath = split > 0 ? `inset(0 ${mix(0, 959, split)}px 0 0)` : 'none'
    rs.flush()
    for (const c of [rs.c, rf.c]) {
      c.style.opacity = String(1 - exit)
      c.style.transform = `scale(${1 - 0.06 * exit})`
    }

    divider.style.left = `${mix(959, 1960, inCubic(exit))}px`
    divider.style.transform = `scaleY(${prog(t, b14 + 0.15, 0.6, outExpo)})`
    labels.forEach((el, i) => {
      const k = prog(t, b14 + 0.35 + i * 0.12, 0.6, outExpo)
      el.style.opacity = String(k * (1 - exit))
      el.style.transform = `translateY(${(1 - k) * 16}px)`
    })
    const sAt = [b14 + 2 * beat, b15]
    stamps.forEach((el, i) => {
      const k = spring(t, sAt[i], { zeta: 0.5, omega: 16 })
      const a = t >= sAt[i] ? Math.min(1, (t - sAt[i]) / 0.06) : 0
      const jitter = i === 1 && t > sAt[i] ? Math.exp(-(t - sAt[i]) * 6) * 14 * noise1(t * 40, 9) : 0
      el.style.opacity = String(a * (1 - exit))
      el.style.transform = `translateX(${jitter}px) rotate(${el.dataset.rot}deg) scale(${mix(2.4, 1, k)})`
    })

    rise(word.words[0], prog(t, b13 + 2 * beat, 0.65, outExpo))
    const wout = prog(t, b14 - 0.35, 0.35, inQuint)
    word.el.style.opacity = String(1 - wout)
    word.el.style.transform = `translateY(${wout * 40}px)`
  }
  return s
}
