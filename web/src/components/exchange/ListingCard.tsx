import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Clock, FileSignature, Layers, ShieldCheck, ShieldQuestion } from 'lucide-react'
import type { Listing } from '@/lib/api'
import type { ExListing } from '@/lib/api/exchange'
import { fmtDuration, fmtInt, fmtMoney, fmtScorePct } from '@/lib/format'
import { cn } from '@/lib/cn'
import { Avatar, Badge, Spotlight } from '@/components/ui'
import { MotionSignature } from '@/features/exchange/MotionSignature'
import { robotLabel, verificationScore } from '@/features/exchange/meta'
import { useAvatarOf } from '@/features/exchange/hooks'

/**
 * A listing on the Skill Exchange. The preview is drawn from the expert's motion (body and hand
 * paths), never from video frames: that is all a buyer ever gets.
 */
export function ListingCard({ l: listing, className }: { l: Listing | ExListing; className?: string }) {
  const l = listing as ExListing
  const [hover, setHover] = useState(false)
  const avatarOf = useAvatarOf()
  const score = verificationScore(l)
  const signed = Boolean(l.consent?.signed_at || l.consent?.expert_confirmed)
  const from = Math.min(...Object.values(l.price ?? { training: 0 }))
  return (
    <Spotlight
      className={cn('panel group overflow-hidden rounded-xl', className)}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <Link to={`/exchange/${l.id}`} className="flex h-full flex-col outline-none" data-testid={`listing-${l.id}`}>
        <div className="relative aspect-[16/9] overflow-hidden border-b border-line bg-ink-950">
          <div className="dot-bg absolute inset-0 opacity-60" aria-hidden />
          <MotionSignature skillId={l.skill_id} playing={hover} className="transition-transform duration-500 group-hover:scale-[1.03]" />
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
            {l.verified ? (
              <Badge tone="ok" icon={<ShieldCheck className="size-3" />} className="backdrop-blur" title="VGGT verified: a real camera recording">
                Verified{score != null && <span className="telemetry opacity-80">{fmtScorePct(score)}</span>}
              </Badge>
            ) : (
              <Badge icon={<ShieldQuestion className="size-3" />} className="bg-ink-950/60 backdrop-blur">
                Not verified
              </Badge>
            )}
            {signed && (
              <Badge tone="ion" icon={<FileSignature className="size-3" />} className="backdrop-blur" title="The expert signed what is shared">
                Consent
              </Badge>
            )}
            {l.demo && <Badge className="bg-ink-950/60 backdrop-blur">Seeded example</Badge>}
          </div>
          <div className="absolute right-3 bottom-3 flex gap-1">
            {l.robot_types.map((r) => (
              <span key={r} className="telemetry inline-flex items-center gap-1 rounded-sm bg-ink-950/70 px-1.5 py-0.5 text-[10px] text-fg-muted backdrop-blur">
                <Bot className="size-3" />
                {robotLabel(r)}
              </span>
            ))}
          </div>
          {(l.steps_count != null || l.duration != null) && (
            <div className="telemetry absolute bottom-3 left-3 flex items-center gap-2 text-[10px] text-fg-subtle">
              {l.steps_count != null && (
                <span className="inline-flex items-center gap-1">
                  <Layers className="size-3" />
                  {l.steps_count} steps
                </span>
              )}
              {l.duration != null && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {fmtDuration(l.duration)}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col p-4">
          <div className="truncate text-[11px] text-fg-subtle">
            {l.industry} · {l.plant}
          </div>
          <h3 className="mt-1 text-[15px] font-medium tracking-[-0.01em] text-fg">{l.title}</h3>
          <p className="mt-1 line-clamp-2 text-[13px] text-fg-subtle">{l.summary}</p>
          <div className="mt-auto flex items-end justify-between gap-3 pt-4">
            <div>
              <div className="eyebrow">From</div>
              <div className="telemetry text-lg font-medium text-fg">{fmtMoney(from, l.currency)}</div>
            </div>
            <div className="flex min-w-0 items-center gap-2 text-right text-xs text-fg-subtle">
              <div className="min-w-0">
                <div className="truncate text-fg-muted">{l.expert.name}</div>
                <div className="telemetry text-[11px]" data-testid="licenses-sold">
                  {l.licenses_sold ? `${fmtInt(l.licenses_sold)} licensed` : 'New'}
                </div>
              </div>
              <Avatar name={l.expert.name} src={avatarOf(l.expert.id)} size={28} />
            </div>
          </div>
        </div>
      </Link>
    </Spotlight>
  )
}
