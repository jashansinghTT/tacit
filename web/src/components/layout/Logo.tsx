import { cn } from '@/lib/cn'

/** The Tacit mark: a finger's joint chain bending toward a point, drawn as a lit skeleton. */
export function LogoMark({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <linearGradient id="tacit-mark" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#3cd7ff" />
          <stop offset="1" stopColor="#b6f1ff" />
        </linearGradient>
      </defs>
      <rect x="0.75" y="0.75" width="22.5" height="22.5" rx="6" fill="#0c0e10" stroke="rgb(255 255 255 / 0.14)" strokeWidth="1" />
      <path d="M6 18.5 L9.6 12.6 L14.2 9.4 L18.2 8.6" fill="none" stroke="url(#tacit-mark)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6" cy="18.5" r="1.7" fill="#3cd7ff" />
      <circle cx="9.6" cy="12.6" r="1.35" fill="#3cd7ff" />
      <circle cx="14.2" cy="9.4" r="1.2" fill="#8be9ff" />
      <circle cx="18.2" cy="8.6" r="1.8" fill="#fff" />
      <circle cx="18.2" cy="8.6" r="3.4" fill="none" stroke="#3cd7ff" strokeOpacity="0.45" strokeWidth="0.8" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-[-0.03em] text-fg">tacit</span>
    </span>
  )
}
