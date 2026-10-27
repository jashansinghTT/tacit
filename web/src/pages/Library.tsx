import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Download, FileSignature, Library as LibraryIcon, ShieldCheck, Store } from 'lucide-react'
import type { ExLibraryItem } from '@/lib/api/exchange'
import { fmtDate, fmtInt, fmtMoney } from '@/lib/format'
import { personaOf, useApp } from '@/lib/store'
import { cn } from '@/lib/cn'
import { Page, PageHeader } from '@/components/layout/Page'
import { Badge, Button, ButtonLink, EmptyState, ErrorState, Panel, Skeleton, Stat, toast } from '@/components/ui'
import { ExchangeNav, useSwitchPersona } from '@/features/exchange/ExchangeNav'
import { useExLibrary, useExListing } from '@/features/exchange/hooks'
import { LICENSES, robotLabel, termsFor } from '@/features/exchange/meta'
import { MotionSignature } from '@/features/exchange/MotionSignature'
import { PackTree } from '@/features/exchange/Provenance'

function Inside({ listingId, skillId, type }: { listingId: string; skillId: string; type: ExLibraryItem['license']['license_type'] }) {
  const d = useExListing(listingId)
  if (!d.data) return <Skeleton className="m-4 h-48" />
  const l = d.data
  const v = l.skill.verification
  return (
    <div className="grid gap-4 border-t border-line p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-testid="library-inside">
      <PackTree contents={l.contents} root={`tacit-skill-${skillId}`} />
      <div className="space-y-3 text-[13px]">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" />
          <div>
            <div className="text-fg">Verification certificate</div>
            <div className="text-xs text-fg-subtle">
              {v?.method ?? 'VGGT multi-view consistency'}: score <span className="telemetry text-fg-muted">{v?.score?.toFixed(2) ?? '–'}</span>, {v?.status ?? 'pending'}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <FileSignature className="mt-0.5 size-4 shrink-0 text-ion" />
          <div>
            <div className="text-fg">Consent record</div>
            <div className="text-xs text-fg-subtle">
              Signed by {l.expert.name} {l.consent.signed_at ? `on ${fmtDate(l.consent.signed_at)}` : ''}. Motion, gaze{l.consent.voice_text ? ', their words as text' : ''}. Never video or faces.
            </div>
          </div>
        </div>
        <div className="rounded-md bg-white/[0.02] p-3 shadow-[inset_0_0_0_1px_var(--color-line)]">
          <div className="eyebrow mb-1">Your {LICENSES[type].label.toLowerCase()} license</div>
          <p className="text-xs text-fg-muted">{termsFor(l, type)}</p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-subtle">
          <span>
            <span className="telemetry text-fg-muted">{l.skill.steps.length}</span> steps
          </span>
          <span>
            <span className="telemetry text-fg-muted">{l.contents.episodes ? fmtInt(l.contents.episodes) : 0}</span> sim episodes
          </span>
          <span>Policy: {l.contents.policy ? 'trained' : 'not yet'}</span>
          <span>{l.contents.formats.join(', ')}</span>
        </div>
      </div>
    </div>
  )
}

