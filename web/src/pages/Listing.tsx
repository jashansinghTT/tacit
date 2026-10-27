import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowRight, Bot, Clock, Cpu, Eye, Hand, Layers, Quote, ShieldCheck, Store, TriangleAlert } from 'lucide-react'
import type { LicenseType } from '@/lib/api'
import type { ExListingDetail } from '@/lib/api/exchange'
import { useUsers } from '@/lib/api/queries'
import { fmtDate, fmtDuration, fmtInt, fmtMoney, fmtMs } from '@/lib/format'
import { cn } from '@/lib/cn'
import { Page, PageHeader } from '@/components/layout/Page'
import { Avatar, Badge, ButtonLink, ChipTag, EmptyState, ErrorState, Panel, Skeleton, VerifiedBadge } from '@/components/ui'
import { ExchangeNav } from '@/features/exchange/ExchangeNav'
import { useExListing } from '@/features/exchange/hooks'
import { LICENSES, robotLabel, royaltySplit, termsFor, verificationScore } from '@/features/exchange/meta'
import { MotionPreview } from '@/features/exchange/MotionPreview'
import { ConsentRecord, PackContents, VerificationCertificate } from '@/features/exchange/Provenance'
import { CheckoutDialog, LICENSE_ORDER, LicensePanel } from '@/features/exchange/Checkout'

