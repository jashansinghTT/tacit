import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Camera, Coins, Cpu, FileSignature, Library, Plus, Search, ShieldCheck, Upload, X } from 'lucide-react'
import type { ExListing } from '@/lib/api/exchange'
import { fmtInt, fmtPct } from '@/lib/format'
import { useApp, personaOf } from '@/lib/store'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button, ButtonLink, EmptyState, ErrorState, Panel, Select, Skeleton, Stat, Switch, TextInput } from '@/components/ui'
import { ListingCard } from '@/components/exchange/ListingCard'
import { ExchangeNav } from '@/features/exchange/ExchangeNav'
import { useExListings } from '@/features/exchange/hooks'
import { robotLabel, verificationScore } from '@/features/exchange/meta'
import { SellPicker } from '@/features/exchange/SellPicker'

type Sort = 'newest' | 'popular' | 'price_asc' | 'price_desc' | 'score'

const SORTS: { key: Sort; label: string }[] = [
  { key: 'newest', label: 'Newest' },
  { key: 'popular', label: 'Most licensed' },
  { key: 'score', label: 'Verification score' },
  { key: 'price_asc', label: 'Price: low to high' },
  { key: 'price_desc', label: 'Price: high to low' },
]

const minPrice = (l: ExListing) => Math.min(...Object.values(l.price))

function sortListings(list: ExListing[], sort: Sort) {
  const out = [...list]
  if (sort === 'popular') out.sort((a, b) => b.licenses_sold - a.licenses_sold)
  else if (sort === 'price_asc') out.sort((a, b) => minPrice(a) - minPrice(b))
  else if (sort === 'price_desc') out.sort((a, b) => minPrice(b) - minPrice(a))
  else if (sort === 'score') out.sort((a, b) => (verificationScore(b) ?? 0) - (verificationScore(a) ?? 0))
  else out.sort((a, b) => b.created_at.localeCompare(a.created_at))
  return out
}

/** How a skill reaches the Exchange: shown when nothing is listed yet. */
const PATH = [
  { icon: Camera, title: 'Recorded on the box', body: 'An expert does the task once in the Studio. The video stays in the plant.' },
  { icon: Cpu, title: 'Turned into motion', body: 'Nine models on four Tenstorrent chips extract hands, gaze, parts and steps.' },
  { icon: ShieldCheck, title: 'Verified as real', body: 'VGGT rebuilds the scene in 3D to prove a real camera filmed it, not an AI.' },
  { icon: FileSignature, title: 'Listed with consent', body: 'The expert signs what is shared, sets prices, and earns on every license.' },
]

function HowSkillsGetHere() {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="exchange-how">
      {PATH.map((p, i) => (
        <li key={p.title} className="relative rounded-lg bg-white/[0.02] p-4 text-left shadow-[inset_0_0_0_1px_var(--color-line)]">
          <div className="flex items-center gap-2">
            <span className="telemetry text-[11px] text-ion">{String(i + 1).padStart(2, '0')}</span>
            <p.icon className="size-4 text-fg-muted" aria-hidden />
          </div>
          <div className="mt-3 text-[13px] font-medium text-fg">{p.title}</div>
          <p className="mt-1 text-xs text-fg-subtle">{p.body}</p>
        </li>
      ))}
    </ol>
  )
}

function ProvenanceStrip() {
  const items = [
    { icon: FileSignature, text: 'Consent signed by the expert', tone: 'text-ion' },
    { icon: ShieldCheck, text: 'Verified real camera (VGGT 3D rebuild)', tone: 'text-ok' },
    { icon: Upload, text: 'Motion, gaze and text only. Never video or faces', tone: 'text-data-right' },
    { icon: Coins, text: 'The expert earns a royalty on every license', tone: 'text-warn' },
  ]
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-fg-muted" aria-label="What every listing carries">
      {items.map((it) => (
        <li key={it.text} className="flex items-center gap-1.5">
          <it.icon className={`size-3.5 ${it.tone}`} aria-hidden />
          {it.text}
        </li>
      ))}
    </ul>
  )
}

