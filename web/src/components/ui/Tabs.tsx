import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

export interface TabItem<K extends string> {
  key: K
  label: ReactNode
  icon?: ReactNode
  count?: number
  disabled?: boolean
}

interface TabsProps<K extends string> {
  items: TabItem<K>[]
  value: K
  onChange: (key: K) => void
  className?: string
  size?: 'sm' | 'md'
  label: string
}

/** Underlined tabs with arrow-key navigation (WAI-ARIA tabs pattern, automatic activation). */
export function Tabs<K extends string>({ items, value, onChange, className, size = 'md', label }: TabsProps<K>) {
  const id = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: KeyboardEvent, i: number) => {
    const enabled = items.map((t, k) => (t.disabled ? -1 : k)).filter((k) => k >= 0)
    const pos = enabled.indexOf(i)
    let next = -1
    if (e.key === 'ArrowRight') next = enabled[(pos + 1) % enabled.length]
    else if (e.key === 'ArrowLeft') next = enabled[(pos - 1 + enabled.length) % enabled.length]
    else if (e.key === 'Home') next = enabled[0]
    else if (e.key === 'End') next = enabled[enabled.length - 1]
    if (next >= 0) {
      e.preventDefault()
      refs.current[next]?.focus()
      onChange(items[next].key)
    }
  }
  return (
    <div role="tablist" aria-label={label} className={cn('relative flex items-center gap-1 border-b border-line', className)}>
      {items.map((t, i) => {
        const active = t.key === value
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el
            }}
            role="tab"
            id={`${id}-${t.key}`}
            aria-selected={active}
            aria-controls={`${id}-${t.key}-panel`}
            tabIndex={active ? 0 : -1}
            disabled={t.disabled}
            data-testid={`tab-${t.key}`}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              'relative -mb-px inline-flex items-center gap-2 rounded-t-sm font-medium transition-colors',
              size === 'sm' ? 'h-9 px-2.5 text-[13px]' : 'h-11 px-3 text-sm',
              active ? 'text-fg' : 'text-fg-subtle hover:text-fg-muted',
              t.disabled && 'opacity-40',
            )}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && (
              <span className={cn('telemetry rounded-full px-1.5 text-[10px]', active ? 'bg-ion-soft text-ion' : 'bg-white/[0.05] text-fg-subtle')}>
                {t.count}
              </span>
            )}
            {active && (
              <motion.span
                layoutId={`${id}-underline`}
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ion shadow-[0_0_12px_rgb(60_215_255/0.8)]"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

interface SegmentedProps<K extends string> {
  items: { key: K; label: ReactNode; icon?: ReactNode }[]
  value: K
  onChange: (key: K) => void
  label: string
  className?: string
  size?: 'sm' | 'md'
}

/** A compact segmented control (radio group semantics). */
export function Segmented<K extends string>({ items, value, onChange, label, className, size = 'sm' }: SegmentedProps<K>) {
  const id = useId()
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex items-center gap-0.5 rounded-md bg-ink-900 p-0.5 shadow-[inset_0_0_0_1px_var(--color-line)]', className)}>
      {items.map((it) => {
        const active = it.key === value
        return (
          <button
            key={it.key}
            role="radio"
            aria-checked={active}
            data-testid={`seg-${it.key}`}
            onClick={() => onChange(it.key)}
            className={cn(
              'relative inline-flex items-center gap-1.5 rounded-[5px] font-medium transition-colors',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
              active ? 'text-fg' : 'text-fg-subtle hover:text-fg-muted',
            )}
          >
            {active && (
              <motion.span
                layoutId={`${id}-seg`}
                className="absolute inset-0 rounded-[5px] bg-ink-600 shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_0_0_1px_var(--color-line-strong)]"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative inline-flex items-center gap-1.5">
              {it.icon}
              {it.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
