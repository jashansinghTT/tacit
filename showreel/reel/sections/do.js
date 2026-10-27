// 7. Do. Out of the twin's hand into the Robot Lab: the Franka follows her wrist path with her
// hands as a ghost (a recorded "replay the human" run). Then the policy trained in simulation from
// 200 varied demos: 20 trials on scenes it never saw, flipping in on the beat, all 20 succeed.
// GR00T N1.7 on chip 3 closes the section as the foundation-model baseline.
// Technique: zoom-through match cut, then a mosaic of tiles flipping on the beat.
import { R } from '../main.js'
import { sequence } from '../lib/seq.js'
import { line, rise } from '../lib/type.js'
import { inQuint, mix, outCubic, outExpo, prog, spring } from '../lib/ease.js'

// Where her ghost hands are in the robot capture (CSS px), for the zoom-out from the twin's hand.
export const GHOST = [1080, 880]

export default function act(T) {
  const s = { id: 'do', z: 7 }
  let robot, plate, word, grid, cells, count, countSub, chip, eval_
  const b18 = T.bar(18), b19 = T.bar(19), b20 = T.bar(20), b21 = T.bar(21)
  const beat = T.beat
  const tGrid = b19 + 2 * beat
  const tGr00t = b20 + 2 * beat
  s.blur = [[b18, b18 + 0.3, 6], [b21 - 0.3, b21, 6]]
  s.load = async () => { eval_ = await R.json('/data/assets/robot_vase.json') }
  s.build = (root) => {
    plate = R.el('div', 'abs', root)
    plate.style.cssText = 'inset:0'
    robot = sequence(plate, { dir: '/data/captures/robot/frames', count: 80, fps: 30 })
    const wbox = R.el('div', 'abs', root)
    wbox.style.cssText = 'left:104px;bottom:70px'
    word = line(wbox, ['Do.'], { size: 290, style: 'text-shadow:0 10px 60px rgba(0,0,0,0.6)' })
    // The trial grid: one tile per evaluated trial, as the Robot Lab shows it.
    grid = R.el('div', 'abs', root)
    grid.style.cssText = 'left:150px;top:300px;display:grid;grid-template-columns:repeat(10,140px);gap:20px;perspective:1200px'
    cells = eval_.policy.last_eval.map((r) => {
      const c = R.el('div', '', grid, r.success ? '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#3ddc97" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.2 4.2L19 7"/></svg>' : '')
      c.style.cssText = `width:140px;height:140px;border-radius:18px;display:grid;place-items:center;background:${r.success ? 'rgba(61,220,151,0.12)' : 'rgba(255,93,93,0.12)'};` +
        `box-shadow:inset 0 0 0 2px ${r.success ? 'rgba(61,220,151,0.55)' : 'rgba(255,93,93,0.55)'},0 0 40px -12px rgba(61,220,151,0.6);transform-origin:50% 50%`
      return c
    })
    const n = eval_.policy.last_eval.filter((r) => r.success).length
    const tot = eval_.policy.last_eval.length
    const cbox = R.el('div', 'abs', root)
    cbox.style.cssText = 'left:150px;top:690px;display:flex;align-items:baseline;gap:34px'
    count = R.el('div', 'huge', cbox, `${n}<span style="color:#6e7580">/${tot}</span>`)
    count.style.cssText += ';font-size:230px;font-variant-numeric:tabular-nums'
    countSub = R.el('div', 'mono', cbox, 'scenes it never saw')
    countSub.style.cssText += ';font-size:30px;color:#a3a9b2'
    chip = R.el('div', 'chip abs', root, '<span class="dot"></span>GR00T N1.7<span class="v">chip 3</span><span style="color:#a3a9b2">baseline</span>')
    chip.style.cssText += ';left:110px;top:110px;font-size:30px;padding:16px 26px 16px 20px'
  }
  s.render = (t) => {
    // Robot plate: zooms out from her ghost hands (matching the push into the twin's hand), then
    // plays the run at 0.75x.
    const st = Math.max(0, t - b18) * 0.75
    robot.set(st)
    const z = prog(t, b18, 0.85, outExpo)
    const drift = prog(t, b18, b21 - b18, (x) => x)
    const k = mix(5, 1.12, z) - 0.06 * drift
    robot.camera(mix(GHOST[0], 960, z), mix(GHOST[1], 560, z), k)
    const gridOn = prog(t, tGrid - 0.1, 0.5, outCubic)
    const back = prog(t, tGr00t, 0.5, outCubic)
    plate.style.filter = `brightness(${mix(1, 0.22, gridOn * (1 - back) + back * 0.55)}) blur(${(gridOn * (1 - back)) * 6}px)`
    plate.style.opacity = String(Math.min(1, (t - b18) / 0.08 + 0.001))

    rise(word.words[0], prog(t, b18 + beat, 0.65, outExpo))
    const wout = prog(t, tGrid - 0.35, 0.35, inQuint)
    word.el.style.opacity = String(1 - wout)

    // Tiles flip in as a fast cascade on the beat, then the count lands.
    const out = prog(t, tGr00t - 0.3, 0.3, inQuint)
    cells.forEach((c, i) => {
      const t0 = tGrid + (i % 10) * 0.045 + Math.floor(i / 10) * 0.12
      const k2 = spring(t, t0, { zeta: 0.55, omega: 16 })
      c.style.opacity = String(Math.min(1, Math.max(0, k2)) * (1 - out))
      c.style.transform = `rotateX(${(1 - Math.min(1.08, k2)) * 90}deg) scale(${0.7 + 0.3 * k2})`
    })
    const kc = spring(t, tGrid + 0.75, { zeta: 0.6, omega: 13 })
    count.style.opacity = String(Math.min(1, Math.max(0, kc)) * (1 - out))
    count.style.transform = `translateY(${(1 - kc) * 60}px)`
    const ks = prog(t, tGrid + 0.95, 0.6, outExpo)
    countSub.style.opacity = String(ks * (1 - out))

    // GR00T, named as the baseline, over the arm.
    const kg = spring(t, tGr00t + 0.1, { zeta: 0.6, omega: 15 })
    const gout = prog(t, b21 - 0.3, 0.3, inQuint)
    chip.style.opacity = String(Math.min(1, Math.max(0, kg)) * (1 - gout))
    chip.style.transform = `translateX(${(1 - Math.min(1, kg)) * -30}px)`
    // Whip out to the right into Earn.
    const whip = prog(t, b21 - 0.3, 0.3, inQuint)
    s.layer.style.transform = `translateX(${-whip * 1400}px)`
  }
  return s
}
