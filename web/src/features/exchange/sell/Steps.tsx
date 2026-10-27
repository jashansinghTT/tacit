// The six steps of "List this skill". Each one edits the draft; the page owns navigation.
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Bot, Check, CircleAlert, CircleCheck, CircleX, Factory, Lock, MessageSquareQuote, Pencil, ScanEye, UserRound } from 'lucide-react'
import type { LicenseType, Skill } from '@/lib/api'
import { fmtDate, fmtMoney, fmtPct, fmtScorePct } from '@/lib/format'
import { cn } from '@/lib/cn'
import { Badge, Button, CheckRow, Field, Slider, TextInput } from '@/components/ui'
import { DEFAULT_PRICE, INDUSTRIES, LICENSES, robotLabel, ROBOT_TYPES, royaltySplit } from '../meta'
import { LICENSE_ORDER } from '../Checkout'
import { RoyaltyBar } from '../Royalty'
import { eligibility, priceError, type SellDraft, type StepKey } from './draft'

export interface StepProps {
  skill: Skill
  draft: SellDraft
  set: (patch: Partial<SellDraft>) => void
  expertName: string
  isExpert: boolean
}

function Intro({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="text-lg font-medium tracking-[-0.01em] text-fg">{title}</h2>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-fg-muted">{children}</p>
    </div>
  )
}

function CheckItem({ ok, warn, title, detail, action }: { ok: boolean; warn?: boolean; title: ReactNode; detail: ReactNode; action?: ReactNode }) {
  const Icon = ok ? CircleCheck : warn ? CircleAlert : CircleX
  return (
    <li className={cn('flex items-start gap-3 rounded-lg p-3.5 shadow-[inset_0_0_0_1px_var(--color-line)]', ok ? 'bg-ok/[0.04]' : warn ? 'bg-warn/[0.05]' : 'bg-fault/[0.05]')} data-ok={ok}>
      <Icon className={cn('mt-0.5 size-[18px] shrink-0', ok ? 'text-ok' : warn ? 'text-warn' : 'text-fault')} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-fg">{title}</div>
        <div className="mt-0.5 text-xs text-fg-subtle">{detail}</div>
      </div>
      {action}
    </li>
  )
}

