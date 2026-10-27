import { Check, X } from 'lucide-react'
import type { EvalTrial } from '@/lib/api'
import { cn } from '@/lib/cn'

/**
 * One cell per randomised trial, filling in as the evaluation runs. Each finished cell can be
 * replayed: the same seed gives the same scene, so "watch" re-runs that exact trial live.
 */
export function TrialGrid({
  total,
  seed,
  trials,
  running,
  onWatch,
}: {
  total: number
  seed: number
  trials: EvalTrial[]
  running: boolean
  onWatch?: (seed: number) => void
}) {
  const n = Math.max(total, trials.length)
  const cols = n <= 10 ? n : n <= 20 ? 10 : n <= 50 ? 10 : 12
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} data-testid="trial-grid">
      {Array.from({ length: n }, (_, i) => {
        const t = trials[i]
        const next = !t && running && i === trials.length
        const label = t
          ? `Trial ${i + 1}, seed ${t.seed}: ${t.success ? 'success' : `failed${t.reason ? ` (${t.reason})` : ''}`}${t.steps ? `, ${t.steps} steps` : ''}. Click to watch it.`
          : `Trial ${i + 1}, seed ${seed + i}: ${next ? 'running' : 'not run yet'}`
        return (
          <button
            key={i}
            type="button"
            disabled={!t || !onWatch}
            onClick={() => t && onWatch?.(t.seed)}
            title={label}
            aria-label={label}
            data-testid="trial-cell"
            data-state={t ? (t.success ? 'success' : 'fail') : next ? 'running' : 'pending'}
            className={cn(
              'group relative grid aspect-square place-items-center rounded-sm text-[10px] transition-[background-color,box-shadow,transform] duration-300',
              !t && !next && 'bg-white/[0.02] text-fg-faint shadow-[inset_0_0_0_1px_var(--color-line)]',
              next && 'animate-pulse bg-ion-soft text-ion shadow-[inset_0_0_0_1px_rgb(60_215_255/0.5)]',
              t?.success && 'bg-ok/15 text-ok shadow-[inset_0_0_0_1px_rgb(61_220_151/0.45)] hover:bg-ok/25',
              t && !t.success && 'bg-fault/15 text-fault shadow-[inset_0_0_0_1px_rgb(255_93_93/0.5)] hover:bg-fault/25',
              t && 'hover:scale-[1.06] disabled:hover:scale-100',
            )}
          >
            {t ? t.success ? <Check className="size-3.5" strokeWidth={2.75} /> : <X className="size-3.5" strokeWidth={2.75} /> : <span className="telemetry">{i + 1}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Failure reasons grouped, most common first. */
export function FailureReasons({ trials }: { trials: EvalTrial[] }) {
  const groups = new Map<string, number[]>()
  for (const t of trials) {
    if (t.success) continue
    const r = t.reason ?? 'unknown'
    groups.set(r, [...(groups.get(r) ?? []), t.seed])
  }
  if (!groups.size) return null
  return (
    <ul className="space-y-1" data-testid="failure-reasons">
      {[...groups.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([reason, seeds]) => (
          <li key={reason} className="flex items-start gap-2 text-[12px]">
            <span className="telemetry mt-px rounded-xs bg-fault-soft px-1 text-[10px] text-fault">{seeds.length}×</span>
            <span className="min-w-0 flex-1 text-fg-muted">{reason}</span>
            <span className="telemetry shrink-0 text-[10px] text-fg-faint">seed {seeds.slice(0, 4).join(', ')}{seeds.length > 4 ? '…' : ''}</span>
          </li>
        ))}
    </ul>
  )
}
