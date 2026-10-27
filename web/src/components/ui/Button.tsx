import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'glass' | 'white'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

const base =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium ' +
  'transition-[background-color,color,box-shadow,transform,opacity] duration-150 ease-out ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-2'

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-ion text-ion-ink shadow-[0_0_0_1px_rgb(60_215_255/0.6),0_8px_24px_-8px_rgb(60_215_255/0.6),inset_0_1px_0_rgb(255_255_255/0.45)] hover:bg-[#6ee2ff]',
  secondary:
    'bg-ink-700 text-fg shadow-[0_0_0_1px_var(--color-line-strong),inset_0_1px_0_rgb(255_255_255/0.06)] hover:bg-ink-600',
  outline: 'bg-transparent text-fg shadow-[0_0_0_1px_var(--color-line-strong)] hover:bg-white/[0.04] hover:shadow-[0_0_0_1px_var(--color-line-bright)]',
  ghost: 'bg-transparent text-fg-muted hover:bg-white/[0.05] hover:text-fg',
  danger: 'bg-fault/12 text-fault shadow-[0_0_0_1px_rgb(255_93_93/0.35)] hover:bg-fault/20',
  glass: 'liquid-glass text-fg hover:bg-white/[0.06]',
  white: 'bg-fg text-ink-950 hover:bg-white shadow-[0_8px_24px_-10px_rgb(255_255_255/0.5)]',
}

const sizes: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-xs rounded-sm',
  sm: 'h-8 px-3 text-[13px] rounded-md',
  md: 'h-10 px-4 text-sm rounded-md',
  lg: 'h-12 px-6 text-[15px] rounded-lg',
}

interface CommonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  iconRight?: ReactNode
  loading?: boolean
  pill?: boolean
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & CommonProps

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconRight, loading, pill, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], pill && 'rounded-full', className)}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
      {iconRight}
    </button>
  )
})

export type ButtonLinkProps = LinkProps & CommonProps

export function ButtonLink({ variant = 'secondary', size = 'md', icon, iconRight, pill, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], pill && 'rounded-full', className)} {...rest}>
      {icon}
      {children}
      {iconRight}
    </Link>
  )
}

export function IconButton({
  label,
  className,
  size = 'sm',
  variant = 'ghost',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: ButtonSize; variant?: ButtonVariant }) {
  const sq = { xs: 'size-7', sm: 'size-8', md: 'size-10', lg: 'size-12' }[size]
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(base, variants[variant], sq, 'rounded-md p-0', className)}
      {...rest}
    >
      {children}
    </button>
  )
}