function Steps({ l }: { l: ExListingDetail }) {
  const steps = l.skill.steps ?? []
  const first = l.expert.name.split(' ')[0]
  const own = steps.filter((s) => s.why_source === 'expert').length
  return (
    <Panel
      eyebrow="What the expert knows"
      title={`${steps.length} steps, each with the reason behind it`}
      actions={
        <Badge tone={own ? 'ion' : 'neutral'} title="Reasons the expert gave in their own words">
          {own}/{steps.length} in {first}’s words
        </Badge>
      }
      data-testid="listing-steps"
      pad={false}
    >
      <ol className="divide-y divide-line">
        {steps.map((s) => (
          <li key={s.id} className="grid grid-cols-[2.25rem_1fr] gap-3 px-4 py-4">
            <span className="telemetry grid size-7 place-items-center rounded-md bg-white/[0.04] text-xs text-ion shadow-[inset_0_0_0_1px_var(--color-line)]">
              {String(s.index).padStart(2, '0')}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h3 className="text-[14px] font-medium text-fg">{s.title}</h3>
                <span className="telemetry text-[11px] text-fg-faint">
                  {s.t_start.toFixed(1)}–{s.t_end.toFixed(1)} s
                </span>
              </div>
              <p className="mt-0.5 text-[13px] text-fg-muted">{s.instruction}</p>
              {s.why && (
                <blockquote className={cn('mt-2.5 flex gap-2 rounded-md px-3 py-2 text-[13px]', s.why_source === 'expert' ? 'bg-ion/[0.06] text-fg shadow-[inset_2px_0_0_var(--color-ion)]' : 'bg-white/[0.025] text-fg-muted shadow-[inset_2px_0_0_var(--color-line-bright)]')}>
                  <Quote className={cn('mt-0.5 size-3.5 shrink-0', s.why_source === 'expert' ? 'text-ion' : 'text-fg-faint')} aria-hidden />
                  <span>
                    {s.why}
                    <span className="mt-1 block text-[11px] text-fg-subtle">{s.why_source === 'expert' ? `${l.expert.name}, in their own words` : 'Inferred from the recording; not yet confirmed by the expert'}</span>
                  </span>
                </blockquote>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-subtle">
                {s.hand && (
                  <span className="flex items-center gap-1">
                    <Hand className="size-3" /> {s.hand} hand
                  </span>
                )}
                {s.gaze_target && s.gaze_target !== 'person' && (
                  <span className="flex items-center gap-1">
                    <Eye className="size-3 text-data-gaze" /> looks at {s.gaze_target}
                  </span>
                )}
                {s.objects?.length > 0 && <span className="text-data-object">{s.objects.join(', ')}</span>}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  )
}

function TermsTable({ l }: { l: ExListingDetail }) {
  return (
    <Panel eyebrow="Terms" title="License types" pad={false} data-testid="license-terms-table">
      <ul className="divide-y divide-line">
        {LICENSE_ORDER.map((t) => {
          const m = LICENSES[t]
          const r = royaltySplit(l.price[t], l.royalty_split)
          return (
            <li key={t} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-[13px] font-medium text-fg">
                  <m.icon className="size-4 text-fg-subtle" aria-hidden /> {m.label}
                </span>
                <span className="telemetry text-[15px] font-medium text-fg">{fmtMoney(l.price[t], l.currency)}</span>
              </div>
              <p className="mt-1 text-xs text-fg-subtle">{termsFor(l, t)}</p>
              <div className="mt-1.5 text-[11px] text-fg-subtle">
                <span className="telemetry text-ion">{fmtMoney(r.expert, l.currency, 2)}</span> to {l.expert.name.split(' ')[0]} ·{' '}
                <span className="telemetry text-data-right">{fmtMoney(r.plant, l.currency, 2)}</span> to the plant
              </div>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

function OnTheBox({ l }: { l: ExListingDetail }) {
  const used = l.skill.models_used ?? []
  const program = l.skill.robot?.program ?? []
  return (
    <Panel eyebrow="Processed on the box" title="The models that made this skill, inside the plant" data-testid="listing-models">
      <ul className="flex flex-wrap gap-1.5">
        {used.map((m, i) => (
          <li key={`${m.model}-${m.backend}-${i}`} className="inline-flex items-center gap-1.5 rounded-sm bg-white/[0.03] px-1.5 py-1 text-[11px] text-fg-subtle shadow-[inset_0_0_0_1px_var(--color-line)]">
            <span className="text-fg-muted">{m.model}</span>
            <ChipTag chip={m.backend === 'tt' ? m.chip : null} />
            {m.p50_ms != null && <span className="telemetry">{fmtMs(m.p50_ms)}</span>}
          </li>
        ))}
        {used.length === 0 && <li className="text-xs text-fg-subtle">No model record on this skill.</li>}
      </ul>
      {program.length > 0 && (
        <div className="mt-4">
          <div className="eyebrow mb-2 flex items-center gap-1.5">
            <Bot className="size-3" /> Robot program
          </div>
          <ol className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {program.map((a, i) => (
              <li key={i} className="flex items-center gap-1.5">
                {i > 0 && <ArrowRight className="size-3 text-fg-faint" aria-hidden />}
                <span className="telemetry rounded-sm bg-white/[0.04] px-1.5 py-0.5 text-fg-muted shadow-[inset_0_0_0_1px_var(--color-line)]">
                  <span className="text-ion">{a.op}</span> {a.object ?? a.target}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {l.skill.safety?.length > 0 && (
        <div className="mt-4">
          <div className="eyebrow mb-2 flex items-center gap-1.5">
            <TriangleAlert className="size-3" /> Safety and quality notes
          </div>
          <ul className="space-y-1 text-xs text-fg-muted">
            {l.skill.safety.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-warn" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}

function ListingSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Skeleton className="aspect-[16/10] rounded-xl" />
      <div className="space-y-3">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-16" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  )
}

export default function ListingPage() {
  const { listingId } = useParams()
  const q = useExListing(listingId)
  const users = useUsers()
  const [type, setType] = useState<LicenseType>('robot_deploy')
  const [checkout, setCheckout] = useState(false)
  const l = q.data
  const expert = users.data?.find((u) => u.id === l?.expert.id)
  const score = l ? verificationScore(l) : null
  const signed = Boolean(l?.consent?.signed_at || l?.consent?.expert_confirmed)

  return (
    <Page testId="page-listing">
      <ExchangeNav />
      {q.isError ? (
        <Panel>
          {(q.error as { status?: number }).status === 404 ? (
            <EmptyState
              icon={<Store className="size-5" />}
              title="This listing is not on the Exchange"
              action={
                <ButtonLink to="/exchange" variant="secondary" size="sm">
                  Browse the Exchange
                </ButtonLink>
              }
            >
              It may have been licensed exclusively or removed by its expert.
            </EmptyState>
          ) : (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          )}
        </Panel>
      ) : !l ? (
        <ListingSkeleton />
      ) : (
        <>
          <PageHeader
            className="mb-5"
            crumbs={[{ label: 'Skill Exchange', to: '/exchange' }, { label: l.title }]}
            eyebrow={`${l.industry} · ${l.plant}`}
            title={<span data-testid="listing-title">{l.title}</span>}
            description={l.summary}
            meta={
              <>
                <VerifiedBadge status={l.verified ? 'verified' : (l.skill.verification?.status ?? 'pending')} score={score} size="md" />
                {signed && (
                  <Badge tone="ion" size="md" icon={<ShieldCheck className="size-3.5" />}>
                    Consent signed
                  </Badge>
                )}
                {l.robot_types.map((r) => (
                  <Badge key={r} size="md" icon={<Bot className="size-3" />}>
                    {robotLabel(r)}
                  </Badge>
                ))}
                <span className="telemetry flex items-center gap-1 text-xs text-fg-subtle">
                  <Layers className="size-3.5" /> {l.steps_count ?? l.skill.steps.length} steps
                </span>
                <span className="telemetry flex items-center gap-1 text-xs text-fg-subtle">
                  <Clock className="size-3.5" /> {fmtDuration(l.duration ?? l.skill.source?.duration)}
                </span>
                <span className="telemetry text-xs text-fg-subtle" data-testid="listing-sold">
                  {l.licenses_sold ? `${fmtInt(l.licenses_sold)} licensed` : 'Not licensed yet'}
                </span>
              </>
            }
          />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-4">
              <MotionPreview skillId={l.skill_id} steps={l.skill.steps ?? []} duration={l.duration ?? l.skill.source?.duration} />
              <div className="flex items-center gap-3 rounded-lg bg-white/[0.02] px-4 py-3 shadow-[inset_0_0_0_1px_var(--color-line)]">
                <Avatar name={l.expert.name} src={expert?.avatar} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-fg">{l.expert.name}</div>
                  <div className="text-xs text-fg-subtle">
                    {expert?.title ?? 'Expert'} · {l.plant}
                  </div>
                </div>
                <div className="text-right text-[11px] text-fg-subtle">
                  <div>Listed {fmtDate(l.created_at)}</div>
                  <div className="flex items-center justify-end gap-1">
                    <Cpu className="size-3" /> Recorded on a Tacit box
                  </div>
                </div>
              </div>
            </div>
            <div className="lg:sticky lg:top-[calc(var(--header-h)+16px)] lg:self-start">
              <LicensePanel listing={l} type={type} setType={setType} onLicense={() => setCheckout(true)} />
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <VerificationCertificate v={l.skill.verification} />
            <ConsentRecord consent={l.consent} expertName={l.expert.name} />
            <PackContents contents={l.contents} skillId={l.skill_id} stepsCount={l.skill.steps.length} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <Steps l={l} />
            <div className="space-y-4">
              <TermsTable l={l} />
              <OnTheBox l={l} />
            </div>
          </div>

          <CheckoutDialog listing={l} open={checkout} onClose={() => setCheckout(false)} type={type} setType={setType} />
        </>
      )}
    </Page>
  )
}
