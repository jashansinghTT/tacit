import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, Layers, Loader2, Plus, Search, Store } from 'lucide-react'
import { useSkills } from '@/lib/api/queries'
import type { SkillSummary } from '@/lib/api'
import { fmtAgo, fmtDuration } from '@/lib/format'
import { cn } from '@/lib/cn'
import { Page, PageHeader } from '@/components/layout/Page'
import { Badge, ButtonLink, EmptyState, ErrorState, Panel, Segmented, Skeleton, Spotlight, TextInput, VerifiedBadge } from '@/components/ui'

const STATUS_TONE = { ready: 'ok', processing: 'ion', draft: 'neutral', failed: 'fault' } as const

export function SkillCard({ s }: { s: SkillSummary }) {
  return (
    <Spotlight className="panel group overflow-hidden rounded-xl">
      <Link to={`/skills/${s.id}`} className="flex h-full flex-col outline-none" data-testid={`skill-card-${s.id}`}>
        <div className="relative aspect-video overflow-hidden bg-ink-950">
          {s.thumb ? <img src={s.thumb} alt="" loading="lazy" className="size-full object-cover opacity-85 transition-transform duration-500 group-hover:scale-[1.03]" /> : <div className="size-full grid-bg" />}
          <div className="absolute inset-0 bg-gradient-to-t from-ink-850 via-ink-850/10 to-transparent" />
          <div className="absolute top-3 left-3 flex gap-1.5">
            <Badge tone={STATUS_TONE[s.status]} dot pulse={s.status === 'processing'} className="bg-ink-950/70 backdrop-blur">
              {s.status === 'processing' ? 'Processing' : s.status[0].toUpperCase() + s.status.slice(1)}
            </Badge>
            {s.listed && (
              <Badge tone="violet" icon={<Store className="size-3" />} className="backdrop-blur">
                Listed
              </Badge>
            )}
          </div>
          {s.status === 'processing' && (
            <div className="absolute inset-0 grid place-items-center">
              <Loader2 className="size-6 animate-spin text-ion" />
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col p-4">
          <h3 className="text-[15px] font-medium tracking-[-0.01em] text-fg">{s.title}</h3>
          <p className="mt-1 line-clamp-2 text-[13px] text-fg-subtle">{s.summary}</p>
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
            <VerifiedBadge status={s.verification_status} />
            <span className="telemetry flex items-center gap-1 text-[11px] text-fg-subtle">
              <Layers className="size-3" /> {s.steps_count} steps
            </span>
            <span className="telemetry flex items-center gap-1 text-[11px] text-fg-subtle">
              <Clock className="size-3" /> {fmtDuration(s.duration)}
            </span>
            <span className="ml-auto text-[11px] text-fg-faint">
              {s.expert.name} · {fmtAgo(s.created_at)}
            </span>
          </div>
        </div>
      </Link>
    </Spotlight>
  )
}

type Filter = 'all' | 'ready' | 'processing' | 'draft'

export default function SkillsPage() {
  const skills = useSkills()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const list = useMemo(
    () =>
      (skills.data ?? [])
        .filter((s) => filter === 'all' || s.status === filter)
        .filter((s) => !q || `${s.title} ${s.summary} ${s.expert.name}`.toLowerCase().includes(q.toLowerCase())),
    [skills.data, filter, q],
  )
  const counts = useMemo(() => {
    const c = { all: 0, ready: 0, processing: 0, draft: 0 }
    for (const s of skills.data ?? []) {
      c.all++
      if (s.status in c) c[s.status as keyof typeof c]++
    }
    return c
  }, [skills.data])
  return (
    <Page testId="page-skills">
      <PageHeader
        eyebrow="Skills"
        title="Captured skills"
        description="Every capture becomes a skill: steps with the expert's reasons, a 3D twin, standard work, a verification score and a robot program."
        actions={
          <ButtonLink to="/studio" variant="primary" icon={<Plus className="size-4" />} data-testid="new-capture">
            New capture
          </ButtonLink>
        }
      />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          label="Filter by status"
          value={filter}
          onChange={setFilter}
          size="md"
          items={(['all', 'ready', 'processing', 'draft'] as Filter[]).map((k) => ({
            key: k,
            label: (
              <span className="flex items-center gap-1.5">
                {k[0].toUpperCase() + k.slice(1)}
                <span className={cn('telemetry text-[10px]', filter === k ? 'text-ion' : 'text-fg-faint')}>{counts[k]}</span>
              </span>
            ),
          }))}
        />
        <TextInput placeholder="Search skills" value={q} onChange={(e) => setQ(e.target.value)} icon={<Search className="size-4" />} className="sm:w-72" aria-label="Search skills" />
      </div>
      {skills.isError ? (
        <Panel>
          <ErrorState error={skills.error} onRetry={() => skills.refetch()} />
        </Panel>
      ) : skills.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-80 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Panel>
          <EmptyState title={q || filter !== 'all' ? 'No skills match' : 'No skills yet'} action={<ButtonLink to="/studio" variant="primary" size="sm">Capture the first one</ButtonLink>}>
            Record an expert in the Studio, upload a video, or start from the sample.
          </EmptyState>
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {list.map((s) => (
            <SkillCard key={s.id} s={s} />
          ))}
        </div>
      )}
    </Page>
  )
}