export function CheckStep({ skill, expertName }: StepProps) {
  const e = eligibility(skill)
  const v = skill.verification
  const own = skill.steps.filter((s) => s.why_source === 'expert').length
  const pending = (skill.qa ?? []).filter((q) => !q.answer).length
  return (
    <div data-testid="sell-step-check">
      <Intro title="Only ready, verified skills can be listed">
        A robot maker pays for a skill because it is real human know-how. Two things travel with every listing and make that believable: a
        verification certificate showing the recording is a real camera filming a real bench, and the expert’s signed consent.
      </Intro>
      <ul className="space-y-2">
        <CheckItem
          ok={e.ready}
          title="Processed on the box"
          detail={e.ready ? `${skill.steps.length} steps, a 3D twin, an SOP and a robot program.` : `The skill is ${skill.status}. It needs to finish processing first.`}
        />
        <CheckItem
          ok={e.verified}
          title={e.verified ? `Verified as a real recording (score ${fmtScorePct(v.score)})` : v?.status === 'suspect' ? 'Failed the real-camera check' : 'Not verified yet'}
          detail={
            e.verified
              ? `VGGT rebuilt the scene from ${String(v.details?.views ?? 4)} views and they agree on one rigid scene.`
              : v?.status === 'suspect'
                ? 'The views drift the way AI-made video does. A suspect recording cannot be listed.'
                : 'Run Check on the skill page: VGGT rebuilds the scene in 3D and scores it.'
          }
          action={
            !e.verified ? (
              <Link to={`/skills/${skill.id}`} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-ion hover:underline">
                Open skill <ArrowRight className="size-3" />
              </Link>
            ) : undefined
          }
        />
        <CheckItem
          ok={own > 0 || pending === 0}
          warn
          title={`${own} of ${skill.steps.length} reasons in ${expertName.split(' ')[0]}’s own words`}
          detail={
            pending > 0
              ? `${pending} “why” ${pending === 1 ? 'question is' : 'questions are'} still open. Answers in the expert’s words are what buyers value most; you can still list now.`
              : 'The rest were inferred from the recording and are labelled that way for buyers.'
          }
          action={
            pending > 0 ? (
              <Link to={`/skills/${skill.id}`} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-ion hover:underline">
                Answer <ArrowRight className="size-3" />
              </Link>
            ) : undefined
          }
        />
      </ul>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          { icon: ScanEye, title: 'Real, not generated', body: 'Robots trained on AI-made video learn physics that does not exist. VGGT proves a real camera filmed this.' },
          { icon: UserRound, title: 'Given, not taken', body: 'The expert decides what leaves the plant and is paid every time it is licensed.' },
          { icon: Lock, title: 'Clean by design', body: 'Packs carry motion, gaze and text. Video and faces stay on the box.' },
        ].map((x) => (
          <div key={x.title} className="rounded-lg bg-white/[0.02] p-3.5 shadow-[inset_0_0_0_1px_var(--color-line)]">
            <x.icon className="size-4 text-ion" aria-hidden />
            <div className="mt-2 text-[13px] font-medium text-fg">{x.title}</div>
            <p className="mt-1 text-xs leading-relaxed text-fg-subtle">{x.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ConsentStep({ draft, set, expertName, isExpert }: StepProps) {
  return (
    <div data-testid="sell-step-consent">
      <Intro title={`${expertName} confirms what is shared`}>
        Consent is the expert’s to give, not the plant’s. Motion and gaze are what a robot learns from, so every listing shares them. The
        expert’s spoken reasons, as text, are their choice. The video and faces never leave the box.
      </Intro>
      <div className="eyebrow mb-2">Shared with licensees</div>
      <div className="grid gap-2">
        <CheckRow checked title="Motion: hand and body tracks, 3D twin" description="Required: this is what a robot policy learns from." />
        <CheckRow checked title="Gaze: where the expert looked, and when" description="Required: where to look is part of the skill (the gauge before the valve)." />
        <CheckRow
          checked={draft.voiceText}
          onChange={(v) => set({ voiceText: v })}
          testId="consent-voice-text"
          title={`${expertName.split(' ')[0]}’s words, as text`}
          description="The transcribed “why” answers and step notes. No audio, no voiceprint."
        />
      </div>
      <div className="eyebrow mt-5 mb-2">Never shared</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <CheckRow checked={false} locked title="Raw video" description="Stays on the Tacit box in the plant." />
        <CheckRow checked={false} locked title="Faces" description="No face images or face data in any pack." />
      </div>
      <div className="mt-5">
        <CheckRow
          checked={draft.confirmed}
          onChange={(v) => set({ confirmed: v })}
          testId="consent-confirm"
          title={`I, ${expertName}, agree that the items above may be licensed to robot makers through the Tacit Skill Exchange.`}
          description="I am paid my share of every license fee. The recording itself stays on the box."
        />
        {draft.confirmed && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex items-baseline justify-between rounded-lg bg-ion/[0.05] px-4 py-3 shadow-[inset_0_0_0_1px_rgb(60_215_255/0.25)]">
            <span className="font-serif text-2xl text-fg italic">{expertName}</span>
            <span className="telemetry text-[11px] text-fg-subtle">signed {fmtDate(new Date().toISOString(), true)}</span>
          </motion.div>
        )}
        {!isExpert && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-warn" role="alert">
            <CircleAlert className="size-3.5" /> Only {expertName} can sign. Switch to them in the top bar.
          </p>
        )}
      </div>
    </div>
  )
}

export function PricesStep({ draft, set, skill }: StepProps) {
  const err = priceError(draft.price)
  const split = { expert: draft.expertShare, plant: 1 - draft.expertShare }
  const ascending = draft.price.training <= draft.price.robot_deploy && draft.price.robot_deploy <= draft.price.exclusive
  const setPrice = (t: LicenseType, v: string) => set({ price: { ...draft.price, [t]: v === '' ? 0 : Math.round(Number(v) * 100) / 100 } })
  return (
    <div data-testid="sell-step-prices">
      <Intro title="Set a price for each license type">
        Buyers choose the rights they need. The suggested prices are where most skills on the Exchange start; you can change them.
      </Intro>
      <div className="space-y-2">
        {LICENSE_ORDER.map((t) => {
          const m = LICENSES[t]
          const earn = royaltySplit(draft.price[t] || 0, split).expert
          return (
            <div key={t} className="grid items-center gap-3 rounded-lg bg-white/[0.02] p-3.5 shadow-[inset_0_0_0_1px_var(--color-line)] sm:grid-cols-[1fr_160px]">
              <div className="flex items-start gap-3">
                <m.icon className="mt-0.5 size-4 shrink-0 text-ion" aria-hidden />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-fg">{m.label}</div>
                  <div className="mt-0.5 text-xs text-fg-subtle">{m.rights.join(' · ')}</div>
                  <div className="mt-1 text-[11px] text-fg-subtle">
                    {skill.expert.name.split(' ')[0]} earns <span className="telemetry text-ion">{fmtMoney(earn, 'USD', 2)}</span> per license
                  </div>
                </div>
              </div>
              <label className="relative flex items-center">
                <span className="sr-only">{m.label} price in US dollars</span>
                <span className="pointer-events-none absolute left-3 text-sm text-fg-subtle">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step={1}
                  value={draft.price[t] || ''}
                  onChange={(e) => setPrice(t, e.target.value)}
                  data-testid={`price-${t}`}
                  className="telemetry h-10 w-full rounded-md bg-ink-900 pr-3 pl-7 text-right text-sm text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)] outline-none focus:shadow-[inset_0_0_0_1px_var(--color-ion),0_0_0_3px_rgb(60_215_255/0.15)]"
                />
              </label>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <Button variant="ghost" size="xs" onClick={() => set({ price: { ...DEFAULT_PRICE } })}>
          Use suggested prices
        </Button>
        {err && (
          <span className="flex items-center gap-1 text-fault" role="alert">
            <CircleX className="size-3.5" /> {err}
          </span>
        )}
        {!err && !ascending && (
          <span className="flex items-center gap-1 text-warn">
            <CircleAlert className="size-3.5" /> Usually training ≤ robot deploy ≤ exclusive, since each grants more.
          </span>
        )}
      </div>
    </div>
  )
}

export function SplitStep({ draft, set, skill }: StepProps) {
  const split = { expert: draft.expertShare, plant: 1 - draft.expertShare }
  const first = skill.expert.name.split(' ')[0]
  const deploy = draft.price.robot_deploy
  const r = royaltySplit(deploy, split)
  return (
    <div data-testid="sell-step-split">
      <Intro title="Split every license between the expert and the plant">
        The expert’s share is why experts say yes to being recorded. The plant’s share pays for the box and the time on the line. The default is
        70/30.
      </Intro>
      <div className="rounded-xl bg-white/[0.02] p-5 shadow-[inset_0_0_0_1px_var(--color-line)]">
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-fg-subtle">
              <UserRound className="size-3.5 text-ion" /> {skill.expert.name}
            </div>
            <div className="telemetry mt-1 text-4xl font-medium text-ion" data-testid="split-expert">
              {fmtPct(split.expert)}
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5 text-xs text-fg-subtle">
              {draft.plant} <Factory className="size-3.5 text-data-right" />
            </div>
            <div className="telemetry mt-1 text-4xl font-medium text-data-right" data-testid="split-plant">
              {fmtPct(split.plant)}
            </div>
          </div>
        </div>
        <Slider
          className="mt-5"
          label={`${skill.expert.name}'s share of each license`}
          value={Math.round(draft.expertShare * 100)}
          min={50}
          max={90}
          step={5}
          onChange={(v) => set({ expertShare: v / 100 })}
          testId="split-slider"
        />
        <div className="telemetry mt-1.5 flex justify-between text-[10px] text-fg-faint">
          <span>50%</span>
          <span>70% default</span>
          <span>90%</span>
        </div>
      </div>
      <div className="mt-4 rounded-xl bg-ion/[0.04] p-5 shadow-[inset_0_0_0_1px_rgb(60_215_255/0.2)]" data-testid="split-example">
        <div className="eyebrow mb-2">Worked example</div>
        <p className="text-[14px] leading-relaxed text-fg">
          Atlas Robotics licenses this skill to deploy on its robots for <span className="telemetry">{fmtMoney(deploy)}</span>.{' '}
          <span className="text-ion">
            {first} gets <span className="telemetry font-medium">{fmtMoney(r.expert, 'USD', 2)}</span>
          </span>{' '}
          and{' '}
          <span className="text-data-right">
            the plant gets <span className="telemetry font-medium">{fmtMoney(r.plant, 'USD', 2)}</span>
          </span>
          , booked to the ledger the moment the license is issued.
        </p>
        <RoyaltyBar className="mt-4" amount={deploy} split={split} expertName={skill.expert.name} plantName={draft.plant} />
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
          {LICENSE_ORDER.map((t) => {
            const x = royaltySplit(draft.price[t], split)
            return (
              <div key={t} className="rounded-md bg-ink-950/50 px-3 py-2 shadow-[inset_0_0_0_1px_var(--color-line)]">
                <div className="text-fg-subtle">{LICENSES[t].label}</div>
                <div className="telemetry mt-0.5 text-fg">{fmtMoney(draft.price[t])}</div>
                <div className="telemetry mt-0.5 text-[11px] text-ion">→ {fmtMoney(x.expert, 'USD', 2)}</div>
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-xs text-fg-subtle">
          Ten robot makers deploying it would pay {first} <span className="telemetry text-fg">{fmtMoney(r.expert * 10, 'USD', 2)}</span>.
        </p>
      </div>
    </div>
  )
}

export function MarketStep({ draft, set }: StepProps) {
  const industries = INDUSTRIES.includes(draft.industry) ? INDUSTRIES : [...INDUSTRIES, draft.industry]
  const toggle = (k: string) => set({ robots: draft.robots.includes(k) ? draft.robots.filter((r) => r !== k) : [...draft.robots, k] })
  return (
    <div data-testid="sell-step-market">
      <Intro title="Where this skill fits">Buyers filter the Exchange by industry and by the robots they build. Pick every robot the skill makes sense for.</Intro>
      <div className="eyebrow mb-2">Industry</div>
      <div role="radiogroup" aria-label="Industry" className="flex flex-wrap gap-2">
        {industries.map((i) => {
          const on = draft.industry === i
          return (
            <button
              key={i}
              role="radio"
              aria-checked={on}
              onClick={() => set({ industry: i })}
              data-testid={`industry-${i}`}
              className={cn(
                'h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors',
                on ? 'bg-ion text-ion-ink shadow-[0_0_16px_-4px_rgb(60_215_255/0.7)]' : 'bg-white/[0.03] text-fg-muted shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:text-fg',
              )}
            >
              {i}
            </button>
          )
        })}
      </div>
      <div className="eyebrow mt-6 mb-2">Robot types</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {ROBOT_TYPES.map((r) => {
          const on = draft.robots.includes(r.key)
          return (
            <button
              key={r.key}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(r.key)}
              data-testid={`robot-${r.key}`}
              className={cn(
                'flex items-center gap-3 rounded-lg p-3 text-left transition-colors',
                on ? 'bg-ion/[0.07] shadow-[inset_0_0_0_1px_rgb(60_215_255/0.5)]' : 'bg-white/[0.02] shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-white/[0.04]',
              )}
            >
              <span className={cn('grid size-[18px] shrink-0 place-items-center rounded-[4px]', on ? 'bg-ion text-ion-ink' : 'shadow-[inset_0_0_0_1.5px_var(--color-line-bright)]')}>
                {on && <Check className="size-3.5" strokeWidth={3} />}
              </span>
              <Bot className={cn('size-4', on ? 'text-ion' : 'text-fg-subtle')} aria-hidden />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-fg">{r.label}</span>
                <span className="block text-xs text-fg-subtle">{r.detail}</span>
              </span>
            </button>
          )
        })}
      </div>
      {draft.robots.length === 0 && <p className="mt-2 text-xs text-fault">Pick at least one robot type.</p>}
      <Field label="Plant" hint="Shown on the listing and on every receipt as the plant's royalty line." className="mt-6 max-w-md">
        <TextInput value={draft.plant} onChange={(e) => set({ plant: e.target.value })} aria-label="Plant" data-testid="plant-name" />
      </Field>
    </div>
  )
}

function ReviewRow({ label, children, onEdit }: { label: string; children: ReactNode; onEdit: () => void }) {
  return (
    <div className="flex items-start gap-4 py-3">
      <div className="w-32 shrink-0 text-xs text-fg-subtle">{label}</div>
      <div className="min-w-0 flex-1 text-[13px] text-fg">{children}</div>
      <button onClick={onEdit} className="inline-flex shrink-0 items-center gap-1 text-xs text-fg-subtle hover:text-ion" aria-label={`Edit ${label.toLowerCase()}`}>
        <Pencil className="size-3" /> Edit
      </button>
    </div>
  )
}

export function ReviewStep({ skill, draft, goto, expertName }: StepProps & { goto: (k: StepKey) => void }) {
  const split = { expert: draft.expertShare, plant: 1 - draft.expertShare }
  return (
    <div data-testid="sell-step-review">
      <Intro title="Review and publish">Publishing puts the skill on the Skill Exchange right away. Robot makers can license it as soon as it is live.</Intro>
      <div className="divide-y divide-line rounded-lg bg-white/[0.02] px-4 shadow-[inset_0_0_0_1px_var(--color-line)]">
        <ReviewRow label="Skill" onEdit={() => goto('check')}>
          {skill.title}
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge tone="ok">Verified {fmtScorePct(skill.verification.score)}</Badge>
            <Badge>{skill.steps.length} steps</Badge>
          </div>
        </ReviewRow>
        <ReviewRow label="Consent" onEdit={() => goto('consent')}>
          <span className="flex items-center gap-1.5">
            <MessageSquareQuote className="size-3.5 text-ion" />
            Motion, gaze{draft.voiceText ? ' and their words as text' : ''}. Never video or faces.
          </span>
          <span className="mt-0.5 block text-xs text-fg-subtle">{draft.confirmed ? `Signed by ${expertName}` : 'Not signed'}</span>
        </ReviewRow>
        <ReviewRow label="Prices" onEdit={() => goto('prices')}>
          <span className="telemetry">
            {LICENSE_ORDER.map((t) => `${LICENSES[t].label} ${fmtMoney(draft.price[t])}`).join(' · ')}
          </span>
        </ReviewRow>
        <ReviewRow label="Royalty split" onEdit={() => goto('split')}>
          <span className="telemetry">
            {fmtPct(split.expert)} {expertName} · {fmtPct(split.plant)} plant
          </span>
        </ReviewRow>
        <ReviewRow label="Market" onEdit={() => goto('market')}>
          {draft.industry} · {draft.robots.map(robotLabel).join(', ')}
          <span className="mt-0.5 block text-xs text-fg-subtle">{draft.plant}</span>
        </ReviewRow>
      </div>
    </div>
  )
}
