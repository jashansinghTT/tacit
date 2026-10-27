// 9. The box. Four Blackhole chips light up one per beat with the models each one serves (from
// the Box page's /api/box snapshot); the counts climb with them. On the breakdown a single outline
// closes around all four: one box.
// Technique: beat strobe, one chip per beat, counters stepping with the light.
import { R } from '../main.js'
import { clamp, inQuint, mix, outCubic, outExpo, prog, spring } from '../lib/ease.js'

const TILE = 360, GAP = 48
const LEFT = (1920 - (4 * TILE + 3 * GAP)) / 2
const TOP = 360

export default function box(T) {
  const s = { id: 'box', z: 9 }
  let chips, tiles, nums, outline, boxLabel, flash
  const b23 = T.bar(23), b24 = T.bar(24), b25 = T.bar(25)
  const beat = T.beat
  s.load = async () => { chips = (await R.json('/data/assets/box.json')).chips }
  s.build = (root) => {
    root.style.background = 'radial-gradient(70% 60% at 50% 55%, #0b1013 0%, #040506 70%)'
    const dots = R.el('div', 'abs', root)
    dots.style.cssText = 'inset:0;opacity:0.5;background-image:radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1.4px);background-size:28px 28px'
    tiles = chips.map((c, i) => {
      const el = R.el('div', 'abs', root)
      el.style.cssText = `left:${LEFT + i * (TILE + GAP)}px;top:${TOP}px;width:${TILE}px;height:${TILE}px;border-radius:26px;` +
        'background:#0b0d10;box-shadow:inset 0 0 0 2px rgba(255,255,255,0.09)'
      const die = R.el('div', 'abs', el)
      die.style.cssText = 'left:34px;top:34px;right:34px;bottom:34px;border-radius:14px;' +
        'background-image:linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px);' +
        'background-size:24px 24px;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.08)'
      const head = R.el('div', 'mono abs', el, `chip ${c.id}`)
      head.style.cssText += ';left:52px;top:52px;font-size:22px;color:#6e7580'
      const names = c.models.map((m, j) => {
        const n = R.el('div', 'abs', el, m.name)
        n.style.cssText = `left:52px;top:${118 + j * 50}px;font-size:${c.models.length > 2 ? 33 : 40}px;font-weight:550;letter-spacing:-0.02em;color:#eceef1;white-space:nowrap`
        return n
      })
      return { el, die, head, names }
    })
    const ctr = R.el('div', 'abs', root)
    ctr.style.cssText = `left:${LEFT}px;top:96px;display:flex;gap:90px;align-items:flex-end`
    nums = [['0', 'models'], ['0', 'Tenstorrent chips'], ['1', 'box']].map(([v, l]) => {
      const g = R.el('div', '', ctr)
      g.style.cssText = 'display:flex;align-items:baseline;gap:22px'
      const n = R.el('div', 'huge', g, v)
      n.style.cssText += ';font-size:190px;font-variant-numeric:tabular-nums'
      const lab = R.el('div', 'mono', g, l)
      lab.style.cssText += ';font-size:28px;color:#a3a9b2'
      return { g, n }
    })
    outline = R.el('div', 'abs', root)
    outline.innerHTML = `<svg width="1920" height="1080" style="position:absolute;inset:0"><rect x="${LEFT - 36}" y="${TOP - 36}" width="${4 * TILE + 3 * GAP + 72}" height="${TILE + 72}" rx="44" fill="none" stroke="#3cd7ff" stroke-width="3" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg>`
    outline.style.cssText = 'inset:0'
    boxLabel = R.el('div', 'mono abs', root, 'one box · no cloud')
    boxLabel.style.cssText += `;left:${LEFT}px;top:${TOP + TILE + 70}px;font-size:28px;color:#3cd7ff`
    flash = R.el('div', 'abs', root)
    flash.style.cssText = 'inset:0;background:#dff8ff;opacity:0'
  }
  s.render = (t) => {
    let models = 0, lit = 0
    tiles.forEach((tile, i) => {
      const t0 = b23 + i * beat
      const k = spring(t, t0, { zeta: 0.55, omega: 18 })
      const on = t >= t0
      if (on) { models += chips[i].models.length; lit++ }
      const glow = on ? Math.exp(-(t - t0) * 3) : 0
      tile.el.style.boxShadow = on
        ? `inset 0 0 0 2px rgba(60,215,255,${0.55 + 0.45 * glow}), 0 0 ${60 + 80 * glow}px -10px rgba(60,215,255,${0.35 + 0.4 * glow})`
        : 'inset 0 0 0 2px rgba(255,255,255,0.09)'
      tile.die.style.background = on ? `radial-gradient(80% 80% at 50% 40%, rgba(60,215,255,${0.10 + 0.25 * glow}), rgba(60,215,255,0) 70%)` : ''
      tile.el.style.transform = `scale(${on ? mix(0.94, 1, clamp(k)) : 0.94})`
      tile.el.style.opacity = String(on ? 1 : 0.35)
      tile.head.style.color = on ? '#3cd7ff' : '#6e7580'
      tile.names.forEach((n, j) => {
        const kn = prog(t, t0 + 0.05 + j * 0.07, 0.45, outExpo)
        n.style.opacity = String(kn)
        n.style.transform = `translateY(${(1 - kn) * 18}px)`
      })
    })
    nums[0].n.textContent = String(models)
    nums[1].n.textContent = String(lit)
    nums[0].g.style.opacity = nums[1].g.style.opacity = String(prog(t, b23 - 0.05, 0.3))
    const kb = prog(t, b24, 0.9, outCubic)
    outline.querySelector('rect').setAttribute('stroke-dashoffset', String(1 - kb))
    nums[2].g.style.opacity = String(prog(t, b24 + 0.3, 0.5, outExpo))
    boxLabel.style.opacity = String(prog(t, b24 + 0.6, 0.6, outExpo))
    flash.style.opacity = String(t >= b23 ? 0.08 * Math.exp(-(t - b23) * 8) : 0)
    const out = prog(t, b25 - 0.3, 0.3, inQuint)
    s.layer.style.opacity = String(1 - out)
  }
  return s
}
