import { cn } from '@/lib/cn'
import type { ServedBy } from '@/lib/api'
import { BackendBadge, ChipTag } from '@/components/ui'

/**
 * Which model served a result, on which chip, and how long it took. A model that runs on the CPU
 * by design (MediaPipe: no chip) gets a plain CPU tag; "CPU fallback" is kept for a chip model
 * whose chip did not answer.
 */
export function ServedByRow({ served, className }: { served: ServedBy[] | undefined; className?: string }) {
  if (!served?.length) return null
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)} data-testid="served-by">
      {served.map((s, i) => (
        <span key={`${s.model}-${i}`} className="inline-flex items-center gap-1.5 rounded-sm bg-white/[0.03] px-1.5 py-0.5 text-[11px] text-fg-subtle shadow-[inset_0_0_0_1px_var(--color-line)]">
          <span className="text-fg-muted">{s.model}</span>
          {s.backend === 'tt' || (s.backend === 'cpu' && s.chip == null) ? <ChipTag chip={s.backend === 'tt' ? s.chip : null} /> : <BackendBadge backend={s.backend} model={s.model} />}
          <span className="telemetry">{s.ms < 100 ? s.ms.toFixed(1) : Math.round(s.ms)} ms</span>
        </span>
      ))}
    </div>
  )
}
