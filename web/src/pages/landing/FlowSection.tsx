import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { Bot, Coins, Eye, GraduationCap, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ChipTag } from '@/components/ui'

const NODES = [
  { key: 'watch', label: 'Watch', icon: Eye, what: 'Track hands, gaze, parts', models: [['HaMeR', 0], ['Gaze-LLE', 0], ['RF-DETR', 0]] },
  { key: 'check', label: 'Check', icon: ShieldCheck, what: 'Prove it is a real recording', models: [['VGGT-1B', 0]] },
  { key: 'teach', label: 'Teach', icon: GraduationCap, what: 'Lesson, narration, tutor', models: [['gpt-oss-20b', 2], ['S2 Pro', 1], ['Whisper', 1]] },
  { key: 'do', label: 'Do', icon: Bot, what: 'Policy in sim, GR00T baseline', models: [['GR00T N1.7', 3], ['MuJoCo', null]] },
  { key: 'earn', label: 'Earn', icon: Coins, what: 'License with consent, royalties', models: [['Skill Exchange', null]] },
] as const

const SEG_MS = 800
const SPLASH_MS = 700
const IDLE_MS = 900

/**
 * Adapted from the MotionSites "Cybersecurity Hero" pattern: neumorphic nodes joined by a
 * hairline, a beam with a moving gradient window travelling node to node, a splash on arrival
 * and a glow on the node being passed. A small state machine on requestAnimationFrame.
 */
