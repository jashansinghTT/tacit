import type { HTMLAttributes, ReactNode } from 'react'
import { Cpu, Database, FlaskConical, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Backend, ServedBy, VerificationStatus } from '@/lib/api'

export type Tone = 'neutral' | 'ion' | 'ok' | 'warn' | 'fault' | 'violet'

const tones: Record<Tone, string> = {
  neutral: 'bg-white/[0.04] text-fg-muted shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
  ion: 'bg-ion-soft text-ion shadow-[inset_0_0_0_1px_rgb(60_215_255/0.28)]',
  ok: 'bg-ok-soft text-ok shadow-[inset_0_0_0_1px_rgb(61_220_151/0.28)]',
  warn: 'bg-warn-soft text-warn shadow-[inset_0_0_0_1px_rgb(255_181_71/0.3)]',
  fault: 'bg-fault-soft text-fault shadow-[inset_0_0_0_1px_rgb(255_93_93/0.3)]',
  violet: 'bg-[rgb(167_139_250/0.12)] text-data-right shadow-[inset_0_0_0_1px_rgb(167_139_250/0.3)]',
}

const dots: Record<Tone, string> = {
  neutral: 'bg-fg-subtle',
  ion: 'bg-ion',
  ok: 'bg-ok',
  warn: 'bg-warn',
  fault: 'bg-fault',
  violet: 'bg-data-right',
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
  dot?: boolean
  pulse?: boolean
  icon?: ReactNode
  mono?: boolean
  size?: 'sm' | 'md'
}

export function Badge({ tone = 'neutral', dot, pulse, icon, mono, size = 'sm', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-medium',
        size === 'sm' ? 'h-5 px-2 text-[11px]' : 'h-6 px-2.5 text-xs',
        mono && 'telemetry',
        tones[tone],
        className,
      )}
      {...rest}
    >
      {dot && <span className={cn('size-1.5 rounded-full', dots[tone], pulse && 'animate-pulse-dot')} aria-hidden />}
      {icon}
      {children}
    </span>
  )
}

export function StatusDot({ tone = 'ok', pulse, className }: { tone?: Tone; pulse?: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex size-2', className)} aria-hidden>
      {pulse && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-50', dots[tone])} />}
      <span className={cn('relative inline-flex size-2 rounded-full', dots[tone])} />
    </span>
  )
}

export function VerifiedBadge({ status, score, size }: { status: VerificationStatus; score?: number | null; size?: 'sm' | 'md' }) {
  if (status === 'verified')
    return (
      <Badge tone="ok" size={size} icon={<ShieldCheck className="size-3" aria-hidden />}>
        Verified{score != null && <span className="telemetry opacity-80">{score.toFixed(2)}</span>}
      </Badge>
    )
  if (status === 'suspect')
    return (
      <Badge tone="fault" size={size} icon={<ShieldAlert className="size-3" aria-hidden />}>
        Suspect{score != null && <span className="telemetry opacity-80">{score.toFixed(2)}</span>}
      </Badge>
    )
  return (
    <Badge tone="neutral" size={size} icon={<ShieldQuestion className="size-3" aria-hidden />}>
      Not verified yet
    </Badge>
  )
}

const SKILL_STATUS: Record<string, { label: string; tone: Tone }> = {
  ready: { label: 'Ready', tone: 'ok' },
  processing: { label: 'Processing', tone: 'ion' },
  draft: { label: 'Draft', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'fault' },
}

/** One wording and colour for a skill's status everywhere (cards, tables, headers). */
export function SkillStatusBadge({ status, className, size }: { status: string; className?: string; size?: 'sm' | 'md' }) {
  const m = SKILL_STATUS[status] ?? { label: status, tone: 'neutral' as Tone }
  return (
    <Badge tone={m.tone} dot pulse={status === 'processing'} className={className} size={size}>
      {m.label}
    </Badge>
  )
}

export function ChipTag({ chip, className }: { chip: number | null | undefined; className?: string }) {
  if (chip === null || chip === undefined)
    return (
      <span className={cn('telemetry inline-flex items-center gap-1 rounded-xs bg-white/[0.05] px-1.5 py-px text-[10px] text-fg-subtle', className)}>
        <Cpu className="size-2.5" aria-hidden />
        CPU
      </span>
    )
  return (
    <span className={cn('telemetry inline-flex items-center gap-1 rounded-xs bg-ion-soft px-1.5 py-px text-[10px] text-ion', className)}>
      <span className="size-1 rounded-full bg-ion" aria-hidden />
      chip {chip}
    </span>
  )
}

const BACKEND_LABEL: Record<Backend, string> = { tt: 'Tenstorrent', cpu: 'CPU fallback', cache: 'cached', mock: 'mock' }

/** Models that run on the CPU by design (no chip), as opposed to a TT model falling back. */
const CPU_NATIVE = /mediapipe|mujoco|pytorch|\bsim\b|behaviou?r cloning|bc policy/i

export function isCpuNative(model: string | undefined, chip?: number | null) {
  return Boolean(model && CPU_NATIVE.test(model) && (chip === null || chip === undefined))
}

/**
 * Says which path served a result. The spec asks for a visible badge whenever a result did not
 * come from a Tenstorrent chip; TT results get a quiet chip tag instead.
 */
export function BackendBadge({ backend, model, chip }: { backend: Backend; model?: string; chip?: number | null }) {
  if (backend === 'tt') return null
  if (backend === 'cpu' && isCpuNative(model, chip)) return <ChipTag chip={null} />
  const Icon = backend === 'cache' ? Database : backend === 'mock' ? FlaskConical : Cpu
  return (
    <Badge tone={backend === 'mock' ? 'violet' : 'warn'} title={model ? `${model}: ${BACKEND_LABEL[backend]}` : BACKEND_LABEL[backend]} icon={<Icon className="size-3" aria-hidden />}>
      {BACKEND_LABEL[backend]}
    </Badge>
  )
}

export function ServedByList({ served, className }: { served: ServedBy[] | undefined; className?: string }) {
  if (!served?.length) return null
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)} data-testid="served-by">
      {served.map((s, i) => (
        <span key={`${s.model}-${i}`} className="inline-flex items-center gap-1.5 rounded-sm bg-white/[0.03] px-1.5 py-0.5 text-[11px] text-fg-subtle shadow-[inset_0_0_0_1px_var(--color-line)]">
          <span className="text-fg-muted">{s.model}</span>
          {s.backend === 'tt' ? <ChipTag chip={s.chip} /> : <BackendBadge backend={s.backend} model={s.model} chip={s.chip} />}
          <span className="telemetry">{s.ms < 100 ? s.ms.toFixed(1) : Math.round(s.ms)} ms</span>
        </span>
      ))}
    </div>
  )
}
