import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowUpRight, Coins, HandCoins, Plus, Store } from 'lucide-react'
import type { ExEarnings, ExListing } from '@/lib/api/exchange'
import { useUsers } from '@/lib/api/queries'
import { fmtDate, fmtInt, fmtMoney, fmtMonth, fmtPct } from '@/lib/format'
import { personaOf, useApp } from '@/lib/store'
import { Page, PageHeader } from '@/components/layout/Page'
import { Avatar, Badge, Button, ButtonLink, EmptyState, ErrorState, Panel, Skeleton, Stat, Ticker } from '@/components/ui'
import { ExchangeNav, useSwitchPersona } from '@/features/exchange/ExchangeNav'
import { useExEarnings, useExListings } from '@/features/exchange/hooks'
import { DEFAULT_PRICE, DEFAULT_SPLIT, LICENSES, royaltySplit } from '@/features/exchange/meta'
import { SellPicker } from '@/features/exchange/SellPicker'

/** The last six months, oldest first, with zero for months without royalties. */
function lastMonths(byMonth: [string, number][], n = 6) {
  const map = new Map(byMonth)
  const latest = byMonth.length ? byMonth[byMonth.length - 1][0] : new Date().toISOString().slice(0, 7)
  const now = new Date().toISOString().slice(0, 7)
  const end = latest > now ? latest : now
  const [y, m] = end.split('-').map(Number)
  const out: { month: string; label: string; amount: number }[] = []
  for (let k = n - 1; k >= 0; k--) {
    const d = new Date(Date.UTC(y, m - 1 - k, 1))
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    out.push({ month: key, label: fmtMonth(key), amount: map.get(key) ?? 0 })
  }
  return out
}

