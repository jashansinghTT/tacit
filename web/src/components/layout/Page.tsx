import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

/** Standard app page container (everything except the landing page). */
export function Page({ children, className, wide, testId }: { children: ReactNode; className?: string; wide?: boolean; testId?: string }) {
  return (
    <main id="main" data-testid={testId} className={cn('mx-auto w-full px-4 pt-6 pb-24 lg:px-6', wide ? 'max-w-[1680px]' : 'max-w-[1440px]', className)}>
      {children}
    </main>
  )
}

export interface Crumb {
  label: string
  to?: string
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  crumbs,
  meta,
  className,
}: {
  title: ReactNode
  eyebrow?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  crumbs?: Crumb[]
  meta?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between', className)}>
      <div className="min-w-0">
        {crumbs && (
          <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-xs text-fg-subtle">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3 text-fg-faint" />}
                {c.to ? (
                  <Link to={c.to} className="hover:text-fg">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-fg-muted">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="text-[28px] leading-tight font-medium tracking-[-0.03em] text-fg lg:text-[32px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-fg-muted">{description}</p>}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