/** Fills a sparse grid honestly: no made-up listings, just where the next ones come from. */
function NextListing({ role, onList }: { role: string; onList: () => void }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-line-strong p-6 text-center" data-testid="exchange-next">
      <div className="grid size-11 place-items-center rounded-lg bg-white/[0.03] text-fg-subtle shadow-[inset_0_0_0_1px_var(--color-line)]">
        <Plus className="size-5" />
      </div>
      <div className="mt-3 text-[13px] font-medium text-fg">{role === 'buyer' ? 'More skills on the way' : 'Your skill could be next'}</div>
      <p className="mt-1 max-w-64 text-xs leading-relaxed text-fg-subtle">
        {role === 'buyer'
          ? 'New skills appear here as plants record them, verify them and their experts sign off.'
          : 'Any ready skill that passed the real-camera check can be listed in a couple of minutes.'}
      </p>
      {role !== 'buyer' && (
        <Button variant="secondary" size="sm" className="mt-4" icon={<Plus className="size-4" />} onClick={onList}>
          List a skill
        </Button>
      )}
    </div>
  )
}

export default function ExchangePage() {
  const persona = useApp((s) => s.persona)
  const role = personaOf(persona).role
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const industry = params.get('industry') ?? ''
  const robot = params.get('robot') ?? ''
  const verified = params.get('verified') === '1'
  const sort = (params.get('sort') as Sort) || 'newest'
  const [picker, setPicker] = useState(false)

  const set = (k: string, v: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (v) n.set(k, v)
        else n.delete(k)
        return n
      },
      { replace: true },
    )

  // Debounce typing into the URL (and so into the query).
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') ?? '') !== q.trim()) set('q', q.trim())
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const all = useExListings()
  const filtered = useExListings({ q: params.get('q') ?? '', industry, robot, verified })
  const list = useMemo(() => sortListings(filtered.data ?? [], sort), [filtered.data, sort])
  const facets = useMemo(() => {
    const ls = all.data ?? []
    return {
      industries: [...new Set(ls.map((l) => l.industry))].sort(),
      robots: [...new Set(ls.flatMap((l) => l.robot_types))].sort(),
    }
  }, [all.data])
  const stats = useMemo(() => {
    const ls = all.data ?? []
    const v = ls.filter((l) => l.verified).length
    return {
      listed: ls.length,
      verified: v,
      sold: ls.reduce((s, l) => s + (l.licenses_sold ?? 0), 0),
      plants: new Set(ls.map((l) => l.plant)).size,
      share: ls.length ? ls.reduce((s, l) => s + l.royalty_split.expert, 0) / ls.length : 0.7,
    }
  }, [all.data])
  const filtering = Boolean(params.get('q') || industry || robot || verified)
  const clear = () => {
    setQ('')
    setParams({}, { replace: true })
  }

  return (
    <Page testId="page-exchange">
      <ExchangeNav />
      <PageHeader
        eyebrow="Skill Exchange"
        title="Real skills from real plants, licensed with consent"
        description="Each listing is a hands-on skill an expert recorded on a Tacit box. It is verified as a real camera recording, listed with the expert's signed consent, and licensed as motion, gaze and text. The expert earns on every license."
        actions={
          role === 'buyer' ? (
            <ButtonLink to="/library" variant="secondary" icon={<Library className="size-4" />} data-testid="go-library">
              My library
            </ButtonLink>
          ) : (
            <>
              <ButtonLink to="/earnings" variant="ghost" icon={<Coins className="size-4" />}>
                Earnings
              </ButtonLink>
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setPicker(true)} data-testid="list-skill">
                List a skill
              </Button>
            </>
          )
        }
      />

      <Panel className="mb-5" bodyClassName="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-5">
        <Stat label="Skills listed" value={all.isLoading ? '–' : fmtInt(stats.listed)} />
        <Stat label="Verified real" value={all.isLoading ? '–' : `${stats.verified}/${stats.listed}`} tone={stats.verified && stats.verified === stats.listed ? 'ok' : 'neutral'} />
        <Stat label="Licenses sold" value={all.isLoading ? '–' : fmtInt(stats.sold)} />
        <Stat label="Plants" value={all.isLoading ? '–' : fmtInt(stats.plants)} />
        <Stat label="Expert share" value={fmtPct(stats.share)} tone="ion" hint="of every license fee" />
      </Panel>

      <div className="mb-5">
        <ProvenanceStrip />
      </div>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center" role="search">
        <TextInput
          placeholder="Search skills, tasks, parts"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          icon={<Search className="size-4" />}
          className="lg:w-80"
          aria-label="Search listings"
          data-testid="exchange-search"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Industry" value={industry} onChange={(e) => set('industry', e.target.value)} data-testid="filter-industry" className="min-w-40">
            <option value="">All industries</option>
            {facets.industries.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </Select>
          <Select aria-label="Robot type" value={robot} onChange={(e) => set('robot', e.target.value)} data-testid="filter-robot" className="min-w-36">
            <option value="">Any robot</option>
            {facets.robots.map((r) => (
              <option key={r} value={r}>
                {robotLabel(r)}
              </option>
            ))}
          </Select>
          <label className="flex h-9 items-center gap-2 rounded-md px-2.5 text-[13px] text-fg-muted shadow-[inset_0_0_0_1px_var(--color-line-strong)]">
            <Switch checked={verified} onChange={(v) => set('verified', v ? '1' : '')} label="Verified only" />
            Verified only
          </label>
          {filtering && (
            <Button variant="ghost" size="sm" icon={<X className="size-3.5" />} onClick={clear}>
              Clear
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 lg:ml-auto">
          <span className="text-xs text-fg-subtle">Sort</span>
          <Select aria-label="Sort" value={sort} onChange={(e) => set('sort', e.target.value === 'newest' ? '' : e.target.value)} data-testid="sort" className="min-w-44">
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {filtered.isError ? (
        <Panel>
          <ErrorState error={filtered.error} onRetry={() => filtered.refetch()} />
        </Panel>
      ) : filtered.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[360px] rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 && !filtering ? (
        <Panel data-testid="exchange-empty">
          <EmptyState
            icon={<ShieldCheck className="size-5" />}
            title="No skills are listed yet"
            action={
              role === 'buyer' ? undefined : (
                <div className="flex gap-2">
                  <ButtonLink to="/studio" variant="secondary" size="sm" icon={<Camera className="size-4" />}>
                    Capture a skill
                  </ButtonLink>
                  <Button variant="primary" size="sm" onClick={() => setPicker(true)}>
                    List one of yours
                  </Button>
                </div>
              )
            }
          >
            Skills arrive here from the plants that record them. Only ready skills that passed the real-camera check can be listed, and only
            after their expert signs off.
          </EmptyState>
          <div className="px-4 pb-6">
            <HowSkillsGetHere />
          </div>
        </Panel>
      ) : list.length === 0 ? (
        <Panel>
          <EmptyState
            title="No skills match these filters"
            action={
              <Button variant="secondary" size="sm" onClick={clear}>
                Clear filters
              </Button>
            }
          >
            Try another industry or robot, or turn off “verified only”.
          </EmptyState>
        </Panel>
      ) : (
        <>
          <div className="mb-3 text-xs text-fg-subtle" aria-live="polite" data-testid="exchange-count">
            {list.length} {list.length === 1 ? 'skill' : 'skills'}
            {filtering && ` of ${stats.listed}`}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="exchange-grid">
            {list.map((l) => (
              <ListingCard key={l.id} l={l} />
            ))}
            {!filtering && list.length < 3 && <NextListing role={role} onList={() => setPicker(true)} />}
          </div>
        </>
      )}

      {list.length > 0 && list.length < 4 && !filtering && (
        <Panel className="mt-8" eyebrow="How skills get here" title="From a plant's bench to a robot maker's library">
          <HowSkillsGetHere />
        </Panel>
      )}

      <SellPicker open={picker} onClose={() => setPicker(false)} />
    </Page>
  )
}