function PackRow({ item }: { item: ExLibraryItem }) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const lic = item.license
  const l = item.listing
  const m = LICENSES[lic.license_type] ?? LICENSES.robot_deploy
  const download = lic.download ?? `/api/exchange/licenses/${lic.id}/pack.zip`
  return (
    <li className="panel overflow-hidden" data-testid={`library-item-${lic.id}`} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
        <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-md bg-ink-950 shadow-[inset_0_0_0_1px_var(--color-line)] md:w-44">
          <div className="dot-bg absolute inset-0 opacity-60" aria-hidden />
          {l && <MotionSignature skillId={l.skill_id} playing={hover} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={lic.license_type === 'exclusive' ? 'warn' : lic.license_type === 'robot_deploy' ? 'ion' : 'neutral'} icon={<m.icon className="size-3" />}>
              {m.label}
            </Badge>
            {l?.verified && (
              <Badge tone="ok" icon={<ShieldCheck className="size-3" />}>
                Verified
              </Badge>
            )}
          </div>
          {l ? (
            <Link to={`/exchange/${l.id}`} className="mt-1.5 block text-[15px] font-medium text-fg hover:text-ion">
              {l.title}
            </Link>
          ) : (
            <div className="mt-1.5 text-[15px] font-medium text-fg-muted">Listing no longer on the Exchange</div>
          )}
          <div className="mt-0.5 text-xs text-fg-subtle">
            {l ? `${l.expert.name} · ${l.plant} · ${l.robot_types.map(robotLabel).join(', ')}` : ''}
          </div>
          <div className="telemetry mt-1.5 text-[11px] text-fg-faint">
            {lic.id} · licensed {fmtDate(lic.created_at, true)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 md:flex-col md:items-end">
          <div className="telemetry text-lg font-medium text-fg">{fmtMoney(lic.amount ?? null, lic.currency ?? 'USD', 2)}</div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} iconRight={<ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />} data-testid="library-inside-toggle">
              What’s inside
            </Button>
            <a
              href={download}
              download
              data-testid="library-download"
              onClick={() => toast.ok('Skill pack downloading', l?.title)}
              className="inline-flex h-8 items-center gap-2 rounded-md bg-ion px-3 text-[13px] font-medium text-ion-ink shadow-[0_0_0_1px_rgb(60_215_255/0.6),0_8px_24px_-8px_rgb(60_215_255/0.6)] hover:bg-[#6ee2ff]"
            >
              <Download className="size-3.5" /> Download
            </a>
          </div>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && l && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <Inside listingId={l.id} skillId={l.skill_id} type={lic.license_type} />
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}

export default function LibraryPage() {
  const persona = useApp((s) => s.persona)
  const p = personaOf(persona)
  const lib = useExLibrary()
  const switchTo = useSwitchPersona()
  const items = useMemo(() => lib.data ?? [], [lib.data])
  const stats = useMemo(() => {
    let total = 0
    let toExperts = 0
    const experts = new Set<string>()
    let deploy = 0
    for (const it of items) {
      const a = it.license.amount ?? 0
      total += a
      if (it.listing) {
        toExperts += a * it.listing.royalty_split.expert
        experts.add(it.listing.expert.id)
      }
      if (it.license.license_type !== 'training') deploy++
    }
    return { total, toExperts: Math.round(toExperts * 100) / 100, experts: experts.size, deploy }
  }, [items])

  return (
    <Page testId="page-library">
      <ExchangeNav />
      <PageHeader
        eyebrow="Library"
        title="Licensed skill packs"
        description="Every skill you licensed, ready to download: motion tracks and the 3D twin, the expert's reasons, the SOP, the robot program and policy, and the certificates. No video, no faces."
        actions={
          <ButtonLink to="/exchange" variant="secondary" icon={<Store className="size-4" />}>
            Browse the Exchange
          </ButtonLink>
        }
      />
      {lib.isError ? (
        <Panel>
          <ErrorState error={lib.error} onRetry={() => lib.refetch()} />
        </Panel>
      ) : lib.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : items.length === 0 ? (
        <Panel data-testid="library-empty">
          <EmptyState
            icon={<LibraryIcon className="size-5" />}
            title={p.role === 'buyer' ? 'No skill packs yet' : `${p.name} has not licensed any skills`}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <ButtonLink to="/exchange" variant="primary" size="sm">
                  Browse the Skill Exchange
                </ButtonLink>
                {p.role !== 'buyer' && (
                  <Button variant="secondary" size="sm" onClick={() => switchTo('u_atlas')}>
                    View as Atlas Robotics
                  </Button>
                )}
              </div>
            }
          >
            {p.role === 'buyer'
              ? 'License a verified skill on the Exchange and its pack lands here, with the receipt and the license terms.'
              : 'Libraries belong to the robot makers who license skills. Atlas Robotics is the demo buyer.'}
          </EmptyState>
        </Panel>
      ) : (
        <>
          <Panel className="mb-5" bodyClassName="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
            <Stat label="Skill packs" value={fmtInt(items.length)} />
            <Stat label="Deployable on robots" value={fmtInt(stats.deploy)} tone="ion" hint="robot deploy or exclusive" />
            <Stat label="Licensed (demo)" value={fmtMoney(stats.total, 'USD', 2)} hint="no payment was taken" />
            <Stat label="Paid to experts" value={fmtMoney(stats.toExperts, 'USD', 2)} tone="ok" hint={`${stats.experts} ${stats.experts === 1 ? 'expert' : 'experts'} earned from your licenses`} />
          </Panel>
          <ul className="space-y-3" data-testid="library-list">
            {items.map((it) => (
              <PackRow key={it.license.id} item={it} />
            ))}
          </ul>
        </>
      )}
    </Page>
  )
}