function Pipeline() {
  const reduce = useReducedMotion()
  const grad = useRef<SVGLinearGradientElement>(null)
  const [active, setActive] = useState(0)
  const [splash, setSplash] = useState<number | null>(null)
  const xs = NODES.map((_, i) => 100 + i * 200)

  useEffect(() => {
    if (reduce) {
      setActive(-1)
      return
    }
    let raf = 0
    let start = performance.now()
    const cycle = (NODES.length - 1) * (SEG_MS + SPLASH_MS) + IDLE_MS
    let lastSplash = -2
    const tick = (now: number) => {
      const t = Math.max(0, now - start) % cycle
      const seg = Math.floor(t / (SEG_MS + SPLASH_MS))
      const within = t - seg * (SEG_MS + SPLASH_MS)
      const g = grad.current
      if (seg < NODES.length - 1) {
        const moving = within < SEG_MS
        const u = moving ? within / SEG_MS : 1
        const eased = 1 - Math.pow(1 - u, 3)
        const x = xs[seg] + (xs[seg + 1] - xs[seg]) * eased
        if (g) {
          g.setAttribute('x1', String(x - 60))
          g.setAttribute('x2', String(x + 6))
        }
        setActive(moving ? seg : seg + 1)
        if (!moving && lastSplash !== seg) {
          lastSplash = seg
          setSplash(seg + 1)
        }
      } else if (g) {
        g.setAttribute('x1', '-200')
        g.setAttribute('x2', '-100')
        lastSplash = -2
      }
      raf = requestAnimationFrame(tick)
    }
    start = performance.now()
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // xs is derived from a constant
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce])

  return (
    <div className="relative mx-auto w-full max-w-[1000px]">
      <svg viewBox="0 0 1000 120" className="absolute inset-x-0 top-0 h-[120px] w-full overflow-visible" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient ref={grad} id="beam-grad" gradientUnits="userSpaceOnUse" x1="-200" y1="0" x2="-100" y2="0">
            <stop offset="0" stopColor="#3cd7ff" stopOpacity="0" />
            <stop offset="0.7" stopColor="#3cd7ff" stopOpacity="1" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="1" />
          </linearGradient>
          <filter id="beam-glow" x="-20%" y="-200%" width="140%" height="500%">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
        </defs>
        <line x1={xs[0]} x2={xs[xs.length - 1]} y1="60" y2="60" stroke="rgb(255 255 255 / 0.09)" strokeWidth="1" />
        <line x1={xs[0]} x2={xs[xs.length - 1]} y1="60" y2="60" stroke="url(#beam-grad)" strokeWidth="2" filter="url(#beam-glow)" />
        <line x1={xs[0]} x2={xs[xs.length - 1]} y1="60" y2="60" stroke="url(#beam-grad)" strokeWidth="1.5" />
      </svg>
      <ol className="relative grid grid-cols-5">
        {NODES.map((n, i) => {
          const Icon = n.icon
          const lit = active === i
          const big = i === 2
          return (
            <li key={n.key} className="flex flex-col items-center text-center" data-testid={`flow-${n.key}`}>
              <div className="relative grid h-[120px] place-items-center">
                <div
                  className={cn('relative grid place-items-center rounded-full bg-ink-800 transition-[box-shadow,color] duration-300', big ? 'size-16' : 'size-12', lit ? 'text-ion' : 'text-fg-muted')}
                  style={{
                    boxShadow: `6px 6px 12px rgb(0 0 0 / 0.45), -4px -4px 10px rgb(255 255 255 / 0.03), inset 1px 1px 1px rgb(255 255 255 / 0.05), inset 4px 4px 8px rgb(0 0 0 / 0.4)${lit ? ', 0 0 32px rgb(60 215 255 / 0.45), 0 0 0 1px rgb(60 215 255 / 0.5)' : ''}`,
                  }}
                >
                  <span className="pointer-events-none absolute -inset-[7px] rounded-full border border-dotted border-white/10" aria-hidden />
                  <Icon className={big ? 'size-6' : 'size-5'} strokeWidth={1.75} />
                  {splash === i && (
                    <span
                      key={`${i}-${Date.now()}`}
                      className="pointer-events-none absolute inset-0 rounded-full"
                      style={{ background: 'radial-gradient(circle, rgb(60 215 255 / 0.55), transparent 65%)', animation: `splash ${SPLASH_MS}ms ease-out forwards` }}
                      onAnimationEnd={() => setSplash(null)}
                      aria-hidden
                    />
                  )}
                </div>
              </div>
              <div className={cn('text-sm font-medium transition-colors', lit ? 'text-fg' : 'text-fg-muted')}>{n.label}</div>
              <div className="mt-1 px-2 text-xs text-fg-subtle">{n.what}</div>
              <div className="mt-3 flex flex-wrap justify-center gap-1 px-1">
                {n.models.map(([m, chip]) => (
                  <span key={m} className="inline-flex items-center gap-1 rounded-sm bg-white/[0.03] py-0.5 pr-0.5 pl-1.5 text-[10px] text-fg-muted shadow-[inset_0_0_0_1px_var(--color-line)]">
                    {m}
                    {chip !== null ? <ChipTag chip={chip} /> : null}
                  </span>
                ))}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export function FlowSection() {
  return (
    <section className="relative px-4 pt-20 pb-16 lg:px-6" id="how" data-testid="landing-flow">
      <div
        className="relative mx-auto max-w-[1280px] overflow-hidden rounded-[20px] border border-line bg-[#0b0d10] px-6 pt-20 pb-16"
        style={{ backgroundImage: 'radial-gradient(ellipse 70% 55% at 50% 118%, rgb(60 215 255 / 0.32), rgb(60 215 255 / 0.08) 45%, transparent 70%), radial-gradient(ellipse 50% 40% at 50% -10%, rgb(255 255 255 / 0.05), transparent 70%)' }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage: 'linear-gradient(to right, rgb(255 255 255 / 0.04) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.04) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 75%)',
          }}
          aria-hidden
        />
        <div className="relative text-center">
          <div className="eyebrow">How it works</div>
          <h2 className="mx-auto mt-4 max-w-3xl text-[clamp(2.4rem,4.4vw,4rem)] leading-[1.02] font-light tracking-[-0.03em] text-fg">
            One recording.
            <br />
            <span className="text-ion-gradient">Five ways it pays off.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[15px] text-fg-muted">
            The expert works as they always do. Every stage runs on the box in the plant, and every result says which model and chip produced it.
          </p>
        </div>
        <div className="relative mt-16 overflow-x-auto pb-2">
          <div className="min-w-[760px]">
            <Pipeline />
          </div>
        </div>
      </div>
    </section>
  )
}
