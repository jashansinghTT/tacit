import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowUpRight, Check, Eye, FileText, Quote, Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ScoreRing, Sparkline, Spotlight } from '@/components/ui'

function Tile({ className, eyebrow, title, body, to, children }: { className?: string; eyebrow: string; title: string; body: string; to: string; children: ReactNode }) {
  return (
    <Spotlight className={cn('panel group overflow-hidden rounded-2xl', className)}>
      <Link to={to} className="flex h-full flex-col p-6 outline-none">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">{eyebrow}</div>
            <h3 className="mt-2 text-lg font-medium tracking-[-0.02em] text-fg">{title}</h3>
            <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-fg-subtle">{body}</p>
          </div>
          <ArrowUpRight className="size-4 shrink-0 text-fg-faint transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ion" />
        </div>
        <div className="mt-5 min-h-0 flex-1">{children}</div>
      </Link>
    </Spotlight>
  )
}

function LessonMini() {
  const steps = ['Read the work order', 'Pick a bracket from the blue bin', 'Seat the bracket in slot A', 'Pick two M6 bolts', 'Drop the bolts into slot B', 'Check the kit and push it out']
  return (
    <div className="flex h-full gap-4 rounded-xl bg-ink-900/70 p-4 shadow-[inset_0_0_0_1px_var(--color-line)]">
      <ol className="flex-1 space-y-2">
        {steps.map((s, i) => (
          <li key={s} className={cn('flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px]', i === 2 ? 'bg-ion/[0.08] text-fg shadow-[inset_0_0_0_1px_rgb(60_215_255/0.3)]' : 'text-fg-subtle')}>
            <span className={cn('grid size-5 shrink-0 place-items-center rounded-full text-[10px]', i < 2 ? 'bg-ok/15 text-ok' : i === 2 ? 'bg-ion text-ion-ink' : 'bg-white/[0.05] text-fg-faint')}>
              {i < 2 ? <Check className="size-3" strokeWidth={3} /> : i + 1}
            </span>
            <span className="truncate">{s}</span>
          </li>
        ))}
      </ol>
      <div className="hidden w-40 shrink-0 flex-col items-center justify-center gap-3 border-l border-line pl-4 sm:flex">
        <ScoreRing value={0.86} size={104} sub="match" />
        <p className="text-center text-[11px] text-fg-subtle">"Press the centre once; it should not rock."</p>
      </div>
    </div>
  )
}

function EarningsMini() {
  const data = [4, 6, 5, 9, 12, 11, 15, 18, 17, 24, 27, 33]
  return (
    <div className="flex h-full items-end justify-between gap-4">
      <div>
        <div className="telemetry text-3xl font-medium tracking-tight text-fg">$1,712</div>
        <div className="mt-1 text-xs text-fg-subtle">royalties to Maria · 70% of each licence</div>
      </div>
      <Sparkline data={data} width={180} height={64} tone="ok" />
    </div>
  )
}

function TrialsMini() {
  return (
    <div className="grid grid-cols-10 gap-1.5">
      {Array.from({ length: 20 }, (_, i) => (
        <span key={i} className={cn('aspect-square rounded-[3px]', i === 6 || i === 15 ? 'bg-fault/70' : 'bg-ok/70')} />
      ))}
      <div className="telemetry col-span-10 mt-2 text-xs text-fg-subtle">18 / 20 trials · policy in sim</div>
    </div>
  )
}

function SopMini() {
  return (
    <div className="space-y-2 rounded-lg bg-ink-900/70 p-4 shadow-[inset_0_0_0_1px_var(--color-line)]">
      <div className="flex items-center gap-2 text-[13px] font-medium text-fg">
        <FileText className="size-3.5 text-ion" /> Kit an M6 bracket set
      </div>
      {[92, 78, 85, 60].map((w, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="telemetry text-[10px] text-fg-faint">{i + 1}.</span>
          <span className="h-1.5 rounded-full bg-white/[0.08]" style={{ width: `${w}%` }} />
        </div>
      ))}
    </div>
  )
}

