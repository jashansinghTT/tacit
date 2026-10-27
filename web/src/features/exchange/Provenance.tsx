// The three things that make a skill licensable, shown on the listing and in the sell wizard:
// the VGGT verification certificate, the expert's consent record, and what the pack contains.
import type { ReactNode } from 'react'
import { Ban, Check, File, FileJson, FileText, Folder, Lock, ScanEye, ShieldAlert, ShieldCheck, ShieldQuestion, Video } from 'lucide-react'
import type { Verification } from '@/lib/api'
import type { ExConsent, ListingContents } from '@/lib/api/exchange'
import { fmtDate, fmtInt } from '@/lib/format'
import { cn } from '@/lib/cn'
import { ChipTag, Meter, Panel, ScoreRing } from '@/components/ui'
import { reprojection } from './meta'

function Row({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-[13px]">
      <span className="text-fg-subtle" title={typeof hint === 'string' ? hint : undefined}>
        {label}
      </span>
      <span className="telemetry text-right text-fg">{children}</span>
    </div>
  )
}

const VERDICT = {
  verified: { icon: ShieldCheck, tone: 'text-ok', title: 'Real camera recording', body: 'The views agree on one rigid 3D scene.' },
  suspect: { icon: ShieldAlert, tone: 'text-fault', title: 'Suspect recording', body: 'The views disagree, as AI-made video does.' },
  pending: { icon: ShieldQuestion, tone: 'text-fg-subtle', title: 'Not checked yet', body: 'VGGT has not rebuilt this scene.' },
}

export function VerificationCertificate({ v, className }: { v: Verification | null | undefined; className?: string }) {
  const status = v?.status ?? 'pending'
  const verdict = VERDICT[status] ?? VERDICT.pending
  const d = (v?.details ?? {}) as Record<string, unknown>
  const rp = reprojection(d)
  const stability = typeof d.depth_stability === 'number' ? d.depth_stability : null
  const drift = typeof d.camera_drift === 'number' ? d.camera_drift : null
  return (
    <Panel
      className={className}
      eyebrow="Provenance"
      title="Verification certificate"
      actions={<ScanEye className="size-4 text-fg-subtle" aria-hidden />}
      data-testid="verification-certificate"
    >
      <div className="flex items-center gap-4">
        <ScoreRing value={v?.score ?? null} size={92} stroke={7} sub="score" label="Verification score" />
        <div className="min-w-0">
          <div className={cn('flex items-center gap-1.5 text-sm font-medium', verdict.tone)}>
            <verdict.icon className="size-4" aria-hidden />
            {verdict.title}
          </div>
          <p className="mt-1 text-xs text-fg-subtle">{verdict.body}</p>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-fg-subtle">
            VGGT-1B <ChipTag chip={0} />
          </div>
        </div>
      </div>
      <div className="mt-4 divide-y divide-line border-t border-line">
        <Row label="Method">{v?.method ?? 'VGGT multi-view consistency'}</Row>
        <Row label="Views compared">{typeof d.views === 'number' ? d.views : '–'}</Row>
        <Row label="Reprojection error" hint="How far the views disagree when projected onto each other">
          {rp?.label ?? '–'}
        </Row>
        <Row label="Depth stability">
          {stability != null ? (
            <span className="flex items-center gap-2">
              <Meter value={stability} tone={stability >= 0.8 ? 'ok' : 'warn'} className="w-16" label="Depth stability" />
              {stability.toFixed(2)}
            </span>
          ) : (
            '–'
          )}
        </Row>
        {drift != null && <Row label="Camera drift">{drift.toFixed(3)}</Row>}
        <Row label="Checked">{fmtDate(v?.checked_at, true)}</Row>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
        A real camera filming a real bench sees one rigid scene from every frame. VGGT rebuilds the scene in 3D from several frames and
        measures how well they agree; AI-made video drifts.
      </p>
    </Panel>
  )
}

const SHARED = [
  { key: 'motion', title: 'Motion', body: 'Hand and body tracks, 3D twin' },
  { key: 'gaze', title: 'Gaze', body: 'Where the expert looked, and when' },
  { key: 'voice_text', title: 'Their words, as text', body: 'Spoken “why” answers, transcribed' },
] as const

const NEVER = [
  { key: 'raw_video', title: 'Raw video', icon: Video },
  { key: 'face', title: 'Faces', icon: Ban },
] as const

