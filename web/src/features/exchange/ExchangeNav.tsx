import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Coins, Library, Store } from 'lucide-react'
import { useUsers } from '@/lib/api/queries'
import { personaOf, useApp, type PersonaId } from '@/lib/store'
import { cn } from '@/lib/cn'
import { Avatar, Badge } from '@/components/ui'

const LINKS = [
  { to: '/exchange', label: 'Browse', icon: Store, end: true, testId: 'exnav-browse' },
  { to: '/library', label: 'Library', icon: Library, end: false, testId: 'exnav-library', hint: 'Packs you licensed' },
  { to: '/earnings', label: 'Earnings', icon: Coins, end: false, testId: 'exnav-earnings', hint: 'Royalties you earned' },
]

/** The exchange's own tabs: browse listings, the buyer's library, the expert's earnings. */
export function ExchangeNav() {
  const { pathname } = useLocation()
  const persona = useApp((s) => s.persona)
  const users = useUsers()
  const me = users.data?.find((u) => u.id === persona)
  const p = personaOf(persona)
  const active = (to: string, end: boolean) => (end ? pathname === to || /^\/exchange\/(?!sell)/.test(pathname) : pathname.startsWith(to))
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line">
      <nav aria-label="Skill Exchange" className="-mb-px flex items-center gap-1">
        {LINKS.map((l) => {
          const on = active(l.to, l.end)
          return (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              data-testid={l.testId}
              title={l.hint}
              className={cn('relative inline-flex h-11 items-center gap-2 rounded-t-sm px-3 text-sm font-medium transition-colors', on ? 'text-fg' : 'text-fg-subtle hover:text-fg-muted')}
            >
              <l.icon className="size-4" aria-hidden />
              {l.label}
              {on && <motion.span layoutId="exnav-underline" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ion shadow-[0_0_12px_rgb(60_215_255/0.8)]" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            </NavLink>
          )
        })}
      </nav>
      <div className="flex items-center gap-2 pb-2 text-xs text-fg-subtle" data-testid="exnav-persona">
        <span className="hidden sm:inline">Viewing as</span>
        <Avatar name={me?.name ?? p.name} src={me?.avatar} size={20} />
        <span className="text-fg-muted">{me?.name ?? p.name}</span>
        <Badge tone={p.role === 'buyer' ? 'violet' : p.role === 'expert' ? 'ion' : 'neutral'}>{p.roleLabel}</Badge>
      </div>
    </div>
  )
}

/** A one-click persona switch for the places where the flow changes hands (expert ↔ buyer). */
export function useSwitchPersona() {
  const setPersona = useApp((s) => s.setPersona)
  const navigate = useNavigate()
  return (id: PersonaId, to?: string) => {
    setPersona(id)
    if (to) navigate(to)
  }
}
