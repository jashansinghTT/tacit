import { motion } from 'framer-motion'
import { Factory, UserRound } from 'lucide-react'
import { fmtMoney, fmtPct } from '@/lib/format'
import { cn } from '@/lib/cn'
import { royaltySplit } from './meta'

/** Expert vs plant share of one license fee, as a bar with both amounts. */
export function RoyaltyBar({
  amount,
  split,
  expertName,
  plantName,
  currency = 'USD',
  className,
  compact,
}: {
  amount: number
  split: { expert: number; plant: number }
  expertName: string
  plantName: string
  currency?: string
  className?: string
  compact?: boolean
}) {
  const r = royaltySplit(amount, split)
  return (
    <div className={cn('min-w-0', className)} data-testid="royalty-bar">
      <div className="flex h-2 overflow-hidden rounded-full bg-white/[0.06]" role="img" aria-label={`${fmtPct(split.expert)} to ${expertName}, ${fmtPct(split.plant)} to ${plantName}`}>
        <motion.div className="h-full bg-ion shadow-[0_0_12px_rgb(60_215_255/0.6)]" initial={false} animate={{ width: `${split.expert * 100}%` }} transition={{ type: 'spring', stiffness: 260, damping: 30 }} />
        <motion.div className="h-full bg-data-right/70" initial={false} animate={{ width: `${split.plant * 100}%` }} transition={{ type: 'spring', stiffness: 260, damping: 30 }} />
      </div>
      <div className={cn('mt-2 grid grid-cols-2 gap-3', compact ? 'text-[11px]' : 'text-xs')}>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-fg-subtle">
            <UserRound className="size-3 text-ion" aria-hidden />
            <span className="truncate">{expertName}</span>
            <span className="telemetry text-fg-faint">{fmtPct(split.expert)}</span>
          </div>
          <div className={cn('telemetry mt-0.5 font-medium text-ion', compact ? 'text-sm' : 'text-base')} data-testid="royalty-expert">
            {fmtMoney(r.expert, currency, 2)}
          </div>
        </div>
        <div className="min-w-0 text-right">
          <div className="flex items-center justify-end gap-1.5 text-fg-subtle">
            <span className="telemetry text-fg-faint">{fmtPct(split.plant)}</span>
            <span className="truncate" title={plantName}>
              {compact ? 'The plant' : plantName}
            </span>
            <Factory className="size-3 text-data-right" aria-hidden />
          </div>
          <div className={cn('telemetry mt-0.5 font-medium text-data-right', compact ? 'text-sm' : 'text-base')} data-testid="royalty-plant">
            {fmtMoney(r.plant, currency, 2)}
          </div>
        </div>
      </div>
    </div>
  )
}
