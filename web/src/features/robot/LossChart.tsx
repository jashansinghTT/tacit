import { useId, useMemo, useState } from 'react'
import { cn } from '@/lib/cn'

/**
 * Training loss per epoch on a log axis (behaviour-cloning loss drops by an order of magnitude in
 * the first epochs, then creeps down; a linear axis hides the part worth watching).
 */
export function LossChart({ curve, epochs, live, className }: { curve: [number, number][]; epochs?: number | null; live?: boolean; className?: string }) {
  const id = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)
  const W = 400
  const H = 168
  const pad = { l: 40, r: 12, t: 12, b: 22 }
  const geo = useMemo(() => {
    const pts = curve.filter(([, l]) => l > 0)
    const maxE = Math.max(epochs ?? 0, pts.length ? pts[pts.length - 1][0] : 1, 2)
    const losses = pts.map(([, l]) => l)
    const lo = losses.length ? Math.min(...losses) : 0.01
    const hi = losses.length ? Math.max(...losses) : 1
    const y0 = Math.floor(Math.log10(lo) * 2) / 2
    let y1 = Math.ceil(Math.log10(hi) * 2) / 2
    if (y1 - y0 < 1) y1 = y0 + 1
    const sx = (e: number) => pad.l + ((e - 1) / Math.max(1, maxE - 1)) * (W - pad.l - pad.r)
    const sy = (l: number) => pad.t + (1 - (Math.log10(l) - y0) / (y1 - y0)) * (H - pad.t - pad.b)
    const line = pts.map(([e, l], i) => `${i ? 'L' : 'M'}${sx(e).toFixed(1)},${sy(l).toFixed(1)}`).join('')
    const area = pts.length > 1 ? `${line}L${sx(pts[pts.length - 1][0]).toFixed(1)},${H - pad.b}L${sx(pts[0][0]).toFixed(1)},${H - pad.b}Z` : ''
    const yTicks: number[] = []
    for (let k = Math.ceil(y0 * 2) / 2; k <= y1 + 1e-9; k += 0.5) yTicks.push(10 ** k)
    const step = maxE <= 10 ? 1 : maxE <= 30 ? 5 : 10
    const xTicks = [1]
    for (let e = step; e <= maxE; e += step) if (e !== 1) xTicks.push(e)
    return { pts, line, area, sx, sy, yTicks, xTicks, maxE }
  }, [curve, epochs, pad.b, pad.l, pad.r, pad.t])
  const last = geo.pts[geo.pts.length - 1]
  const h = hover !== null ? geo.pts[hover] : null
  return (
    <div className={cn('relative', className)} data-testid="loss-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={last ? `Training loss, epoch ${last[0]}: ${last[1].toFixed(4)}` : 'Training loss (no epochs yet)'}
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          if (!geo.pts.length) return
          const r = e.currentTarget.getBoundingClientRect()
          const x = ((e.clientX - r.left) / r.width) * W
          let best = 0
          for (let i = 1; i < geo.pts.length; i++) if (Math.abs(geo.sx(geo.pts[i][0]) - x) < Math.abs(geo.sx(geo.pts[best][0]) - x)) best = i
          setHover(best)
        }}
      >
        <defs>
          <linearGradient id={`${id}-a`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#3cd7ff" stopOpacity="0.28" />
            <stop offset="1" stopColor="#3cd7ff" stopOpacity="0" />
          </linearGradient>
          <filter id={`${id}-g`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>
        {geo.yTicks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={geo.sy(v)} y2={geo.sy(v)} stroke="rgb(255 255 255 / 0.06)" />
            <text x={pad.l - 6} y={geo.sy(v) + 3} textAnchor="end" className="fill-fg-subtle font-mono text-[9px]">
              {v >= 0.01 ? v.toPrecision(1) : v.toExponential(0)}
            </text>
          </g>
        ))}
        {geo.xTicks.map((e) => (
          <text key={e} x={geo.sx(e)} y={H - 6} textAnchor="middle" className="fill-fg-subtle font-mono text-[9px]">
            {e}
          </text>
        ))}
        {geo.area && <path d={geo.area} fill={`url(#${id}-a)`} />}
        {geo.line && <path d={geo.line} fill="none" stroke="#3cd7ff" strokeWidth="3" opacity="0.45" filter={`url(#${id}-g)`} />}
        {geo.line && <path d={geo.line} fill="none" stroke="#3cd7ff" strokeWidth="1.6" strokeLinejoin="round" />}
        {last && (
          <g>
            {live && (
              <circle cx={geo.sx(last[0])} cy={geo.sy(last[1])} r="7" fill="#3cd7ff" opacity="0.25">
                <animate attributeName="r" values="4;9;4" dur="1.6s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0;0.4" dur="1.6s" repeatCount="indefinite" />
              </circle>
            )}
            <circle cx={geo.sx(last[0])} cy={geo.sy(last[1])} r="3" fill="#fff" stroke="#3cd7ff" strokeWidth="1.5" />
          </g>
        )}
        {h && (
          <g>
            <line x1={geo.sx(h[0])} x2={geo.sx(h[0])} y1={pad.t} y2={H - pad.b} stroke="rgb(255 255 255 / 0.2)" strokeDasharray="2 3" />
            <circle cx={geo.sx(h[0])} cy={geo.sy(h[1])} r="3.5" fill="#3cd7ff" />
          </g>
        )}
        {!geo.pts.length && (
          <text x={W / 2} y={H / 2} textAnchor="middle" className="fill-fg-faint text-[11px]">
            The loss curve appears here, one point per epoch
          </text>
        )}
      </svg>
      {h && (
        <div className="telemetry pointer-events-none absolute top-1 right-2 rounded-xs bg-ink-900/90 px-1.5 py-0.5 text-[10px] text-fg-muted shadow-[inset_0_0_0_1px_var(--color-line)]">
          epoch {h[0]} · loss {h[1].toFixed(4)}
        </div>
      )}
    </div>
  )
}
