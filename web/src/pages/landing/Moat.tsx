import { useReducedMotion } from 'framer-motion'
import { BadgeCheck, Boxes, Coins, Factory, Library } from 'lucide-react'

const POINTS = [
  { icon: Factory, title: 'The supply', body: 'Skill data from inside plants, given with consent. Raw video never leaves the box; only motion, gaze and text do. The box is the only way in.' },
  { icon: Coins, title: 'Royalties', body: 'Experts are paid on every licence, so they opt in and keep recording. The ledger is in the product, not a promise.' },
  { icon: BadgeCheck, title: 'Provenance', body: 'Every listed skill carries a consent record and a VGGT certificate that it came from a real camera, not a generator. That is what makes it licensable.' },
  { icon: Library, title: 'The library effect', body: 'Every plant adds skills. More skills bring more robot makers, and more buyers make recording worth more to the next expert.' },
  { icon: Boxes, title: 'The box', body: 'Nine models on four Tenstorrent chips, local and measured. Running locally is the entry ticket; the four above are the moat.' },
]

export function Moat() {
  const reduce = useReducedMotion()
  return (
    <section className="relative overflow-hidden px-4 py-24 lg:px-6" id="moat" data-testid="landing-moat">
      {!reduce ? (
        <video className="pointer-events-none absolute inset-0 size-full object-cover opacity-35" src="/bg/mesh.mp4" poster="/bg/mesh.jpg" autoPlay muted loop playsInline aria-hidden />
      ) : (
        <img className="pointer-events-none absolute inset-0 size-full object-cover opacity-35" src="/bg/mesh.jpg" alt="" aria-hidden />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink-900 via-ink-900/40 to-ink-900" aria-hidden />
      <div className="relative mx-auto grid max-w-[1680px] gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <div className="eyebrow">Why it is hard to copy</div>
          <h2 className="mt-4 text-[clamp(2.2rem,4vw,3.5rem)] leading-[1.02] font-medium tracking-[-0.035em] text-fg">
            Anyone can run a model.
            <br />
            <span className="text-fg-subtle">Nobody else has the skills.</span>
          </h2>
          <p className="mt-5 max-w-md text-[15px] text-fg-muted">
            The data that teaches robots to work with their hands is inside plants, in the hands of people who have never been asked. Tacit is how it gets out, with consent, proof and pay.
          </p>
        </div>
        <ol className="divide-y divide-line border-y border-line">
          {POINTS.map((p, i) => {
            const Icon = p.icon
            return (
              <li key={p.title} className="grid grid-cols-[auto_1fr] gap-5 py-7 sm:grid-cols-[3rem_auto_1fr]">
                <span className="telemetry hidden pt-1 text-xs text-fg-faint sm:block">0{i + 1}</span>
                <span className="grid size-10 place-items-center rounded-lg bg-ink-800/80 text-ion shadow-[inset_0_0_0_1px_var(--color-line-strong)] backdrop-blur">
                  <Icon className="size-5" strokeWidth={1.75} />
                </span>
                <div>
                  <h3 className="text-lg font-medium tracking-[-0.02em] text-fg">{p.title}</h3>
                  <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-fg-muted">{p.body}</p>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
