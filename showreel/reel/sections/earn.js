// 8. Earn. A whip pan onto the Skill Exchange (verified, consented skills from the plant), then
// the expert's share rolls up: 70% of every license (the default royalty split), over her ledger.
// Technique: whip pan with motion blur, then a counter roll.
import { R } from '../main.js'
import { line, rise } from '../lib/type.js'
import { inOutSine, inQuint, mix, outExpo, prog, spring } from '../lib/ease.js'

export default function earn(T) {
  const s = { id: 'earn', z: 8 }
  let ex, led, word, pct, pctNum, sub
  const b21 = T.bar(21), b22 = T.bar(22), b23 = T.bar(23)
  const beat = T.beat
  s.blur = [[b21, b21 + 0.35, 6], [b22 - 0.25, b22 + 0.3, 6]]
  const pane = (root, src) => {
    const el = R.el('img', 'plate', root)
    el.src = src
    el.style.cssText = 'left:0;top:0;width:1920px;height:1080px;transform-origin:50% 50%;border-radius:20px;' +
      'box-shadow:0 0 0 2px rgba(255,255,255,0.10),0 60px 140px -40px rgba(0,0,0,0.9)'
    R.wait(el.decode())
    return el
  }
  s.build = (root) => {
    ex = pane(root, '/data/captures/stills/exchange.png')
    led = pane(root, '/data/captures/stills/earnings.png')
    const wbox = R.el('div', 'abs', root)
    wbox.style.cssText = 'left:104px;bottom:70px'
    word = line(wbox, ['Earn.'], { size: 290, style: 'text-shadow:0 10px 60px rgba(0,0,0,0.7)' })
    pct = R.el('div', 'abs', root)
    pct.style.cssText = 'right:120px;top:170px;text-align:right'
    pctNum = R.el('div', 'huge', pct, '0%')
    pctNum.style.cssText += ';font-size:400px;font-variant-numeric:tabular-nums;text-shadow:0 20px 80px rgba(0,0,0,0.7)'
    sub = line(pct, [{ t: 'to the expert.', serif: true, grad: true }], { size: 110, style: 'margin-top:-10px' })
  }
  s.render = (t) => {
    // Whip in from the right (the Robot Lab leaves to the left on the same beat).
    const whip = prog(t, b21, 0.55, outExpo)
    const drift = prog(t, b21, b23 - b21, inOutSine)
    ex.style.transform = `translateX(${(1 - whip) * 1600 - drift * 40}px) scale(${mix(0.86, 0.9, drift)}) rotate(-1.2deg)`
    // The ledger slides over on bar 22.
    const k2 = prog(t, b22 - 0.25, 0.6, outExpo)
    led.style.transform = `translate(${(1 - k2) * 1700 + 230}px, 90px) scale(0.74) rotate(1.6deg)`
    led.style.opacity = String(k2 > 0 ? 1 : 0)
    const dim = prog(t, b21 + 2 * beat, 0.5, outExpo)
    ex.style.filter = `brightness(${mix(1, 0.4, dim)})`
    led.style.filter = `brightness(${mix(0.9, 0.42, prog(t, b22 + 0.4, 0.4))})`

    rise(word.words[0], prog(t, b21 + 0.1, 0.65, outExpo))
    // 70% rolls up on beat 3 of the bar, settling on a light spring.
    const roll = spring(t, b21 + 2 * beat, { zeta: 0.7, omega: 9 })
    // The number never passes 70 (it is the claim); the spring's overshoot goes into scale.
    pctNum.textContent = `${Math.round(Math.max(0, Math.min(1, roll)) * 70)}%`
    pctNum.style.transform = `scale(${1 + 0.06 * Math.max(0, roll - 1) / 0.05})`
    pctNum.style.transformOrigin = '100% 60%'
    pct.style.opacity = String(Math.min(1, Math.max(0, roll * 3)))
    rise(sub.words[0], prog(t, b21 + 3 * beat, 0.65, outExpo))
    const out = prog(t, b23 - 0.32, 0.32, inQuint)
    s.layer.style.opacity = String(1 - out)
    s.layer.style.transform = `scale(${1 + out * 0.08})`
  }
  return s
}
