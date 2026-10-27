// 3. Title on the drop: the mark's box springs in around the chain, the chain settles into the
// lockup, the wordmark wipes out from behind it and a specular sweep crosses the letters.
// Technique: spring settle plus light sweep; a fast push-out into the cut.
import { R } from '../main.js'
import { drawMark, chainAt } from '../lib/logo.js'
import { inCubic, inOutCubic, inQuint, mix, outExpo, prog, spring } from '../lib/ease.js'
import { MARK_K, SILENCE_K } from './hands.js'

const MARK = 24 * MARK_K
const TEXT_PX = (15 / 22) * MARK // the app's 15 px wordmark next to a 22 px mark

export default function title(T) {
  const s = { id: 'title', z: 3 }
  let fx, word, sweep, bloom, flash, group, markCx, textX
  s.build = (root) => {
    bloom = R.el('div', 'abs', root)
    bloom.style.cssText = 'inset:0;background:radial-gradient(40% 50% at 50% 50%, rgba(60,215,255,0.22), rgba(60,215,255,0) 70%)'
    flash = R.el('div', 'abs', root)
    flash.style.cssText = 'inset:0;background:#dff8ff;z-index:5'
    group = R.el('div', 'abs', root)
    group.style.cssText = 'inset:0;transform-origin:50% 50%'
    fx = R.canvas(group)
    const style = `position:absolute;top:0;left:0;font-size:${TEXT_PX}px;font-weight:600;letter-spacing:-0.03em;line-height:1;white-space:nowrap`
    word = R.el('div', '', group, 'tacit')
    word.style.cssText = style + ';color:#eceef1'
    sweep = R.el('div', '', group, 'tacit')
    sweep.style.cssText = style + ';color:transparent;-webkit-background-clip:text;background-clip:text;' +
      'background-image:linear-gradient(105deg, rgba(255,255,255,0) 40%, rgba(220,250,255,0.95) 50%, rgba(255,255,255,0) 60%);background-size:300% 100%'
    // Lockup geometry from the real text width.
    root.style.display = 'block'
    const w = word.getBoundingClientRect().width
    const h = word.getBoundingClientRect().height
    root.style.display = ''
    const gap = MARK * (8 / 22)
    const total = MARK + gap + w
    markCx = R.W / 2 - total / 2 + MARK / 2
    textX = markCx + MARK / 2 + gap
    for (const el of [word, sweep]) {
      el.style.left = `${textX}px`
      el.style.top = `${R.H / 2 - h / 2 - TEXT_PX * 0.04}px`
    }
  }
  s.blur = [[T.bar(10) - 0.32, T.bar(10), 6]]
  s.render = (t) => {
    const b9 = T.bar(9)
    const b10 = T.bar(10)
    const lt = t - b9
    fx.clear()
    const g = fx.g
    const sp = spring(t, b9, { zeta: 0.62, omega: 13 })
    const cx = mix(960, markCx, sp)
    const k = mix(SILENCE_K, MARK_K, sp)
    const box = spring(t, b9 + 0.02, { zeta: 0.55, omega: 15 })
    const ring = spring(t, b9 + 0.16, { zeta: 0.5, omega: 12 })
    const pts = chainAt(cx, 540, k)
    drawMark(g, cx, 540, k, { pts, box: Math.max(0, box), ring: Math.max(0, ring), glow: 1.2 })

    // Shockwave from the fingertip on the drop.
    const wave = prog(t, b9, 1.1, outExpo)
    if (wave > 0 && wave < 1) {
      const [tx, ty] = chainAt(960, 540, SILENCE_K)[3]
      g.save()
      g.globalCompositeOperation = 'lighter'
      for (const [d, a] of [[0, 0.55], [0.08, 0.25]]) {
        const w2 = Math.max(0, wave - d)
        g.globalAlpha = a * (1 - w2) ** 1.5
        g.strokeStyle = '#3cd7ff'
        g.lineWidth = mix(6, 1, w2)
        g.beginPath()
        g.arc(tx, ty, mix(20, 1150, w2), 0, Math.PI * 2)
        g.stroke()
      }
      g.restore()
    }

    // Wordmark wipes out from behind the mark.
    const wipe = prog(t, b9 + 0.06, 0.7, outExpo)
    const clip = `inset(-20% ${(1 - wipe) * 100}% -20% 0)`
    for (const el of [word, sweep]) {
      el.style.clipPath = clip
      el.style.transform = `translateX(${(1 - wipe) * -60}px)`
    }
    const sw = prog(t, b9 + 0.45, 1.1, inOutCubic)
    sweep.style.backgroundPosition = `${mix(100, -50, sw)}% 0`
    sweep.style.opacity = sw > 0 && sw < 1 ? '1' : '0'
    bloom.style.opacity = String(Math.exp(-Math.max(0, lt) * 1.6) * 0.9 + 0.25)
    flash.style.opacity = String(lt >= 0 ? 0.1 * Math.exp(-lt * 7) : 0)

    // Slow push while it holds, then a fast push-out into the cut on the next bar.
    const out = prog(t, b10 - 0.32, 0.32, inQuint)
    const scale = mix(1, 1.035, prog(t, b9, b10 - b9, (x) => x)) * mix(1, 1.6, inCubic(out))
    group.style.transform = `scale(${scale})`
    group.style.opacity = String(1 - out)
    group.style.filter = out > 0.001 ? `blur(${out * 6}px)` : 'none'
  }
  return s
}
