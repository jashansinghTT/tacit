import { Gauge } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { ServedBy } from '@/lib/api'
import { BackendBadge, ChipTag, Panel } from '@/components/ui'

const ROWS: { key: string; label: string; chip: number | null; budget: number }[] = [
  { key: 'mediapipe', label: 'MediaPipe · hands, pose, face', chip: null, budget: 60 },
  { key: 'hamer', label: 'HaMeR · 3D hands', chip: 0, budget: 100 },
  { key: 'gaze', label: 'Gaze-LLE · gaze target', chip: 0, budget: 100 },
  { key: 'rfdetr', label: 'RF-DETR · parts', chip: 0, budget: 100 },
]

/** Per-model latency of the last analysed frame, with the chip that served it. */
export function LatencyHud({ timing, served, stats, live }: { timing: Record<string, number>; served: ServedBy[]; stats: { sent: number; analysed: number; dropped: number; fps: number; lagMs: number }; live: boolean }) {
  const byModel = (key: string) => served.find((s) => s.model.toLowerCase().replace(/[^a-z]/g, '').includes(key.replace('gaze', 'gazelle').replace(/[^a-z]/g, '')))
  return (
    <Panel title="Latency" eyebrow="per frame, live" actions={<Gauge className="size-4 text-fg-subtle" />} data-testid="latency-hud">
      <ul className="space-y-2.5">
        {ROWS.map((r) => {
          const s = byModel(r.key)
          // HaMeR runs once per hand: the backend reports hamer_left / hamer_right
          const perHand = Object.entries(timing).filter(([k]) => k.startsWith(`${r.key}_`)).map(([, v]) => v)
          const ms = timing[r.key] ?? (perHand.length ? perHand.reduce((a, b) => a + b, 0) : undefined) ?? s?.ms
          const hands = perHand.length > 1 ? ` · ${perHand.length} hands` : ''
          const pct = ms ? Math.min(1, ms / r.budget) : 0
          return (
            <li key={r.key} data-testid={`latency-${r.key}`}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5 text-fg-muted">
                  <span className="truncate">
                    {r.label}
                    {hands}
                  </span>
                  {s && s.backend !== 'tt' && s.backend !== 'cpu' ? <BackendBadge backend={s.backend} model={s.model} /> : <ChipTag chip={s?.chip ?? r.chip} />}
                </span>
                <span className={cn('telemetry shrink-0', ms ? 'text-fg' : 'text-fg-faint')}>{ms ? `${ms.toFixed(1)} ms` : '–'}</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.05]">
                <div className={cn('h-full rounded-full transition-[width] duration-200', pct > 0.9 ? 'bg-warn' : 'bg-ion')} style={{ width: `${pct * 100}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
      <div className="mt-4 grid grid-cols-4 gap-2 border-t border-line pt-3 text-center">
        {[
          ['total', timing.total ? `${Math.round(timing.total)}` : '–', 'ms'],
          ['analysed', live ? stats.fps.toFixed(1) : '–', 'fps'],
          ['round trip', live && stats.lagMs ? `${Math.round(stats.lagMs)}` : '–', 'ms'],
          ['skipped', String(stats.dropped), 'frames'],
        ].map(([k, v, u]) => (
          <div key={k}>
            <div className="telemetry text-sm text-fg">{v}</div>
            <div className="eyebrow text-[9px]">
              {k} · {u}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}
