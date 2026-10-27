import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Check, CircleCheck, Download, FlaskConical, Library, Receipt as ReceiptIcon, UserRound } from 'lucide-react'
import type { LicenseType } from '@/lib/api'
import type { ExListingDetail, LicenseResult } from '@/lib/api/exchange'
import { useUsers } from '@/lib/api/queries'
import { fmtDate, fmtMoney, fmtPct } from '@/lib/format'
import { personaOf, useApp } from '@/lib/store'
import { cn } from '@/lib/cn'
import { Avatar, Badge, Button, CheckRow, Dialog, toast } from '@/components/ui'
import { useLicense } from './hooks'
import { LICENSES, royaltySplit, termsFor } from './meta'
import { RoyaltyBar } from './Royalty'
import { useSwitchPersona } from './ExchangeNav'

export const LICENSE_ORDER: LicenseType[] = ['training', 'robot_deploy', 'exclusive']

/** Radio cards for the three license types with their prices. */
export function LicenseOptions({ listing, value, onChange, dense }: { listing: ExListingDetail; value: LicenseType; onChange: (t: LicenseType) => void; dense?: boolean }) {
  const name = useId()
  return (
    <div role="radiogroup" aria-label="License type" className="flex flex-col gap-2">
      {LICENSE_ORDER.map((t) => {
        const m = LICENSES[t]
        const on = t === value
        return (
          <label
            key={t}
            data-testid={`license-option-${t}`}
            className={cn(
              'relative flex cursor-pointer items-center gap-3 rounded-lg transition-[background-color,box-shadow]',
              dense ? 'p-2.5' : 'p-3',
              on ? 'bg-ion/[0.07] shadow-[inset_0_0_0_1px_rgb(60_215_255/0.55),0_0_24px_-12px_rgb(60_215_255/0.6)]' : 'bg-white/[0.02] shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-white/[0.04]',
            )}
          >
            <input type="radio" name={name} value={t} checked={on} onChange={() => onChange(t)} className="peer sr-only" />
            <span
              className={cn(
                'grid size-4 shrink-0 place-items-center rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ion',
                on ? 'bg-ion shadow-[0_0_10px_rgb(60_215_255/0.6)]' : 'shadow-[inset_0_0_0_1.5px_var(--color-line-bright)]',
              )}
              aria-hidden
            >
              {on && <span className="size-1.5 rounded-full bg-ion-ink" />}
            </span>
            <m.icon className={cn('size-4 shrink-0', on ? 'text-ion' : 'text-fg-subtle')} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-fg">{m.label}</span>
              {!dense && <span className="block truncate text-[11px] text-fg-subtle">{m.short}</span>}
            </span>
            <span className="telemetry text-[15px] font-medium text-fg">{fmtMoney(listing.price[t], listing.currency)}</span>
          </label>
        )
      })}
    </div>
  )
}

/** The listing's buy box: license type, terms, royalty preview and the License button. */
export function LicensePanel({ listing, onLicense, type, setType }: { listing: ExListingDetail; onLicense: () => void; type: LicenseType; setType: (t: LicenseType) => void }) {
  const persona = useApp((s) => s.persona)
  const p = personaOf(persona)
  const own = listing.expert.id === persona
  const switchTo = useSwitchPersona()
  const amount = listing.price[type]
  return (
    <div className="panel p-4" data-tour="license-panel" data-testid="license-panel">
      <div className="flex items-center justify-between">
        <div className="eyebrow">License this skill</div>
        <Badge tone="violet" icon={<FlaskConical className="size-3" />} title="No payment is taken anywhere in Tacit">
          Demo checkout
        </Badge>
      </div>
      <div className="mt-3">
        <LicenseOptions listing={listing} value={type} onChange={setType} />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-fg-muted" data-testid="license-terms">
        {termsFor(listing, type)}
      </p>
      <div className="mt-4 rounded-lg bg-white/[0.02] p-3 shadow-[inset_0_0_0_1px_var(--color-line)]">
        <div className="mb-2 text-[11px] text-fg-subtle">Where the {fmtMoney(amount, listing.currency)} goes</div>
        <RoyaltyBar amount={amount} split={listing.royalty_split} expertName={listing.expert.name} plantName={listing.plant} currency={listing.currency} compact />
      </div>
      {own ? (
        <div className="mt-4 rounded-lg bg-ion/[0.05] p-3 text-xs text-fg-muted shadow-[inset_0_0_0_1px_rgb(60_215_255/0.2)]">
          This is your listing. Robot makers license it here; you earn {fmtPct(listing.royalty_split.expert)} of every fee.
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="xs" variant="secondary" onClick={() => switchTo('u_atlas')} data-testid="view-as-buyer">
              View as Atlas Robotics
            </Button>
            <Link to="/earnings" className="inline-flex h-7 items-center gap-1 px-1 text-xs font-medium text-ion hover:underline">
              Your earnings <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>
      ) : (
        <>
          <Button variant="primary" size="lg" className="mt-4 w-full" onClick={onLicense} data-testid="license-button">
            License for {fmtMoney(amount, listing.currency)}
          </Button>
          {p.role !== 'buyer' && (
            <p className="mt-2 text-center text-[11px] text-fg-subtle">
              You are browsing as {p.name}.{' '}
              <button className="font-medium text-ion hover:underline" onClick={() => switchTo('u_atlas')}>
                Switch to Atlas Robotics
              </button>{' '}
              to buy as the robot maker.
            </p>
          )}
        </>
      )}
      <p className="mt-3 text-center text-[11px] text-fg-faint">Demo checkout: no payment is taken. A license record and a receipt are created.</p>
    </div>
  )
}