function ChartTip({ active, payload }: { active?: boolean; payload?: { payload: { month: string; amount: number } }[] }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const [y, m] = p.month.split('-').map(Number)
  return (
    <div className="rounded-md bg-ink-750/95 px-3 py-2 text-xs shadow-raised backdrop-blur">
      <div className="text-fg-subtle">{new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</div>
      <div className="telemetry mt-0.5 text-sm font-medium text-ion">{fmtMoney(p.amount, 'USD', 2)}</div>
    </div>
  )
}

function MonthChart({ data }: { data: ExEarnings }) {
  const reduce = useReducedMotion()
  const rows = useMemo(() => lastMonths(data.by_month), [data.by_month])
  return (
    <div className="h-56" data-testid="earnings-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="earn-bar" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#3cd7ff" stopOpacity={1} />
              <stop offset="1" stopColor="#3cd7ff" stopOpacity={0.35} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 0.06)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#6e7580', fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} width={56} tick={{ fill: '#6e7580', fontSize: 11, fontFamily: 'Geist Mono Variable, monospace' }} tickFormatter={(v: number) => fmtMoney(v)} />
          <Tooltip content={<ChartTip />} cursor={{ fill: 'rgb(255 255 255 / 0.04)' }} />
          <Bar dataKey="amount" fill="url(#earn-bar)" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={!reduce} animationDuration={700} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function BySkill({ data, listings }: { data: ExEarnings; listings: ExListing[] }) {
  const rows = useMemo(() => {
    const m = new Map<string, { id: string; title: string; amount: number; count: number }>()
    for (const e of data.entries) {
      const r = m.get(e.listing_id) ?? { id: e.listing_id, title: e.skill_title, amount: 0, count: 0 }
      r.amount += e.amount
      r.count++
      m.set(e.listing_id, r)
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount)
  }, [data.entries])
  const max = Math.max(1, ...rows.map((r) => r.amount))
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const l = listings.find((x) => x.id === r.id)
        return (
          <li key={r.id}>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <Link to={`/exchange/${r.id}`} className="truncate text-fg hover:text-ion">
                {r.title}
              </Link>
              <span className="telemetry shrink-0 text-fg">{fmtMoney(r.amount, 'USD', 2)}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
              <div className="h-full rounded-full bg-ion shadow-[0_0_10px_rgb(60_215_255/0.5)]" style={{ width: `${(r.amount / max) * 100}%` }} />
            </div>
            <div className="mt-1 text-[11px] text-fg-subtle">
              {r.count} {r.count === 1 ? 'license' : 'licenses'}
              {l ? ` · ${fmtPct(l.royalty_split.expert)} share` : ''}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function Ledger({ data }: { data: ExEarnings }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[13px]" data-testid="earnings-ledger">
        <thead>
          <tr className="border-b border-line text-left text-[11px] text-fg-subtle">
            <th className="py-2.5 pr-4 pl-4 font-medium">Date</th>
            <th className="py-2.5 pr-4 font-medium">Skill</th>
            <th className="py-2.5 pr-4 font-medium">Licensed by</th>
            <th className="py-2.5 pr-4 font-medium">License</th>
            <th className="py-2.5 pr-4 text-right font-medium">Your royalty</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {data.entries.map((e, i) => {
            const m = e.license_type ? LICENSES[e.license_type] : null
            return (
              <tr key={`${e.at}-${i}`} className="transition-colors hover:bg-white/[0.02]" data-testid="ledger-row">
                <td className="telemetry py-3 pr-4 pl-4 whitespace-nowrap text-fg-subtle">{fmtDate(e.at, true)}</td>
                <td className="py-3 pr-4">
                  <Link to={`/exchange/${e.listing_id}`} className="text-fg hover:text-ion">
                    {e.skill_title}
                  </Link>
                </td>
                <td className="py-3 pr-4 text-fg-muted">
                  <span className="flex items-center gap-2">
                    <Avatar name={e.buyer || '?'} size={20} />
                    {e.buyer}
                  </span>
                </td>
                <td className="py-3 pr-4">{m ? <Badge icon={<m.icon className="size-3" />}>{m.label}</Badge> : '–'}</td>
                <td className="telemetry py-3 pr-4 text-right font-medium text-ok">+{fmtMoney(e.amount, data.currency, 2)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function NoEarnings({ name, isExpert, onList }: { name: string; isExpert: boolean; onList: () => void }) {
  const switchTo = useSwitchPersona()
  const r = royaltySplit(DEFAULT_PRICE.robot_deploy, DEFAULT_SPLIT)
  return (
    <Panel data-testid="earnings-empty">
      <EmptyState
        icon={<HandCoins className="size-5" />}
        title={isExpert ? 'No royalties yet' : `${name} has no royalties`}
        action={
          isExpert ? (
            <Button variant="primary" size="sm" icon={<Plus className="size-4" />} onClick={onList}>
              List a skill
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => switchTo('u_maria')}>
              View as Maria Chen
            </Button>
          )
        }
      >
        {isExpert
          ? `List a verified skill on the Exchange. When a robot maker licenses it to deploy, you get ${fmtPct(DEFAULT_SPLIT.expert)} of the fee: ${fmtMoney(r.expert, 'USD', 2)} of a ${fmtMoney(DEFAULT_PRICE.robot_deploy)} license, booked here the moment it is issued.`
          : 'Royalties belong to the experts who recorded the skills. Maria Chen is the demo expert.'}
      </EmptyState>
    </Panel>
  )
}

export default function EarningsPage() {
  const persona = useApp((s) => s.persona)
  const p = personaOf(persona)
  const users = useUsers()
  const me = users.data?.find((u) => u.id === persona)
  const name = me?.name ?? p.name
  const earn = useExEarnings()
  const listings = useExListings()
  const [picker, setPicker] = useState(false)
  const mine = useMemo(() => (listings.data ?? []).filter((l) => l.expert.id === persona), [listings.data, persona])
  const d = earn.data
  const thisMonth = d ? (d.by_month.find(([m]) => m === new Date().toISOString().slice(0, 7))?.[1] ?? 0) : 0
  const count = d?.entries.length ?? 0
  const share = mine.length ? mine.reduce((s, l) => s + l.royalty_split.expert, 0) / mine.length : DEFAULT_SPLIT.expert

  return (
    <Page testId="page-earnings">
      <ExchangeNav />
      <PageHeader
        eyebrow="Earnings"
        title={p.role === 'expert' ? `${name.split(' ')[0]}’s royalties` : 'Royalties'}
        description="Experts are paid every time a skill they recorded is licensed. Each license books the expert's share to this ledger the moment it is issued."
        actions={
          p.role === 'expert' ? (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setPicker(true)} data-testid="earnings-list-skill">
              List a skill
            </Button>
          ) : undefined
        }
      />
      {earn.isError ? (
        <Panel>
          <ErrorState error={earn.error} onRetry={() => earn.refetch()} />
        </Panel>
      ) : !d ? (
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-72" />
        </div>
      ) : count === 0 ? (
        <NoEarnings name={name} isExpert={p.role === 'expert'} onList={() => setPicker(true)} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <Panel className="relative overflow-hidden" bodyClassName="flex h-full flex-col p-6">
              <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-ion/10 blur-3xl" />
              <div className="eyebrow flex items-center gap-1.5">
                <Coins className="size-3.5 text-ion" /> Royalties earned
              </div>
              <div className="mt-3 text-5xl font-medium tracking-[-0.03em] text-fg lg:text-6xl" data-testid="earnings-total">
                <Ticker value={d.total} format={(v) => fmtMoney(v, d.currency, 2)} />
              </div>
              <p className="mt-2 text-[13px] text-fg-muted">
                from {fmtInt(count)} {count === 1 ? 'license' : 'licenses'} of {fmtInt(new Set(d.entries.map((e) => e.listing_id)).size)}{' '}
                {new Set(d.entries.map((e) => e.listing_id)).size === 1 ? 'skill' : 'skills'}, paid to {name}.
              </p>
              <div className="mt-auto grid grid-cols-3 gap-4 border-t border-line pt-5">
                <Stat size="sm" label="This month" value={fmtMoney(thisMonth, d.currency, 2)} tone="ion" />
                <Stat size="sm" label="Per license" value={fmtMoney(count ? Math.round((d.total / count) * 100) / 100 : 0, d.currency, 2)} />
                <Stat size="sm" label="Your share" value={fmtPct(share)} hint="of each fee" />
              </div>
            </Panel>
            <Panel eyebrow="By month" title="Royalties over the last six months" actions={<Badge tone="ok" dot>Booked on license</Badge>}>
              <MonthChart data={d} />
            </Panel>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Panel eyebrow="Ledger" title="Every license, newest first" pad={false}>
              <Ledger data={d} />
            </Panel>
            <div className="space-y-4">
              <Panel eyebrow="By skill" title="What earns">
                <BySkill data={d} listings={listings.data ?? []} />
              </Panel>
              {mine.length > 0 && (
                <Panel eyebrow="Your listings" title={`${mine.length} on the Exchange`} pad={false}>
                  <ul className="divide-y divide-line">
                    {mine.map((l) => (
                      <li key={l.id}>
                        <Link to={`/exchange/${l.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02]">
                          <Store className="size-4 shrink-0 text-fg-subtle" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] text-fg">{l.title}</span>
                            <span className="text-[11px] text-fg-subtle">
                              {l.licenses_sold} licensed · from {fmtMoney(Math.min(...Object.values(l.price)), l.currency)}
                            </span>
                          </span>
                          <ArrowUpRight className="size-4 text-fg-faint" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </div>
          </div>
        </>
      )}
      {p.role === 'expert' && count > 0 && (
        <div className="mt-6 flex justify-center">
          <ButtonLink to="/exchange" variant="ghost" icon={<Store className="size-4" />}>
            See the Skill Exchange
          </ButtonLink>
        </div>
      )}
      <SellPicker open={picker} onClose={() => setPicker(false)} />
    </Page>
  )
}
