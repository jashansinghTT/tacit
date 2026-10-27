import { useRef, type HTMLAttributes, type PointerEvent, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
  flat?: boolean
  pad?: boolean
  as?: 'section' | 'div' | 'article' | 'aside'
  bodyClassName?: string
}

/** The graphite surface every block of the app sits on. */
export function Panel({ title, eyebrow, actions, flat, pad = true, as: Tag = 'section', className, bodyClassName, children, ...rest }: PanelProps) {
  const hasHeader = title || eyebrow || actions
  return (
    <Tag className={cn(flat ? 'panel-flat' : 'panel', 'relative flex min-w-0 flex-col', className)} {...rest}>
      {hasHeader && (
        <header className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
            {title && <h2 className="truncate text-[13px] font-medium tracking-[-0.01em] text-fg">{title}</h2>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cn('min-w-0 flex-1', pad && 'p-4', bodyClassName)}>{children}</div>
    </Tag>
  )
}

/**
 * A pointer-following light with a lit edge. Adapted from the 21st.dev "Spotlight" component
 * (kevingirelli) without the Radix slot dependency. Updates two CSS variables per frame.
 */
export function Spotlight({
  className,
  children,
  size = 360,
  color = 'var(--color-ion)',
  ring = true,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { size?: number; color?: string; ring?: boolean }) {
  const frame = useRef(0)
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return
    const el = e.currentTarget
    const { clientX, clientY } = e
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect()
      el.style.setProperty('--spot-x', `${clientX - r.left}px`)
      el.style.setProperty('--spot-y', `${clientY - r.top}px`)
    })
  }
  const circle = `${size}px circle at var(--spot-x, 50%) var(--spot-y, 50%)`
  const mask = 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)'
  const light = 'pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100 group-focus-within/spot:opacity-100'
  return (
    <div className={cn('group/spot relative isolate', className)} onPointerMove={onMove} {...rest}>
      <span
        aria-hidden
        className={cn(light, '-z-10')}
        style={{ background: `radial-gradient(${circle}, color-mix(in oklab, ${color} 9%, transparent), transparent 70%)` }}
      />
      {ring && (
        <span
          aria-hidden
          className={cn(light, '-inset-px z-10 p-px')}
          style={{
            background: `radial-gradient(${circle}, color-mix(in oklab, ${color} 55%, transparent), transparent 60%)`,
            mask,
            maskComposite: 'exclude',
            WebkitMask: mask,
            WebkitMaskComposite: 'xor',
          }}
        />
      )}
      {children}
    </div>
  )
}

export function Divider({ className, vertical }: { className?: string; vertical?: boolean }) {
  return <div className={cn(vertical ? 'w-px self-stretch' : 'h-px w-full', 'bg-line', className)} aria-hidden />
}