function ReceiptView({ result, listing, buyer }: { result: LicenseResult; listing: ExListingDetail; buyer: string }) {
  const users = useUsers()
  const nameOf = (to: string) => (to === 'plant' ? listing.plant : users.data?.find((u) => u.id === to)?.name ?? (to === listing.expert.id ? listing.expert.name : to))
  const r = result.receipt
  const type = r.license_type ?? 'robot_deploy'
  return (
    <div data-testid="license-receipt">
      <div className="flex flex-col items-center text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          className="grid size-14 place-items-center rounded-full bg-ok/15 text-ok shadow-[inset_0_0_0_1px_rgb(61_220_151/0.4),0_0_40px_-6px_rgb(61_220_151/0.6)]"
        >
          <CircleCheck className="size-7" />
        </motion.div>
        <h3 className="mt-3 text-lg font-medium text-fg">License issued</h3>
        <p className="mt-1 max-w-sm text-[13px] text-fg-subtle">
          {listing.title} is in {buyer}’s library. The royalties below were booked to the ledger.
        </p>
      </div>
      <div className="mt-5 overflow-hidden rounded-lg bg-ink-900 shadow-[inset_0_0_0_1px_var(--color-line-strong)]">
        <div className="flex items-center justify-between border-b border-dashed border-line-strong px-4 py-3">
          <div className="flex items-center gap-2 text-[13px] font-medium text-fg">
            <ReceiptIcon className="size-4 text-fg-subtle" /> Receipt
          </div>
          <span className="rotate-[-4deg] rounded-sm px-2 py-0.5 text-[10px] font-semibold tracking-[0.16em] text-data-right uppercase shadow-[inset_0_0_0_1.5px_rgb(167_139_250/0.6)]" data-testid="receipt-demo-stamp">
            Demo · no payment taken
          </span>
          <span className="telemetry text-[11px] text-fg-subtle" data-testid="license-id">
            {result.license_id}
          </span>
        </div>
        <dl className="divide-y divide-line px-4 text-[13px]">
          <div className="flex justify-between py-2">
            <dt className="text-fg-subtle">License</dt>
            <dd className="text-fg">{LICENSES[type].label}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-fg-subtle">Licensee</dt>
            <dd className="text-fg">{buyer}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-fg-subtle">Issued</dt>
            <dd className="telemetry text-fg">{fmtDate(r.issued_at ?? new Date().toISOString(), true)}</dd>
          </div>
          <div className="flex items-baseline justify-between py-2">
            <dt className="text-fg-subtle">Amount</dt>
            <dd className="telemetry text-lg font-medium text-fg" data-testid="receipt-amount">
              {fmtMoney(r.amount, r.currency, 2)}
            </dd>
          </div>
        </dl>
        <div className="border-t border-line bg-white/[0.015] px-4 py-3">
          <div className="eyebrow mb-2">Royalties booked</div>
          <ul className="space-y-1.5">
            {r.royalties.map((x) => (
              <li key={x.to} className="flex items-center justify-between text-[13px]" data-testid={`royalty-${x.to}`}>
                <span className="flex items-center gap-2 text-fg-muted">
                  <span className={cn('size-1.5 rounded-full', x.to === 'plant' ? 'bg-data-right' : 'bg-ion')} />
                  {nameOf(x.to)}
                  <span className="telemetry text-[11px] text-fg-faint">{fmtPct(r.amount ? x.amount / r.amount : 0)}</span>
                </span>
                <span className={cn('telemetry font-medium', x.to === 'plant' ? 'text-data-right' : 'text-ion')}>{fmtMoney(x.amount, r.currency, 2)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <a
          href={result.download}
          download
          data-testid="download-pack"
          onClick={() => toast.ok('Skill pack downloading', 'Motion, SOP, robot program and certificates. No video.')}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-ion px-5 text-[15px] font-medium text-ion-ink shadow-[0_0_0_1px_rgb(60_215_255/0.6),0_8px_24px_-8px_rgb(60_215_255/0.6),inset_0_1px_0_rgb(255_255_255/0.45)] transition-colors hover:bg-[#6ee2ff]"
        >
          <Download className="size-4" /> Download skill pack (.zip)
        </a>
        <Link
          to="/library"
          data-testid="open-library"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink-700 px-5 text-sm font-medium text-fg shadow-[0_0_0_1px_var(--color-line-strong)] hover:bg-ink-600"
        >
          <Library className="size-4" /> Open library
        </Link>
      </div>
    </div>
  )
}

/** Review → confirm → receipt. No card fields, no payment data: it says so at the top. */
export function CheckoutDialog({ listing, open, onClose, type, setType }: { listing: ExListingDetail; open: boolean; onClose: () => void; type: LicenseType; setType: (t: LicenseType) => void }) {
  const persona = useApp((s) => s.persona)
  const users = useUsers()
  const me = users.data?.find((u) => u.id === persona)
  const p = personaOf(persona)
  const buyer = me?.name ?? p.name
  const license = useLicense(listing.id)
  const [agree, setAgree] = useState(false)
  const [result, setResult] = useState<LicenseResult | null>(null)
  useEffect(() => {
    if (open) {
      setAgree(false)
      setResult(null)
      license.reset()
    }
    // reset only when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const amount = listing.price[type]
  const r = royaltySplit(amount, listing.royalty_split)
  const confirm = () =>
    license.mutate(type, {
      onSuccess: (res) => setResult(res),
      onError: (e) => toast.error('The license was not issued', (e as Error).message),
    })
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={result ? 'Your skill pack is ready' : 'License this skill'}
      description={result ? undefined : listing.title}
      size="md"
      testId="checkout-dialog"
      footer={
        result ? undefined : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={confirm} disabled={!agree} loading={license.isPending} data-testid="confirm-license" icon={<Check className="size-4" />}>
              Confirm demo license
            </Button>
          </>
        )
      }
    >
      {result ? (
        <ReceiptView result={result} listing={listing} buyer={buyer} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-[rgb(167_139_250/0.1)] p-3 shadow-[inset_0_0_0_1px_rgb(167_139_250/0.35)]" role="note" data-testid="demo-banner">
            <FlaskConical className="mt-0.5 size-4 shrink-0 text-data-right" />
            <div className="text-[13px]">
              <div className="font-medium text-fg">Demo checkout: no payment is taken</div>
              <div className="mt-0.5 text-xs text-fg-muted">Confirming creates a license record and a receipt, and books the royalties. There is no card form and no payment data anywhere in Tacit.</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-white/[0.02] p-3 shadow-[inset_0_0_0_1px_var(--color-line)]">
            <Avatar name={buyer} src={me?.avatar} size={32} />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-fg-subtle">Licensee</div>
              <div className="text-[13px] font-medium text-fg">{buyer}</div>
            </div>
            <Badge tone={p.role === 'buyer' ? 'violet' : 'neutral'} icon={<UserRound className="size-3" />}>
              {p.roleLabel}
            </Badge>
          </div>
          <LicenseOptions listing={listing} value={type} onChange={setType} dense />
          <div className="rounded-lg bg-white/[0.02] p-3 shadow-[inset_0_0_0_1px_var(--color-line)]">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-fg-muted">Total</span>
              <span className="telemetry text-xl font-medium text-fg" data-testid="checkout-total">
                {fmtMoney(amount, listing.currency, 2)}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-fg-subtle">
              {fmtMoney(r.expert, listing.currency, 2)} to {listing.expert.name} and {fmtMoney(r.plant, listing.currency, 2)} to {listing.plant}, booked the moment you confirm.
            </div>
          </div>
          <CheckRow
            checked={agree}
            onChange={setAgree}
            testId="agree-terms"
            title={`I agree to the ${LICENSES[type].label.toLowerCase()} license terms`}
            description={termsFor(listing, type)}
          />
        </div>
      )}
    </Dialog>
  )
}
