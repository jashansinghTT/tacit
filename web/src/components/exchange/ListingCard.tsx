import { Link } from 'react-router-dom'
import { Bot, ShieldCheck, Star } from 'lucide-react'
import type { Listing } from '@/lib/api'
import { fmtMoney } from '@/lib/format'
import { cn } from '@/lib/cn'
import { Badge, Spotlight } from '@/components/ui'

export function ListingCard({ l, className }: { l: Listing; className?: string }) {
  return (
    <Spotlight className={cn('panel group overflow-hidden rounded-xl', className)}>
      <Link to={`/exchange/${l.id}`} className="flex h-full flex-col outline-none" data-testid={`listing-${l.id}`}>
        <div className="relative aspect-[16/9] overflow-hidden bg-ink-900">
          {l.thumb && <img src={l.thumb} alt="" className="size-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-[1.03]" loading="lazy" />}
          <div className="absolute inset-0 bg-gradient-to-t from-ink-850 via-transparent to-transparent" />
          <div className="absolute top-3 left-3 flex gap-1.5">
            {l.verified && (
              <Badge tone="ok" icon={<ShieldCheck className="size-3" />} className="backdrop-blur">
                Verified
              </Badge>
            )}
            {l.demo && <Badge className="bg-ink-950/60 backdrop-blur">Seeded example</Badge>}
          </div>
          <div className="absolute right-3 bottom-3 flex gap-1">
            {l.robot_types.map((r) => (
              <span key={r} className="telemetry inline-flex items-center gap-1 rounded-sm bg-ink-950/70 px-1.5 py-0.5 text-[10px] text-fg-muted backdrop-blur">
                <Bot className="size-3" />
                {r}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-1 flex-col p-4">
          <div className="text-[11px] text-fg-subtle">
            {l.industry} · {l.plant}
          </div>
          <h3 className="mt-1 text-[15px] font-medium tracking-[-0.01em] text-fg">{l.title}</h3>
          <p className="mt-1 line-clamp-2 text-[13px] text-fg-subtle">{l.summary}</p>
          <div className="mt-auto flex items-end justify-between gap-2 pt-4">
            <div>
              <div className="eyebrow">From</div>
              <div className="telemetry text-lg font-medium text-fg">{fmtMoney(l.price.training, l.currency)}</div>
            </div>
            <div className="text-right text-xs text-fg-subtle">
              <div className="flex items-center justify-end gap-1">
                {l.rating != null && (
                  <>
                    <Star className="size-3 fill-warn text-warn" />
                    <span className="telemetry text-fg-muted">{l.rating.toFixed(1)}</span>
                    <span className="text-fg-faint">·</span>
                  </>
                )}
                <span className="telemetry">{l.licenses_sold} licensed</span>
              </div>
              <div className="mt-0.5">by {l.expert.name}</div>
            </div>
          </div>
        </div>
      </Link>
    </Spotlight>
  )
}