export function ConsentRecord({ consent, expertName, className }: { consent: ExConsent | null | undefined; expertName: string; className?: string }) {
  const c = consent ?? { motion: false, gaze: false, voice_text: false, raw_video: false }
  const signed = Boolean(c.signed_at || c.expert_confirmed)
  return (
    <Panel className={className} eyebrow="Provenance" title="Consent record" data-testid="consent-record">
      <div className={cn('flex items-center gap-3 rounded-lg p-3', signed ? 'bg-ion/[0.06] shadow-[inset_0_0_0_1px_rgb(60_215_255/0.25)]' : 'bg-white/[0.03]')}>
        <div className="font-serif text-2xl leading-none text-fg italic">{signed ? expertName : 'Unsigned'}</div>
        <div className="ml-auto text-right text-[11px] text-fg-subtle">
          <div>{signed ? 'Signed by the expert' : 'No signature on file'}</div>
          <div className="telemetry">{fmtDate(c.signed_at, true)}</div>
        </div>
      </div>
      <div className="mt-4">
        <div className="eyebrow mb-2">Shared with licensees</div>
        <ul className="space-y-1.5">
          {SHARED.map((s) => {
            const on = Boolean(c[s.key])
            return (
              <li key={s.key} className="flex items-start gap-2.5 text-[13px]" data-testid={`consent-${s.key}`} data-on={on}>
                <span className={cn('mt-0.5 grid size-4 shrink-0 place-items-center rounded-[4px]', on ? 'bg-ion text-ion-ink' : 'shadow-[inset_0_0_0_1.5px_var(--color-line-bright)]')}>
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span>
                  <span className={on ? 'text-fg' : 'text-fg-subtle line-through'}>{s.title}</span>
                  <span className="block text-xs text-fg-subtle">{s.body}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </div>
      <div className="mt-4">
        <div className="eyebrow mb-2">Never shared</div>
        <ul className="grid grid-cols-2 gap-2">
          {NEVER.map((n) => (
            <li key={n.key} className="flex items-center gap-2 rounded-md bg-fault-soft/60 px-2.5 py-2 text-[13px] text-fg-muted shadow-[inset_0_0_0_1px_rgb(255_93_93/0.22)]" data-testid={`never-${n.key}`}>
              <Lock className="size-3.5 text-fault" aria-hidden />
              {n.title}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-fg-subtle">The recording stays on the Tacit box inside the plant. Only the tracks above ever leave it.</p>
      </div>
    </Panel>
  )
}

interface TreeItem {
  path: string
  note: string
  icon: typeof File
  depth: number
}

export function packTree(c: ListingContents | null | undefined): TreeItem[] {
  const items: TreeItem[] = [
    { path: 'skill.json', note: 'steps, the expert’s why notes, Q&A', icon: FileJson, depth: 1 },
    { path: 'motion/', note: '', icon: Folder, depth: 1 },
    { path: 'tracks.json', note: 'hands, pose, gaze, parts per frame', icon: FileJson, depth: 2 },
    { path: 'twin.json', note: '3D digital twin', icon: FileJson, depth: 2 },
    { path: 'SOP.md', note: 'standard work instruction', icon: FileText, depth: 1 },
    { path: 'robot/', note: '', icon: Folder, depth: 1 },
    { path: 'program.json', note: 'pick-and-place program', icon: FileJson, depth: 2 },
  ]
  if (c?.episodes) items.push({ path: 'demos/', note: `${fmtInt(c.episodes)} LeRobot-style sim episodes`, icon: Folder, depth: 2 })
  if (c?.policy) items.push({ path: 'policy', note: 'trained behaviour-cloning policy', icon: File, depth: 2 })
  items.push(
    { path: 'certificates/', note: '', icon: Folder, depth: 1 },
    { path: 'verification.json', note: 'VGGT certificate', icon: FileJson, depth: 2 },
    { path: 'consent.json', note: 'signed consent record', icon: FileJson, depth: 2 },
    { path: 'LICENSE.txt', note: 'your license terms', icon: FileText, depth: 1 },
    { path: 'README.md', note: '', icon: FileText, depth: 1 },
  )
  return items
}

export function PackTree({ contents, root, className }: { contents: ListingContents | null | undefined; root: string; className?: string }) {
  return (
    <div className={cn('rounded-lg bg-ink-950/60 p-3 shadow-[inset_0_0_0_1px_var(--color-line)]', className)} data-testid="pack-tree">
      <div className="telemetry flex items-center gap-1.5 text-xs text-fg-muted">
        <Folder className="size-3.5 text-ion" aria-hidden />
        {root}/
      </div>
      <ul className="mt-1.5 space-y-1">
        {packTree(contents).map((it) => (
          <li key={it.path + it.depth} className="telemetry flex items-center gap-1.5 text-[11.5px]" style={{ paddingLeft: it.depth * 14 }}>
            <it.icon className={cn('size-3 shrink-0', it.icon === Folder ? 'text-ion/80' : 'text-fg-faint')} aria-hidden />
            <span className="text-fg-muted">{it.path}</span>
            {it.note && <span className="truncate font-sans text-fg-faint">· {it.note}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function PackContents({ contents, skillId, stepsCount, className }: { contents: ListingContents | null | undefined; skillId: string; stepsCount: number; className?: string }) {
  const c = contents
  const stats = [
    { label: 'Steps', value: fmtInt(c?.steps ?? stepsCount) },
    { label: 'Sim episodes', value: c?.episodes ? fmtInt(c.episodes) : '–' },
    { label: 'Motion', value: c ? `${(c.hours_of_motion * 60).toFixed(1)} min` : '–' },
    { label: 'Policy', value: c?.policy ? 'Trained' : 'Not yet' },
  ]
  return (
    <Panel className={className} eyebrow="Skill pack" title="What you download" data-testid="pack-contents">
      <dl className="grid grid-cols-4 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-md bg-white/[0.02] px-2.5 py-2 shadow-[inset_0_0_0_1px_var(--color-line)]">
            <dt className="eyebrow text-[10px]">{s.label}</dt>
            <dd className="telemetry mt-0.5 text-sm text-fg">{s.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(c?.formats ?? ['tacit-json']).map((f) => (
          <span key={f} className="telemetry rounded-sm bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-fg-muted shadow-[inset_0_0_0_1px_var(--color-line)]">
            {f}
          </span>
        ))}
      </div>
      <PackTree contents={c} root={`tacit-skill-${skillId}`} className="mt-3" />
      <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-subtle">
        <Ban className="size-3.5 text-fault" aria-hidden />
        No camera video, no photos, no faces. Only motion, text and the robot’s own data.
      </p>
    </Panel>
  )
}
