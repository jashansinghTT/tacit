import { useEffect, useLayoutEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Box, Eye, GraduationCap, Bot, ShieldCheck, Coins, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useApp, type PersonaId } from '@/lib/store'
import { Button, Kbd } from '@/components/ui'

interface TourStep {
  key: string
  label: string
  title: string
  body: string
  route: string
  persona: PersonaId
  target?: string
  icon: typeof Eye
  models: string
}

/** The guided demo: Watch, Check, Teach, Do, Earn with the seeded sample, then the Box. */
export const TOUR: TourStep[] = [
  {
    key: 'watch', label: 'Watch', icon: Eye, route: '/studio?source=sample', persona: 'u_maria', target: '[data-tour="studio-source"]',
    title: 'Watch an expert work',
    body: 'Maria kits a bracket set at the bench. Pick the sample (or your webcam) and press Start: both hands, the gaze and the parts are tracked live, and the coach asks why at each step.',
    models: 'MediaPipe · HaMeR, Gaze-LLE, RF-DETR on chip 0 · gpt-oss-20b on chip 2 · S2 Pro, Whisper on chip 1',
  },
  {
    key: 'check', label: 'Check', icon: ShieldCheck, route: '/skills/sk_sort?tab=verify', persona: 'u_maria', target: '[data-tour="verify-panel"]',
    title: 'Check it is real',
    body: 'VGGT rebuilds the scene from four views of the clip. A real camera gives one rigid scene; an AI-made video drifts. This capture scores high and carries a verification certificate.',
    models: 'VGGT-1B on chip 0',
  },
  {
    key: 'teach', label: 'Teach', icon: GraduationCap, route: '/learn/sk_sort', persona: 'u_sam', target: '[data-tour="lesson-player"]',
    title: 'Teach the next person',
    body: 'Sam, a new hire, learns the skill: each step with Maria\'s own "why", the 3D twin doing it, narration in the trainee\'s language, and live practice on camera with a match score.',
    models: 'S2 Pro, Whisper on chip 1 · gpt-oss-20b on chip 2 · HaMeR on chip 0',
  },
  {
    key: 'do', label: 'Do', icon: Bot, route: '/robot/sk_sort', persona: 'u_priya', target: '[data-tour="robot-modes"]',
    title: 'Let a robot do it',
    body: 'The same capture becomes a robot program. Train a policy in simulation, evaluate it over 20 randomised trials, and compare with GR00T running on the box.',
    models: 'MuJoCo + PyTorch on CPU · GR00T N1.7 on chip 3',
  },
  {
    key: 'earn', label: 'Earn', icon: Coins, route: '/exchange/lst_sort', persona: 'u_atlas', target: '[data-tour="license-panel"]',
    title: 'Earn from what you know',
    body: 'Verified, consented skills are listed on the Skill Exchange. A robot maker licenses the pack (motion, gaze, text, never video) and Maria earns 70% of every licence.',
    models: 'Consent record + VGGT certificate',
  },
  {
    key: 'box', label: 'Box', icon: Box, route: '/box', persona: 'u_priya', target: '[data-tour="chip-map"]',
    title: 'Nine models, four chips, one box',
    body: 'Everything you just saw ran here, inside the plant, on four Tenstorrent Blackhole chips. Live latency and health for every model.',
    models: 'tt-model cohost groups on chips 0 to 3',
  },
]

function useTargetRect(selector: string | undefined, deps: unknown[]) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  useLayoutEffect(() => {
    if (!selector) {
      setRect(null)
      return
    }
    let raf = 0
    let tries = 0
    const find = () => {
      const el = document.querySelector(selector)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        const update = () => setRect(el.getBoundingClientRect())
        setTimeout(update, 450)
        update()
        return
      }
      if (tries++ < 60) raf = requestAnimationFrame(find)
      else setRect(null)
    }
    find()
    const onResize = () => {
      const el = document.querySelector(selector)
      if (el) setRect(el.getBoundingClientRect())
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector, ...deps])
  return rect
}

export function Tour() {
  const { tourOpen, tourStep, setTourStep, closeTour, setPersona } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const step = TOUR[tourStep]

  useEffect(() => {
    if (!tourOpen || !step) return
    setPersona(step.persona)
    navigate(step.route)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourOpen, tourStep])

  useEffect(() => {
    if (!tourOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTour()
      else if (e.key === 'ArrowRight' && tourStep < TOUR.length - 1) setTourStep(tourStep + 1)
      else if (e.key === 'ArrowLeft' && tourStep > 0) setTourStep(tourStep - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tourOpen, tourStep, closeTour, setTourStep])

  const rect = useTargetRect(tourOpen ? step?.target : undefined, [location.pathname, tourStep])

  return (
    <AnimatePresence>
      {tourOpen && step && (
        <>
          {rect && (
            <motion.div
              key="ring"
              className="pointer-events-none fixed z-[60] rounded-xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 32 }}
              style={{ boxShadow: '0 0 0 2px var(--color-ion), 0 0 0 9999px rgb(4 5 6 / 0.55), 0 0 40px rgb(60 215 255 / 0.4)' }}
            />
          )}
          <motion.aside
            key="card"
            role="dialog"
            aria-label="Guided demo"
            data-testid="tour"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed bottom-5 left-1/2 z-[65] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl bg-ink-750/95 shadow-raised backdrop-blur-2xl"
          >
            <div className="flex items-center gap-1 border-b border-line px-3 py-2">
              {TOUR.map((t, i) => {
                const Icon = t.icon
                return (
                  <button
                    key={t.key}
                    onClick={() => setTourStep(i)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                      i === tourStep ? 'bg-ion-soft text-ion' : i < tourStep ? 'text-fg-muted hover:text-fg' : 'text-fg-faint hover:text-fg-muted',
                    )}
                    aria-current={i === tourStep ? 'step' : undefined}
                  >
                    <Icon className="size-3.5" />
                    <span className="hidden sm:inline">{t.label}</span>
                  </button>
                )
              })}
              <button onClick={closeTour} className="ml-auto rounded-md p-1 text-fg-subtle hover:bg-white/5 hover:text-fg" aria-label="End the tour" data-testid="tour-close">
                <X className="size-4" />
              </button>
            </div>
            <div className="px-5 pt-4 pb-4">
              <div className="eyebrow text-ion">
                Step {tourStep + 1} of {TOUR.length} · {step.label}
              </div>
              <h2 className="mt-1.5 text-lg font-medium text-fg">{step.title}</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{step.body}</p>
              <p className="telemetry mt-3 text-[11px] text-fg-subtle">{step.models}</p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="hidden items-center gap-1.5 text-[11px] text-fg-faint sm:flex">
                  <Kbd>←</Kbd>
                  <Kbd>→</Kbd> to move · <Kbd>Esc</Kbd> to leave
                </span>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="ghost" icon={<ArrowLeft className="size-3.5" />} disabled={tourStep === 0} onClick={() => setTourStep(tourStep - 1)}>
                    Back
                  </Button>
                  {tourStep < TOUR.length - 1 ? (
                    <Button size="sm" variant="primary" iconRight={<ArrowRight className="size-3.5" />} onClick={() => setTourStep(tourStep + 1)} data-testid="tour-next">
                      Next: {TOUR[tourStep + 1].label}
                    </Button>
                  ) : (
                    <Button size="sm" variant="primary" onClick={closeTour}>
                      Finish
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
