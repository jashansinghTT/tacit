import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, ArrowUpRight, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ButtonLink, ChipTag } from '@/components/ui'
import type { HeroFocus, HotspotDef } from '@/three/HeroScene'
import { useFeatured } from '@/lib/featured'

const HeroCanvas = lazy(() => import('@/three/HeroScene').then((m) => ({ default: m.HeroCanvas })))

type Key = Exclude<HeroFocus, null>

type LinkKey = 'studio' | 'verify' | 'learn' | 'robot' | 'exchange'

export const STEPS: Record<Key, { n: string; title: string; line: string; body: string; points: [string, number | null | 'cpu'][]; to: LinkKey; cta: string }> = {
  watch: {
    n: '01', title: 'Watch', line: 'Hands, gaze and parts, tracked live.', to: 'studio', cta: 'Open Studio',
    body: 'A camera watches the expert at their own bench. Tacit recovers both hands in 3D, where they look, and which parts they touch, ten times a second, and asks them why at every step.',
    points: [['HaMeR: 3D hands', 0], ['Gaze-LLE: where they look', 0], ['RF-DETR: parts and tools', 0]],
  },
  check: {
    n: '02', title: 'Check', line: 'Proof it was a real recording.', to: 'verify', cta: 'See a verification',
    body: 'VGGT rebuilds the scene in 3D from several views of the clip. A real camera gives one rigid scene; an AI-made video drifts. Every skill carries the score and a certificate.',
    points: [['VGGT-1B: multi-view rebuild', 0], ['Reprojection error and camera drift', null], ['Fakes flagged before they are sold', null]],
  },
  teach: {
    n: '03', title: 'Teach', line: 'A lesson in the expert\'s own words.', to: 'learn', cta: 'Open the lesson',
    body: 'Each step becomes a lesson card with the expert\'s "why", a 3D twin doing it, and narration in the trainee\'s language. Trainees practise on camera and get one hint at a time.',
    points: [['gpt-oss-20b: steps, SOP, quiz, tutor', 2], ['S2 Pro speaks, Whisper listens', 1], ['Live match score on camera', 0]],
  },
  do: {
    n: '04', title: 'Do', line: 'The same skill, run by a robot.', to: 'robot', cta: 'Open Robot Lab',
    body: 'The capture becomes a robot program. Tacit trains a policy in simulation from randomised demos, evaluates it over 20 trials, and runs GR00T on the box as the baseline.',
    points: [['Behaviour cloning in MuJoCo', 'cpu'], ['GR00T N1.7 foundation policy', 3], ['Success rate over 20 trials', null]],
  },
  earn: {
    n: '05', title: 'Earn', line: 'Experts paid every time it is used.', to: 'exchange', cta: 'Explore the Exchange',
    body: 'Verified, consented skills are licensed to robot makers on the Skill Exchange. Motion, gaze and text only, never video. The expert earns 70% of every licence.',
    points: [['Consent record on every skill', null], ['Verification certificate', 0], ['Royalty ledger per licence', null]],
  },
}

function Hotspot({ h, active, onEnter, onLeave, onPick }: { h: HotspotDef; active: boolean; onEnter: () => void; onLeave: () => void; onPick: () => void }) {
  return (
    <button
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={onPick}
      data-testid={`hotspot-${h.key}`}
      aria-label={`${h.label}: ${STEPS[h.key].line}`}
      className="group relative grid size-12 place-items-center rounded-full outline-none"
    >
      <span className={cn('absolute inset-2 rounded-full bg-ion/25 transition-transform duration-300', active ? 'scale-150 opacity-100' : 'scale-100 animate-ping opacity-40 [animation-duration:2.6s]')} aria-hidden />
      <span className={cn('relative grid size-6 place-items-center rounded-full bg-ion text-ion-ink shadow-[0_0_0_4px_rgb(60_215_255/0.2),0_0_24px_rgb(60_215_255/0.7)] transition-transform duration-200 group-hover:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-white', active && 'scale-110')}>
        <Plus className="size-3.5" strokeWidth={2.5} />
      </span>
      <span
        className={cn(
          'pointer-events-none absolute bottom-full left-1/2 mb-1 flex -translate-x-1/2 items-center gap-1.5 rounded-md bg-ion px-2.5 py-1 text-xs font-medium whitespace-nowrap text-ion-ink shadow-[0_8px_24px_-8px_rgb(60_215_255/0.8)] transition-all duration-200',
          active ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
        )}
      >
        {h.label}
        <ArrowUpRight className="size-3" />
      </span>
    </button>
  )
}

