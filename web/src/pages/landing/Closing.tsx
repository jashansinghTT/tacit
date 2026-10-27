import { Link } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { useListings } from '@/lib/api/queries'
import { ButtonLink, Skeleton } from '@/components/ui'
import { ListingCard } from '@/components/exchange/ListingCard'
import { Logo } from '@/components/layout/Logo'

export function ExchangePreview() {
  const listings = useListings({ verified: true })
  const items = (listings.data ?? []).slice(0, 3)
  return (
    <section className="relative px-4 py-16 lg:px-6" data-testid="landing-exchange">
      <div className="mx-auto max-w-[1680px]">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="eyebrow">Skill Exchange</div>
            <h2 className="mt-4 text-[clamp(2.2rem,4vw,3.5rem)] leading-[1.02] font-medium tracking-[-0.035em] text-fg">Skills robot makers can license today.</h2>
            <p className="mt-4 text-[15px] text-fg-muted">Every listing is verified and consented. Licensing is a demo: no payment is taken.</p>
          </div>
          <ButtonLink to="/exchange" variant="outline" pill iconRight={<ArrowRight className="size-4" />}>
            Explore the Skill Exchange
          </ButtonLink>
        </div>
        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {listings.isLoading
            ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-80 rounded-xl" />)
            : items.map((l) => <ListingCard key={l.id} l={l} />)}
        </div>
        {listings.isError && <p className="mt-4 text-sm text-fg-subtle">Listings appear here when the box is reachable.</p>}
      </div>
    </section>
  )
}

export function Cta() {
  const reduce = useReducedMotion()
  return (
    <section className="relative overflow-hidden" data-testid="landing-cta">
      {!reduce ? (
        <video className="pointer-events-none absolute inset-0 size-full object-cover opacity-70" src="/bg/rings.mp4" poster="/bg/rings.jpg" autoPlay muted loop playsInline aria-hidden />
      ) : (
        <img className="pointer-events-none absolute inset-0 size-full object-cover opacity-70" src="/bg/rings.jpg" alt="" aria-hidden />
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[200px] bg-gradient-to-b from-ink-900 to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[200px] bg-gradient-to-t from-ink-900 to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-ink-900/30" aria-hidden />
      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 py-36 text-center">
        <h2 className="font-serif text-[clamp(2.75rem,5.6vw,5.5rem)] leading-[0.98] tracking-[-0.015em] text-white italic">
          Every expert retires.
          <br />
          Their hands do not have to.
        </h2>
        <p className="mt-6 max-w-lg text-[15px] text-fg-muted">Record a skill in an afternoon. Train people the next morning. Teach a robot by the end of the week.</p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <ButtonLink to="/studio" variant="glass" size="lg" pill className="px-7" iconRight={<ArrowRight className="size-4" />}>
            Capture a skill
          </ButtonLink>
          <ButtonLink to="/exchange" variant="white" size="lg" pill className="px-7">
            Explore the Skill Exchange
          </ButtonLink>
        </div>
      </div>
    </section>
  )
}

const FOOT = [
  { title: 'Product', links: [['Studio', '/studio'], ['Skills', '/skills'], ['Learn', '/learn'], ['Robot Lab', '/robot'], ['Skill Exchange', '/exchange'], ['Box', '/box']] },
  { title: 'For', links: [['Experts', '/studio'], ['Trainees', '/learn'], ['Plant managers', '/team'], ['Robot makers', '/exchange']] },
  { title: 'Your space', links: [['Library', '/library'], ['Earnings', '/earnings'], ['Guided demo', '/?tour=1']] },
]

export function Footer() {
  return (
    <footer className="relative border-t border-line px-4 pt-16 pb-10 lg:px-6" data-testid="landing-footer">
      <div className="mx-auto grid max-w-[1680px] gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-[13px] text-fg-subtle">Teach a robot by showing it. Runs on one box inside the plant; raw video never leaves it.</p>
        </div>
        {FOOT.map((c) => (
          <div key={c.title}>
            <div className="eyebrow">{c.title}</div>
            <ul className="mt-4 space-y-2.5">
              {c.links.map(([label, to]) => (
                <li key={label}>
                  <Link to={to} className="text-[13px] text-fg-muted hover:text-fg">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-14 flex max-w-[1680px] flex-col gap-2 border-t border-line pt-6 text-xs text-fg-faint sm:flex-row sm:justify-between">
        <span>© 2026 Tacit. A demo on Tenstorrent Blackhole.</span>
        <span>No payments are taken anywhere in this demo.</span>
      </div>
      <p className="mx-auto mt-3 max-w-[1680px] text-xs text-fg-faint" data-testid="footer-disclaimer">
        Demo personas are fictional. Sample videos are stock footage from Pexels and Pixabay, credited where they play.
      </p>
    </footer>
  )
}
