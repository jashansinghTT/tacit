// Form controls: Switch, Checkbox row, Slider, TextInput, Select.
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { Check, ChevronDown, Lock } from 'lucide-react'
import { cn } from '@/lib/cn'

export function Switch({ checked, onChange, label, disabled, className }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40',
        checked ? 'bg-ion shadow-[0_0_12px_rgb(60_215_255/0.5)]' : 'bg-ink-600 shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
        className,
      )}
    >
      <span className={cn('inline-block size-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  )
}

interface CheckRowProps {
  checked: boolean
  onChange?: (v: boolean) => void
  title: ReactNode
  description?: ReactNode
  locked?: boolean
  tone?: 'ion' | 'fault'
  testId?: string
}

/** A large consent-style checkbox row. Locked rows cannot change (raw video, face: never shared). */
export function CheckRow({ checked, onChange, title, description, locked, tone = 'ion', testId }: CheckRowProps) {
  const id = useId()
  return (
    <label
      htmlFor={id}
      data-testid={testId}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg p-3.5 transition-colors',
        locked ? 'cursor-not-allowed bg-white/[0.02] shadow-[inset_0_0_0_1px_var(--color-line)]' : checked ? 'bg-ion/[0.06] shadow-[inset_0_0_0_1px_rgb(60_215_255/0.35)]' : 'bg-white/[0.02] shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-white/[0.04]',
      )}
    >
      <input id={id} type="checkbox" className="peer sr-only" checked={checked} disabled={locked} onChange={(e) => onChange?.(e.target.checked)} />
      <span
        className={cn(
          'mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[4px] transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ion',
          locked ? 'bg-fault-soft text-fault shadow-[inset_0_0_0_1px_rgb(255_93_93/0.4)]' : checked ? (tone === 'ion' ? 'bg-ion text-ion-ink' : 'bg-fault text-white') : 'shadow-[inset_0_0_0_1.5px_var(--color-line-bright)]',
        )}
        aria-hidden
      >
        {locked ? <Lock className="size-3" /> : checked && <Check className="size-3.5" strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-fg">{title}</span>
        {description && <span className="mt-0.5 block text-xs text-fg-subtle">{description}</span>}
      </span>
    </label>
  )
}

export function Slider({ value, onChange, min = 0, max = 1, step = 0.01, label, className, testId }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label: string; className?: string; testId?: string }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <input
      type="range"
      aria-label={label}
      data-testid={testId}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn('tacit-range h-1.5 w-full cursor-pointer appearance-none rounded-full', className)}
      style={{ background: `linear-gradient(to right, var(--color-ion) ${pct}%, var(--color-ink-600) ${pct}%)` }}
    />
  )
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }>(function TextInput({ icon, className, ...rest }, ref) {
  return (
    <div className={cn('relative flex items-center', className)}>
      {icon && <span className="pointer-events-none absolute left-3 text-fg-subtle">{icon}</span>}
      <input
        ref={ref}
        className={cn(
          'h-10 w-full rounded-md bg-ink-900 text-sm text-fg placeholder:text-fg-faint shadow-[inset_0_0_0_1px_var(--color-line-strong)] transition-shadow outline-none focus:shadow-[inset_0_0_0_1px_var(--color-ion),0_0_0_3px_rgb(60_215_255/0.15)]',
          icon ? 'pr-3 pl-9' : 'px-3',
        )}
        {...rest}
      />
    </div>
  )
})

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn('relative inline-flex items-center', className)}>
      <select
        className="h-9 w-full cursor-pointer appearance-none rounded-md bg-ink-900 pr-8 pl-3 text-[13px] text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)] outline-none focus:shadow-[inset_0_0_0_1px_var(--color-ion)]"
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-fg-subtle" />
    </div>
  )
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-xs font-medium text-fg-muted">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-fg-subtle">{hint}</span>}
    </div>
  )
}