function Detail({ k, onBack }: { k: Key; onBack: () => void }) {
  const s = STEPS[k]
  const { links } = useFeatured()
  const to = { studio: '/studio', verify: links.verify, learn: links.learn, robot: links.robot, exchange: '/exchange' }[s.to]
  return (
    <motion.div
      key={k}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="absolute inset-y-3 right-3 z-30 flex w-[min(400px,calc(100%-1.5rem))] flex-col rounded-xl bg-ink-850/85 p-6 shadow-raised backdrop-blur-xl"
      role="dialog"
      aria-label={`${s.title} detail`}
      data-testid="hero-detail"
    >
      <button onClick={onBack} className="inline-flex w-fit items-center gap-1.5 rounded-md text-xs font-medium text-fg-muted hover:text-fg" data-testid="hero-detail-back">
        <ArrowLeft className="size-3.5" />
        Back
      </button>
      <div className="mt-6 flex items-baseline gap-3">
        <span className="telemetry text-sm text-ion">{s.n}</span>
        <h3 className="text-3xl font-medium tracking-[-0.03em] text-fg">{s.title}</h3>
      </div>
      <p className="mt-2 text-[15px] text-fg">{s.line}</p>
      <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">{s.body}</p>
      <ul className="mt-6 space-y-2.5 border-t border-line pt-5">
        {s.points.map(([label, chip]) => (
          <li key={label} className="flex items-center justify-between gap-3 text-[13px] text-fg-muted">
            <span className="flex items-center gap-2">
              <span className="size-1 rounded-full bg-ion" />
              {label}
            </span>
            {chip !== null && <ChipTag chip={chip === 'cpu' ? null : chip} />}
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-6">
        <ButtonLink to={to} variant="primary" size="md" iconRight={<ArrowRight className="size-4" />} className="w-full">
          {s.cta}
        </ButtonLink>
      </div>
    </motion.div>
  )
}

export function Hero() {
  const reduce = useReducedMotion() ?? false
  const [hover, setHover] = useState<Key | null>(null)
  const [open, setOpen] = useState<Key | null>(null)
  const focus = open ?? hover
  const close = useCallback(() => setOpen(null), [])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  return (
    <section className="relative -mt-[var(--header-h)] overflow-hidden pt-[calc(var(--header-h)+2rem)]" data-testid="landing-hero">
      <div className="pointer-events-none absolute inset-0 grid-bg fade-mask-b opacity-60" aria-hidden />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[1100px] -translate-x-1/2 rounded-full bg-ion/10 blur-[120px]" aria-hidden />
      <div className="relative mx-auto max-w-[1440px] px-4 lg:px-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="eyebrow mb-5 flex items-center gap-2">
              <span className="size-1.5 animate-pulse-dot rounded-full bg-ion" />
              Skill capture on one box · nine models · four Tenstorrent chips
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="text-display max-w-[13ch] font-medium text-gradient"
            >
              Teach a robot by <span className="font-serif font-normal tracking-[-0.02em] text-ion-gradient italic">showing</span> it.
            </motion.h1>
          </div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="max-w-md pb-2">
            <p className="text-[15px] leading-relaxed text-fg-muted">
              Tacit watches an expert work, turns it into a lesson for the next hire and a skill a robot can run, and pays the expert every time it is licensed.
            </p>
            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
              <ButtonLink to="/studio" variant="primary" size="lg" pill iconRight={<ArrowRight className="size-4" />} data-testid="cta-capture">
                Capture a skill
              </ButtonLink>
              <ButtonLink to="/exchange" variant="outline" size="lg" pill data-testid="cta-exchange">
                Explore the Skill Exchange
              </ButtonLink>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="relative mt-8 h-[clamp(420px,60vh,700px)] overflow-hidden rounded-2xl bg-ink-850 shadow-[0_0_0_1px_var(--color-line-strong),0_0_0_6px_rgb(255_255_255/0.02),0_40px_120px_-40px_rgb(60_215_255/0.25)]"
          data-tour="hero-frame"
        >
          <Suspense fallback={<div className="absolute inset-0 grid place-items-center"><div className="skeleton size-full rounded-none" /></div>}>
            <HeroCanvas
              focus={focus}
              frozen={reduce}
              renderHotspot={(h) => (
                <Hotspot h={h} active={focus === h.key} onEnter={() => setHover(h.key)} onLeave={() => setHover(null)} onPick={() => setOpen(h.key)} />
              )}
            />
          </Suspense>
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4">
            <span className="telemetry rounded-sm bg-ink-950/60 px-2 py-1 text-[10px] text-fg-muted backdrop-blur">LIVE · expert hands → Franka Panda (IK retarget)</span>
            <span className="telemetry hidden rounded-sm bg-ink-950/60 px-2 py-1 text-[10px] text-fg-muted backdrop-blur sm:block">
              {focus ? `${STEPS[focus].n} ${STEPS[focus].title.toUpperCase()}` : 'SELECT A POINT TO BEGIN'}
            </span>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink-850/80 to-transparent" />
          <AnimatePresence>{open && <Detail k={open} onBack={close} />}</AnimatePresence>
        </motion.div>

        <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-5">
          {(Object.keys(STEPS) as Key[]).map((k) => (
            <button key={k} onClick={() => setOpen(k)} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)} className="group text-left">
              <div className="flex items-baseline gap-2">
                <span className={cn('telemetry text-[11px] transition-colors', focus === k ? 'text-ion' : 'text-fg-faint')}>{STEPS[k].n}</span>
                <span className="text-sm font-medium text-fg">{STEPS[k].title}</span>
              </div>
              <p className="mt-1 text-[13px] text-fg-subtle transition-colors group-hover:text-fg-muted">{STEPS[k].line}</p>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
