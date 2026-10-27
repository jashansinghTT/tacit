// 8. Earn. A whip pan onto the Skill Exchange (kept as blurred texture: no names or prices are
// legible), then the expert's share rolls up and the license splits on the beat: 70% to the
// expert, 30% to the plant (the default royalty split).
// Technique: whip pan with motion blur, counter roll, a bar splitting on the beat.
import { R } from '../main.js'
import { line, rise } from '../lib/type.js'
import { inOutCubic, inOutSine, inQuint, mix, outExpo, prog, spring } from '../lib/ease.js'

const BAR = { x: 700, y: 620, w: 1120, h: 30 } // clear of the word below and the line above

export default function earn(T) {
  const s = { id: 'earn', z: 8 }
  let ex, word, pct, pctNum, sub, barA, barB, labA, labB
  const b21 = T.bar(21), b22 = T.bar(22), b23 = T.bar(23)
  const beat = T.beat
  s.blur = [[b21, b21 + 0.35, 6]]
  s.build = (root) => {
    ex = R.el('img', 'plate', root)
    ex.src = '/data/captures/stills/exchange.png'
    ex.style.cssText = 'left:0;top:0;width:1920px;height:1080px;transform-origin:50% 50%;border-radius:20px'
    R.wait(ex.decode())
    const wbox = R.el('div', 'abs', root)
    wbox.style.cssText = 'left:104px;bottom:70px'
    word = line(wbox, ['Earn.'], { size: 290, style: 'text-shadow:0 10px 60px rgba(0,0,0,0.7)' })
    pct = R.el('div', 'abs', root)
    pct.style.cssText = 'right:100px;top:120px;text-align:right'
    pctNum = R.el('div', 'huge', pct, '0%')
    pctNum.style.cssText += ';font-size:400px;font-variant-numeric:tabular-nums;text-shadow:0 20px 80px rgba(0,0,0,0.7);transform-origin:100% 60%'
    sub = line(pct, [{ t: 'to the expert.', serif: true, grad: true }], { size: 110, style: 'margin-top:-10px' })
    const bar = (cls) => {
      const el = R.el('div', 'abs', root)
      el.style.cssText = `top:${BAR.y}px;height:${BAR.h}px;border-radius:${BAR.h / 2}px;${cls}`
      return el
    }
    barA = bar('background:linear-gradient(90deg,#14bff2,#3cd7ff);box-shadow:0 0 40px -6px rgba(60,215,255,0.8)')
    barB = bar('background:#2e343b;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.12)')
    const lab = (txt) => {
      const el = R.el('div', 'mono abs', root, txt)
      el.style.cssText += `;top:${BAR.y + BAR.h + 22}px;font-size:26px;white-space:nowrap`
      return el
    }
    labA = lab('expert <span style="color:#3cd7ff">70</span>')
    labB = lab('plant 30')
    labB.style.color = '#a3a9b2'
  }
  s.render = (t) => {
    // Whip in from the right (the Robot Lab leaves to the left on the same beat); the page is
    // texture only.
    const whip = prog(t, b21, 0.55, outExpo)
    const drift = prog(t, b21, b23 - b21, inOutSine)
    ex.style.transform = `translateX(${(1 - whip) * 1600 - drift * 50}px) scale(${mix(1.0, 1.06, drift)})`
    ex.style.filter = `blur(14px) brightness(${mix(0.75, 0.45, prog(t, b21 + 0.3, 0.6))}) saturate(0.85)`

    rise(word.words[0], prog(t, b21 + 0.1, 0.65, outExpo))
    // 70% rolls up on beat 3 of the bar. The number never passes 70 (it is the claim); the spring's
    // overshoot goes into scale.
    const roll = spring(t, b21 + 2 * beat, { zeta: 0.7, omega: 9 })
    pctNum.textContent = `${Math.round(Math.max(0, Math.min(1, roll)) * 70)}%`
    pctNum.style.transform = `scale(${1 + (0.06 * Math.max(0, roll - 1)) / 0.05})`
    pct.style.opacity = String(Math.min(1, Math.max(0, roll * 3)))
    rise(sub.words[0], prog(t, b21 + 3 * beat, 0.65, outExpo))

    // The license bar fills, then splits on the downbeat of bar 22: 70 to the expert, 30 to the plant.
    const fill = prog(t, b21 + 2 * beat, 0.9, inOutCubic)
    const split = spring(t, b22, { zeta: 0.55, omega: 14 })
    const gap = 26 * Math.max(0, split)
    const wA = BAR.w * 0.7 * (t >= b22 ? 1 : 1 / 0.7) * fill
    const xB = BAR.x + BAR.w * 0.7 + gap
    barA.style.left = `${BAR.x}px`
    barA.style.width = `${Math.min(BAR.w, wA)}px`
    barB.style.left = `${xB}px`
    barB.style.width = `${Math.max(0, BAR.w * 0.3 - gap)}px`
    barB.style.opacity = String(t >= b22 ? Math.min(1, (t - b22) / 0.05) : 0)
    barA.style.opacity = String(fill > 0 ? 1 : 0)
    const kl = prog(t, b22 + 0.05, 0.5, outExpo)
    labA.style.left = `${BAR.x}px`
    labB.style.left = `${xB}px`
    for (const l of [labA, labB]) {
      l.style.opacity = String(kl)
      l.style.transform = `translateY(${(1 - kl) * 14}px)`
    }
    const out = prog(t, b23 - 0.32, 0.32, inQuint)
    s.layer.style.opacity = String(1 - out)
    s.layer.style.transform = `scale(${1 + out * 0.08})`
  }
  return s
}