function GazeMini() {
  const reduce = useReducedMotion()
  return (
    <div className="relative h-full min-h-24 rounded-xl bg-ink-900/70 p-4 shadow-[inset_0_0_0_1px_var(--color-line)]">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-fg-muted">
          <Eye className="size-3.5 text-data-gaze" /> Looked at the gauge
        </span>
        <span className="flex items-center gap-1 text-ok">
          <Check className="size-3.5" /> before opening the valve
        </span>
      </div>
      <div className="relative mt-4 h-8 rounded-md bg-white/[0.03]">
        <div className="absolute inset-y-0 left-[18%] w-[22%] rounded-md bg-data-gaze/25 shadow-[inset_0_0_0_1px_rgb(255_200_87/0.5)]" />
        <div className="absolute inset-y-0 left-[46%] w-[30%] rounded-md bg-ion/20 shadow-[inset_0_0_0_1px_rgb(60_215_255/0.45)]" />
        <motion.div
          className="absolute -inset-y-1 w-px bg-fg shadow-[0_0_8px_white]"
          animate={reduce ? undefined : { left: ['10%', '90%'] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
          style={{ left: '50%' }}
        />
      </div>
      <div className="telemetry mt-2 flex justify-between text-[10px] text-fg-faint">
        <span>gaze: gauge</span>
        <span>hand: valve</span>
      </div>
    </div>
  )
}

const LANGS = [
  ['EN', 'Press the centre once; it should not rock.'],
  ['ES', 'Presiona el centro una vez; no debe moverse.'],
  ['PT', 'Pressione o centro uma vez; não deve balançar.'],
  ['DE', 'Einmal mittig drücken; es darf nicht wackeln.'],
  ['HI', 'बीच में एक बार दबाएँ; यह हिलना नहीं चाहिए।'],
]

function LangMini() {
  const reduce = useReducedMotion()
  const [i, setI] = useState(0)
  useEffect(() => {
    if (reduce) return
    const t = setInterval(() => setI((x) => (x + 1) % LANGS.length), 2400)
    return () => clearInterval(t)
  }, [reduce])
  return (
    <div>
      <div className="flex gap-1">
        {LANGS.map(([l], k) => (
          <span key={l} className={cn('telemetry rounded-sm px-1.5 py-0.5 text-[10px] transition-colors', k === i ? 'bg-ion text-ion-ink' : 'bg-white/[0.05] text-fg-subtle')}>
            {l}
          </span>
        ))}
      </div>
      <motion.p key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 text-[13px] text-fg">
        "{LANGS[i][1]}"
      </motion.p>
    </div>
  )
}

export function UseCases() {
  return (
    <section className="relative px-4 py-16 lg:px-6" id="use-cases" data-testid="landing-usecases">
      <div className="mx-auto max-w-[1440px]">
        <div className="max-w-2xl">
          <div className="eyebrow">Use cases</div>
          <h2 className="mt-4 text-[clamp(2.2rem,4vw,3.5rem)] leading-[1.02] font-medium tracking-[-0.035em] text-fg">
            Know-how that used to walk out the door.
          </h2>
        </div>
        <div className="mt-12 grid auto-rows-[minmax(220px,auto)] gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Tile className="md:col-span-2 xl:row-span-2" eyebrow="Onboarding and training" title="New hires learn from the best person on the line" body="A lesson per skill: the expert's steps and reasons, a 3D twin, narration and live practice feedback." to="/learn">
            <LessonMini />
          </Tile>
          <Tile className="md:col-span-2" eyebrow="Selling skill data" title="Verified skills, licensed to robot makers" body="Consented motion, gaze and text, with a certificate. The expert earns on every licence." to="/exchange">
            <EarningsMini />
          </Tile>
          <Tile eyebrow="Robot teaching" title="Trains a policy in sim" body="Randomised demos, behaviour cloning, GR00T baseline." to="/robot/sk_sort">
            <TrialsMini />
          </Tile>
          <Tile eyebrow="Work instructions" title="SOPs write themselves" body="Illustrated standard work from every capture." to="/skills/sk_sort?tab=sop">
            <SopMini />
          </Tile>
          <Tile className="md:col-span-2" eyebrow="Quality and safety" title="Did they check before they acted?" body="Compare any run with the expert's. Gaze shows whether the gauge was read before the valve opened." to="/skills/sk_valve">
            <GazeMini />
          </Tile>
          <Tile eyebrow="Multilingual" title="Taught in their language" body="The tutor narrates and answers in the trainee's language." to="/learn/sk_sort">
            <LangMini />
          </Tile>
          <Tile eyebrow="Retirement capture" title="Before they leave" body="Record a retiring expert's skills while they are still here." to="/studio">
            <div className="flex h-full flex-col justify-end gap-4">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-ion to-[#1b6f8a] text-xs font-semibold text-ink-950">MC</span>
                <div className="text-xs">
                  <div className="font-medium text-fg">Maria Chen</div>
                  <div className="telemetry text-fg-subtle">22 yrs · 6 skills captured</div>
                </div>
              </div>
              <p className="flex gap-2 text-[13px] text-fg-muted">
                <Quote className="size-4 shrink-0 text-ion" />
                <span>Twenty-two years of small tricks, captured in an afternoon at her own bench.</span>
              </p>
            </div>
          </Tile>
        </div>
        <p className="mt-4 flex items-center gap-1.5 text-xs text-fg-faint">
          <Sparkles className="size-3.5" /> Examples use the seeded demo skills.
        </p>
      </div>
    </section>
  )
}
