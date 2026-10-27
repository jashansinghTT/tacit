// Data display primitives: Stat, Meter, ScoreRing, Sparkline, Skeleton, EmptyState, Avatar.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { animate, useReducedMotion } from 'framer-motion'
import { AlertTriangle, Inbox } from 'lucide-react'
import { cn } from '@/lib/cn'
import { initials } from '@/lib/format'
import type { Tone } from './Badge'

const toneText: Record<Tone, string> = {
  neutral: 'text-fg',
  ion: 'text-ion',
  ok: 'text-ok',
  warn: 'text-warn',
  fault: 'text-fault',
  violet: 'text-data-right',
}
const toneBg: Record<Tone, string> = {
  neutral: 'bg-fg-muted',
  ion: 'bg-ion',
  ok: 'bg-ok',
  warn: 'bg-warn',
  fault: 'bg-fault',
  violet: 'bg-data-right',
}
export const toneHex: Record<Tone, string> = {
  neutral: '#a3a9b2',
  ion: '#3cd7ff',
  ok: '#3ddc97',
  warn: '#ffb547',
  fault: '#ff5d5d',
  violet: '#a78bfa',
}

/** Counts up to a number once it changes (telemetry ticking). */
export function Ticker({ value, format, className }: { value: number; format?: (v: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const prev = useRef(value)
  const reduce = useReducedMotion()
  const fmt = format ?? ((v: number) => String(Math.round(v)))
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduce) {
      el.textContent = fmt(value)
      prev.current = value
      return
    }
    const ctl = animate(prev.current, value, {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = fmt(v)
      },
    })
    prev.current = value
    return () => ctl.stop()
    // fmt is a render-time function; re-running on its identity would restart the animation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce])
  return (
    <span ref={ref} className={cn('telemetry', className)}>
      {fmt(value)}
    </span>
  )
}

interface StatProps {
  label: ReactNode
  value: ReactNode
  unit?: ReactNode
  hint?: ReactNode
  tone?: Tone
  className?: string
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
}

export function Stat({ label, value, unit, hint, tone = 'neutral', className, size = 'md', icon }: StatProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="eyebrow flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className={cn('mt-1.5 flex items-baseline gap-1 font-medium tracking-tight', toneText[tone], { sm: 'text-lg', md: 'text-2xl', lg: 'text-4xl' }[size])}>
        <span className="telemetry">{value}</span>
        {unit && <span className="text-[0.55em] font-normal text-fg-subtle">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-fg-subtle">{hint}</div>}
    </div>
  )
}

export function Meter({ value, tone = 'ion', className, label, showValue, height = 4 }: { value: number; tone?: Tone; className?: string; label?: string; showValue?: boolean; height?: number }) {
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="relative flex-1 overflow-hidden rounded-full bg-white/[0.06]"
        style={{ height }}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v * 100)}
      >
        <div className={cn('absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out', toneBg[tone])} style={{ width: `${v * 100}%` }} />
      </div>
      {showValue && <span className="telemetry w-9 text-right text-[11px] text-fg-muted">{Math.round(v * 100)}%</span>}
    </div>
  )
}

