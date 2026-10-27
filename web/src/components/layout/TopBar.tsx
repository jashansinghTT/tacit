import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Menu, Play, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { MOCK } from '@/lib/api'
import { useBox, useHealth, useUsers } from '@/lib/api/queries'
import { PERSONAS, useApp, type PersonaId } from '@/lib/store'
import { Avatar, Badge, StatusDot } from '@/components/ui'
import { Logo } from './Logo'

export const NAV = [
  { to: '/studio', label: 'Studio' },
  { to: '/skills', label: 'Skills' },
  { to: '/learn', label: 'Learn' },
  { to: '/robot', label: 'Robot Lab' },
  { to: '/exchange', label: 'Exchange' },
  { to: '/team', label: 'Team' },
  { to: '/box', label: 'Box' },
]

function BoxPill() {
  const health = useHealth()
  const box = useBox()
  const down = health.isError || box.isError
  const t = box.data?.totals
  const models = box.data?.chips.flatMap((c) => c.models) ?? []
  const busy = models.filter((m) => m.busy).map((m) => m.name)
  const unhealthy = models.filter((m) => !m.healthy && !m.busy).map((m) => m.name)
  const tone = down ? 'fault' : t && t.healthy < t.models ? 'warn' : 'ok'
  const title = down
    ? 'The box is not answering'
    : [unhealthy.length ? `Down: ${unhealthy.join(', ')}` : 'All models up', busy.length ? `Busy: ${busy.join(', ')}` : ''].filter(Boolean).join(' · ')
  return (
    <Link
      to="/box"
      className="hidden h-8 items-center gap-2 rounded-full bg-white/[0.03] px-3 text-xs text-fg-muted shadow-[inset_0_0_0_1px_var(--color-line)] transition-colors hover:bg-white/[0.06] hover:text-fg xl:inline-flex"
      data-testid="box-pill"
      title={title}
    >
      <StatusDot tone={tone} pulse={!down} />
      {down ? (
        <span>Box offline</span>
      ) : t ? (
        <span className="telemetry">
          {t.healthy}/{t.models} models · {t.chips} chips
        </span>
      ) : (
        <span>Connecting…</span>
      )}
    </Link>
  )
}

function PersonaSwitcher() {
  const { persona, setPersona } = useApp()
  const users = useUsers()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const nameOf = (id: string) => users.data?.find((u) => u.id === id)?.name ?? PERSONAS.find((p) => p.id === id)?.name ?? id
  const avatarOf = (id: string) => users.data?.find((u) => u.id === id)?.avatar
  const titleOf = (id: string) => users.data?.find((u) => u.id === id)?.title
  const current = PERSONAS.find((p) => p.id === persona)!
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  const pick = (id: PersonaId) => {
    setPersona(id)
    setOpen(false)
  }
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="persona-switcher"
        className="flex h-9 items-center gap-2 rounded-full bg-white/[0.03] py-1 pr-2.5 pl-1 shadow-[inset_0_0_0_1px_var(--color-line)] transition-colors hover:bg-white/[0.06]"
      >
        <Avatar name={nameOf(persona)} src={avatarOf(persona)} size={26} />
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-xs font-medium text-fg">{nameOf(persona)}</span>
          <span className="block text-[10px] text-fg-subtle">{current.roleLabel}</span>
        </span>
        <ChevronDown className={cn('size-3.5 text-fg-subtle transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 mt-2 w-72 origin-top-right rounded-xl bg-ink-750/95 p-1.5 shadow-raised backdrop-blur-xl"
          >
            <div className="eyebrow px-2.5 pt-1.5 pb-2">View the demo as</div>
            {PERSONAS.map((p) => (
              <button
                key={p.id}
                role="menuitemradio"
                aria-checked={p.id === persona}
                data-testid={`persona-${p.id}`}
                onClick={() => pick(p.id)}
                className={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]', p.id === persona && 'bg-white/[0.04]')}
              >
                <Avatar name={nameOf(p.id)} src={avatarOf(p.id)} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[13px] font-medium text-fg">
                    {nameOf(p.id)}
                    <Badge tone={p.id === persona ? 'ion' : 'neutral'}>{p.roleLabel}</Badge>
                  </span>
                  <span className="block truncate text-[11px] text-fg-subtle">{titleOf(p.id) ?? ''}</span>
                </span>
                {p.id === persona && <Check className="size-4 text-ion" />}
              </button>
            ))}
            <div className="mt-1 border-t border-line px-1 pt-1.5">
              <button
                onClick={() => {
                  setOpen(false)
                  navigate(current.home)
                }}
                className="w-full rounded-md px-2 py-1.5 text-left text-xs text-fg-muted hover:bg-white/[0.05] hover:text-fg"
              >
                Go to {current.roleLabel.toLowerCase()} home →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function TopBar() {
  const location = useLocation()
  const openTour = useApp((s) => s.openTour)
  const [mobile, setMobile] = useState(false)
  const landing = location.pathname === '/'
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => setMobile(false), [location.pathname])
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <header
      className={cn(
        'sticky top-0 z-40 h-[var(--header-h)] transition-[background-color,box-shadow,backdrop-filter] duration-300',
        landing && !scrolled ? 'bg-transparent' : 'bg-ink-900/80 shadow-[0_1px_0_var(--color-line)] backdrop-blur-xl',
      )}
    >
      <div className="mx-auto flex h-full max-w-[1680px] items-center gap-4 px-4 lg:px-6">
        <Link to="/" className="shrink-0 rounded-md" aria-label="Tacit home" data-testid="nav-home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="ml-4 hidden items-center gap-0.5 lg:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              data-testid={`nav-${n.to.slice(1)}`}
              className={({ isActive }) =>
                cn('relative rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors', isActive ? 'text-fg' : 'text-fg-subtle hover:text-fg')
              }
            >
              {({ isActive }) => (
                <>
                  {n.label}
                  {isActive && <motion.span layoutId="nav-active" className="absolute inset-0 -z-10 rounded-md bg-white/[0.06] shadow-[inset_0_0_0_1px_var(--color-line)]" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {MOCK && (
            <Badge tone="violet" title="Built with VITE_TACIT_MOCK=1: data comes from the in-app fake backend">
              Mock data
            </Badge>
          )}
          <BoxPill />
          <button
            onClick={() => openTour(0)}
            data-testid="tour-start"
            className="hidden h-8 items-center gap-1.5 rounded-full bg-ion-soft px-3 text-xs font-medium text-ion shadow-[inset_0_0_0_1px_rgb(60_215_255/0.3)] transition-colors hover:bg-ion/20 sm:inline-flex"
          >
            <Play className="size-3 fill-current" />
            Show me
          </button>
          <PersonaSwitcher />
          <button className="grid size-9 place-items-center rounded-md text-fg-muted hover:bg-white/5 lg:hidden" onClick={() => setMobile((m) => !m)} aria-label="Menu" aria-expanded={mobile}>
            {mobile ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {mobile && (
          <motion.nav
            aria-label="Main mobile"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-line bg-ink-900/95 backdrop-blur-xl lg:hidden"
          >
            <div className="grid grid-cols-2 gap-1 p-3 sm:grid-cols-4">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} className={({ isActive }) => cn('rounded-md px-3 py-2 text-sm', isActive ? 'bg-white/[0.06] text-fg' : 'text-fg-muted')}>
                  {n.label}
                </NavLink>
              ))}
              <button onClick={() => openTour(0)} className="rounded-md px-3 py-2 text-left text-sm text-ion">
                Show me
              </button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}
