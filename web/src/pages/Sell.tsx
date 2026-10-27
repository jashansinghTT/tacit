import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, CircleCheck, Eye, Rocket, Store } from 'lucide-react'
import type { Skill } from '@/lib/api'
import type { ExListing } from '@/lib/api/exchange'
import { useSkill, useUsers } from '@/lib/api/queries'
import { fmtMoney, fmtPct } from '@/lib/format'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/cn'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button, ButtonLink, EmptyState, ErrorState, Panel, Skeleton, toast } from '@/components/ui'
import { ListingCard } from '@/components/exchange/ListingCard'
import { ExchangeNav, useSwitchPersona } from '@/features/exchange/ExchangeNav'
import { useCreateListing } from '@/features/exchange/hooks'
import { CheckStep, ConsentStep, MarketStep, PricesStep, ReviewStep, SplitStep } from '@/features/exchange/sell/Steps'
import { eligibility, initialDraft, STEPS, stepValid, toBody, type SellDraft, type StepKey } from '@/features/exchange/sell/draft'

function StepNav({ current, reached, valid, goto }: { current: number; reached: number; valid: boolean[]; goto: (i: number) => void }) {
  return (
    <ol className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Steps" data-testid="sell-steps">
      {STEPS.map((s, i) => {
        const on = i === current
        const done = i < current && valid[i]
        const can = i <= reached
        return (
          <li key={s.key} className="shrink-0">
            <button
              onClick={() => can && goto(i)}
              disabled={!can}
              aria-current={on ? 'step' : undefined}
              data-testid={`sell-nav-${s.key}`}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                on ? 'bg-white/[0.05] shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : can ? 'hover:bg-white/[0.03]' : 'opacity-50',
              )}
            >
              <span
                className={cn(
                  'telemetry grid size-6 shrink-0 place-items-center rounded-full text-[11px]',
                  done ? 'bg-ok/15 text-ok shadow-[inset_0_0_0_1px_rgb(61_220_151/0.4)]' : on ? 'bg-ion text-ion-ink shadow-[0_0_14px_rgb(60_215_255/0.5)]' : 'text-fg-subtle shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={cn('block text-[13px] font-medium', on ? 'text-fg' : 'text-fg-muted')}>{s.title}</span>
                <span className="hidden text-[11px] text-fg-subtle lg:block">{s.hint}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** How the listing will look to buyers, from the draft as it stands. */
function Preview({ skill, draft }: { skill: Skill; draft: SellDraft }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => ref.current?.setAttribute('inert', ''), [])
  const l: ExListing = {
    id: 'preview',
    skill_id: skill.id,
    title: skill.title,
    summary: skill.summary,
    thumb: null,
    preview_video: null,
    expert: { id: skill.expert.id, name: skill.expert.name },
    plant: draft.plant,
    industry: draft.industry,
    robot_types: draft.robots,
    verified: skill.verification.status === 'verified',
    verification_score: skill.verification.score,
    consent: { motion: true, gaze: true, voice_text: draft.voiceText, raw_video: false, expert_confirmed: draft.confirmed },
    price: draft.price,
    currency: 'USD',
    royalty_split: { expert: draft.expertShare, plant: 1 - draft.expertShare },
    licenses_sold: 0,
    rating: null,
    created_at: new Date().toISOString(),
    demo: false,
    steps_count: skill.steps.length,
    duration: skill.source?.duration,
  }
  return (
    <div className="lg:sticky lg:top-[calc(var(--header-h)+16px)]">
      <div className="eyebrow mb-2 flex items-center gap-1.5">
        <Eye className="size-3" /> How buyers will see it
      </div>
      <div ref={ref} aria-hidden>
        <ListingCard l={l} />
      </div>
      <div className="mt-3 rounded-lg bg-white/[0.02] p-3 text-xs text-fg-subtle shadow-[inset_0_0_0_1px_var(--color-line)]">
        Per robot-deploy license: <span className="telemetry text-ion">{fmtMoney(Math.round(draft.price.robot_deploy * draft.expertShare * 100) / 100, 'USD', 2)}</span> to{' '}
        {skill.expert.name.split(' ')[0]} ({fmtPct(draft.expertShare)}).
      </div>
    </div>
  )
}

function Published({ listing, skill }: { listing: ExListing; skill: Skill }) {
  const switchTo = useSwitchPersona()
  return (
    <Panel data-testid="sell-published">
      <div className="flex flex-col items-center py-8 text-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 360, damping: 20 }}
          className="grid size-16 place-items-center rounded-full bg-ok/15 text-ok shadow-[inset_0_0_0_1px_rgb(61_220_151/0.4),0_0_50px_-8px_rgb(61_220_151/0.7)]"
        >
          <Rocket className="size-7" />
        </motion.div>
        <h2 className="mt-4 text-2xl font-medium tracking-[-0.02em] text-fg">Listed on the Skill Exchange</h2>
        <p className="mt-2 max-w-md text-sm text-fg-muted">
          {skill.title} is live. Every time a robot maker licenses it, {fmtPct(listing.royalty_split.expert)} of the fee goes to {skill.expert.name}.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <ButtonLink to={`/exchange/${listing.id}`} variant="primary" icon={<Store className="size-4" />} data-testid="open-listing">
            Open the listing
          </ButtonLink>
          <Button variant="secondary" onClick={() => switchTo('u_atlas', `/exchange/${listing.id}`)} data-testid="see-as-buyer">
            See it as Atlas Robotics
          </Button>
          <ButtonLink to="/earnings" variant="ghost">
            Earnings
          </ButtonLink>
        </div>
      </div>
    </Panel>
  )
}

export default function SellPage() {
  const { skillId } = useParams()
  const skill = useSkill(skillId)
  const persona = useApp((s) => s.persona)
  const users = useUsers()
  const switchTo = useSwitchPersona()
  const [params, setParams] = useSearchParams()
  const [draft, setDraft] = useState<SellDraft>(initialDraft)
  const [published, setPublished] = useState<ExListing | null>(null)
  const create = useCreateListing()
  const stepIndex = Math.max(0, STEPS.findIndex((s) => s.key === params.get('step')))
  const [reached, setReached] = useState(stepIndex)
  const s = skill.data
  const expertName = s?.expert.name ?? 'The expert'
  const isExpert = Boolean(s && s.expert.id === persona)
  const valid = useMemo(() => (s ? STEPS.map((st) => stepValid(st.key, draft, s, isExpert)) : STEPS.map(() => false)), [s, draft, isExpert])
  // You can only jump to a step once every step before it is valid.
  const maxReach = valid.findIndex((v) => !v)
  const current = maxReach >= 0 ? Math.min(stepIndex, maxReach) : stepIndex

  const goto = (i: number) => {
    setReached((r) => Math.max(r, i))
    setParams(i === 0 ? {} : { step: STEPS[i].key }, { replace: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const set = (patch: Partial<SellDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const publish = () => {
    if (!s) return
    create.mutate(toBody(s.id, draft), {
      onSuccess: (l) => {
        setPublished(l)
        toast.ok('Listed on the Skill Exchange', s.title)
      },
      onError: (e) => toast.error('The listing was not published', (e as Error).message),
    })
  }

  const expertUser = users.data?.find((u) => u.id === s?.expert.id)
  const step = STEPS[current].key as StepKey
  const props = s ? { skill: s, draft, set, expertName, isExpert } : null

  return (
    <Page testId="page-sell">
      <ExchangeNav />
      {skill.isError ? (
        <Panel>
          <ErrorState error={skill.error} onRetry={() => skill.refetch()} />
        </Panel>
      ) : !s ? (
        <div className="grid gap-6 lg:grid-cols-[240px_1fr_340px]">
          <Skeleton className="h-72" />
          <Skeleton className="h-[480px]" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <>
          <PageHeader
            crumbs={[{ label: 'Skill Exchange', to: '/exchange' }, { label: 'List a skill' }]}
            eyebrow="List this skill"
            title={s.title}
            description={`Recorded by ${expertName}${expertUser?.title ? `, ${expertUser.title.toLowerCase()}` : ''}. Six steps from a verified skill to a live listing that pays its expert.`}
          />
          {published ? (
            <Published listing={published} skill={s} />
          ) : s.listing_id ? (
            <Panel data-testid="sell-already-listed">
              <EmptyState
                icon={<CircleCheck className="size-5 text-ok" />}
                title="This skill is already on the Exchange"
                action={
                  <div className="flex gap-2">
                    <ButtonLink to={`/exchange/${s.listing_id}`} variant="primary" size="sm">
                      Open the listing
                    </ButtonLink>
                    <ButtonLink to="/earnings" variant="secondary" size="sm">
                      Earnings
                    </ButtonLink>
                  </div>
                }
              >
                A skill is listed once. Its royalties show up in {expertName.split(' ')[0]}’s earnings.
              </EmptyState>
            </Panel>
          ) : (
            <>
              {!isExpert && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warn/[0.06] px-4 py-3 text-[13px] text-fg-muted shadow-[inset_0_0_0_1px_rgb(255_181_71/0.3)]" role="note">
                  <span>
                    This is {expertName}’s skill. Only {expertName.split(' ')[0]} can sign the consent and list it.
                  </span>
                  {s.expert.id === 'u_maria' && (
                    <Button size="xs" variant="secondary" onClick={() => switchTo('u_maria')}>
                      Switch to {expertName}
                    </Button>
                  )}
                </div>
              )}
              <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)_330px]">
                <div className="lg:sticky lg:top-[calc(var(--header-h)+16px)] lg:self-start">
                  <StepNav current={current} reached={Math.max(reached, current)} valid={valid} goto={goto} />
                </div>
                <div className="min-w-0">
                  <Panel bodyClassName="p-5 lg:p-6">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div key={step} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }}>
                        {props && step === 'check' && <CheckStep {...props} />}
                        {props && step === 'consent' && <ConsentStep {...props} />}
                        {props && step === 'prices' && <PricesStep {...props} />}
                        {props && step === 'split' && <SplitStep {...props} />}
                        {props && step === 'market' && <MarketStep {...props} />}
                        {props && step === 'review' && <ReviewStep {...props} goto={(k) => goto(STEPS.findIndex((x) => x.key === k))} />}
                      </motion.div>
                    </AnimatePresence>
                    {step === 'review' && create.isError && (
                      <div role="alert" data-testid="sell-error" className="mt-4 rounded-lg bg-fault-soft px-4 py-3 text-[13px] text-fg shadow-[inset_0_0_0_1px_rgb(255_93_93/0.35)]">
                        <div className="font-medium text-fault">The Exchange did not accept this listing</div>
                        <div className="mt-0.5 text-fg-muted">{(create.error as Error).message}</div>
                      </div>
                    )}
                    <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
                      {current > 0 ? (
                        <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => goto(current - 1)} data-testid="sell-back">
                          Back
                        </Button>
                      ) : (
                        <Link to="/exchange" className="text-[13px] text-fg-subtle hover:text-fg">
                          Cancel
                        </Link>
                      )}
                      {step === 'review' ? (
                        <Button variant="primary" size="lg" icon={<Rocket className="size-4" />} onClick={publish} loading={create.isPending} disabled={!valid.every(Boolean)} data-testid="sell-publish">
                          Publish to the Exchange
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          iconRight={<ArrowRight className="size-4" />}
                          onClick={() => goto(current + 1)}
                          disabled={!valid[current]}
                          data-testid="sell-next"
                        >
                          {step === 'check' && !eligibility(s).ok ? 'Not listable yet' : 'Continue'}
                        </Button>
                      )}
                    </div>
                  </Panel>
                </div>
                <Preview skill={s} draft={draft} />
              </div>
            </>
          )}
        </>
      )}
    </Page>
  )
}