export function ScoreRing({ value, size = 120, stroke = 8, tone, label, sub, className }: { value: number | null; size?: number; stroke?: number; tone?: Tone; label?: ReactNode; sub?: ReactNode; className?: string }) {
  const v = value === null ? 0 : Math.max(0, Math.min(1, value))
  const t: Tone = tone ?? (value === null ? 'neutral' : v >= 0.8 ? 'ok' : v >= 0.6 ? 'warn' : 'fault')
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className={cn('relative inline-grid place-items-center', className)} style={{ width: size, height: size }} role="img" aria-label={`${label ?? 'score'} ${Math.round(v * 100)}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={toneHex[t]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset 400ms cubic-bezier(0.16,1,0.3,1), stroke 300ms', filter: `drop-shadow(0 0 6px ${toneHex[t]}80)` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className={cn('telemetry font-medium tracking-tight', toneText[t])} style={{ fontSize: size * 0.26 }}>
            {value === null ? '–' : Math.round(v * 100)}
          </div>
          {sub && <div className="eyebrow -mt-0.5">{sub}</div>}
        </div>
      </div>
    </div>
  )
}

export function Sparkline({ data, width = 120, height = 28, tone = 'ion', className, fill = true }: { data: number[]; width?: number; height?: number; tone?: Tone; className?: string; fill?: boolean }) {
  const path = useMemo(() => {
    if (data.length < 2) return { line: '', area: '' }
    const min = Math.min(...data)
    const max = Math.max(...data)
    const span = max - min || 1
    const pts = data.map((d, i) => [(i / (data.length - 1)) * width, height - 2 - ((d - min) / span) * (height - 4)])
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('')
    return { line, area: `${line}L${width},${height}L0,${height}Z` }
  }, [data, width, height])
  const id = useMemo(() => `spk-${Math.random().toString(36).slice(2, 8)}`, [])
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={toneHex[tone]} stopOpacity="0.28" />
          <stop offset="1" stopColor={toneHex[tone]} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={path.area} fill={`url(#${id})`} />}
      <path d={path.line} fill="none" stroke={toneHex[tone]} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />
}

export function EmptyState({ icon, title, children, action, className }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-14 text-center', className)}>
      <div className="grid size-11 place-items-center rounded-lg bg-white/[0.04] text-fg-subtle shadow-[inset_0_0_0_1px_var(--color-line)]">{icon ?? <Inbox className="size-5" />}</div>
      <div className="text-sm font-medium text-fg">{title}</div>
      {children && <div className="max-w-sm text-[13px] text-fg-subtle">{children}</div>}
      {action}
    </div>
  )
}

/** Plain-language wording for an API failure; the raw message stays available underneath. */
function describeError(error: unknown): { title: string; body: string; detail: string | null } {
  const e = error as { status?: number; code?: string; message?: string }
  const msg = error instanceof Error ? error.message : String(error ?? '')
  if (e?.code === 'network' || e?.status === 0)
    return { title: 'The Tacit box is not answering', body: 'It may be restarting. The top bar turns green when it is back; then try again.', detail: null }
  if (e?.code === 'model_unavailable' || e?.status === 503)
    return { title: 'A model on the box is not available', body: msg || 'One of the models this page needs is not answering right now.', detail: null }
  if (e?.status && e.status >= 500)
    return { title: 'The box hit an error loading this', body: 'Nothing is lost. Try again in a moment; if it keeps happening, the rest of the app still works.', detail: msg.startsWith(String(e.status)) ? msg : `${e.status} · ${msg}` }
  return { title: 'Something did not load', body: msg, detail: null }
}

export function ErrorState({ error, onRetry, className, title, action }: { error: unknown; onRetry?: () => void; className?: string; title?: ReactNode; action?: ReactNode }) {
  const d = describeError(error)
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)} data-testid="error-state">
      <div className="grid size-11 place-items-center rounded-lg bg-fault-soft text-fault">
        <AlertTriangle className="size-5" />
      </div>
      <div className="text-sm font-medium text-fg">{title ?? d.title}</div>
      <div className="max-w-md text-[13px] text-fg-subtle">{d.body}</div>
      {d.detail && <div className="telemetry max-w-md text-[11px] text-fg-faint">{d.detail}</div>}
      {(onRetry || action) && (
        <div className="mt-1 flex items-center gap-3">
          {onRetry && (
            <button onClick={onRetry} className="text-[13px] font-medium text-ion hover:underline">
              Try again
            </button>
          )}
          {action}
        </div>
      )}
    </div>
  )
}

const AVATAR_HUES = ['#3cd7ff', '#a78bfa', '#3ddc97', '#ffb547', '#ff7ab6', '#7aa2ff']

export function Avatar({ name, src, size = 28, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false)
  const hue = AVATAR_HUES[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_HUES.length]
  return (
    <span
      className={cn('relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-medium text-ink-950', className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, ${hue}, ${hue}99)` }}
      aria-hidden
    >
      {src && !broken ? <img src={src} alt="" className="size-full object-cover" onError={() => setBroken(true)} /> : initials(name)}
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="telemetry inline-flex h-5 min-w-5 items-center justify-center rounded-xs bg-white/[0.06] px-1 text-[10px] text-fg-muted shadow-[inset_0_-1px_0_rgb(255_255_255/0.08),0_0_0_1px_var(--color-line)]">{children}</kbd>
}
