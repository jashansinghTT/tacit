import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Activity, Cpu, HardDrive, RefreshCw, Server } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useBox } from '@/lib/api/queries'
import type { BoxChip, BoxStatus } from '@/lib/api'
import { fmtAgo, fmtInt, fmtMs } from '@/lib/format'
import { Page, PageHeader } from '@/components/layout/Page'
import { BackendBadge, Badge, ErrorState, Meter, Panel, Skeleton, Sparkline, Stat, StatusDot, Ticker, type Tone } from '@/components/ui'

const GROUP: Record<string, { label: string; kind: string }> = {
  'tacit-vision': { label: 'Vision cohost', kind: 'HaMeR · Gaze-LLE · RF-DETR · VGGT' },
  'cohost-speech': { label: 'Speech cohost', kind: 'Whisper · S2 Pro · Music 3' },
  'gpt-oss-20b': { label: 'Language model', kind: 'gpt-oss-20b, p150 profile' },
  gr00t: { label: 'Robot policy', kind: 'GR00T N1.7 3B' },
}

function chipTone(c: BoxChip): Tone {
  if (c.status === 'ok' && c.models.every((m) => m.healthy)) return 'ok'
  if (c.status === 'down' || c.models.every((m) => !m.healthy)) return 'fault'
  return 'warn'
}

/** p50 history per model, kept client-side from the 3 s poll (the API may also send history_ms). */
function useHistory(box: BoxStatus | undefined) {
  const hist = useRef(new Map<string, number[]>())
  const [, bump] = useState(0)
  useEffect(() => {
    if (!box) return
    for (const c of box.chips)
      for (const m of c.models) {
        const key = `${c.id}:${m.name}`
        const arr = m.history_ms?.slice(-40) ?? [...(hist.current.get(key) ?? []), m.p50_ms ?? 0].slice(-40)
        hist.current.set(key, arr)
      }
    bump((x) => x + 1)
  }, [box])
  return hist.current
}

function ChipMap({ box, selected, onSelect }: { box: BoxStatus; selected: number | null; onSelect: (id: number) => void }) {
  // Group chips by the board the backend reports (two p300c boards, two chips each).
  const boards = useMemo(() => {
    const byBoard = new Map<string, BoxChip[]>()
    box.chips.forEach((c, i) => {
      const key = /#\d+/.test(c.board) ? c.board : `${c.board} #${Math.floor(i / 2)}`
      byBoard.set(key, [...(byBoard.get(key) ?? []), c])
    })
    return [...byBoard.entries()]
  }, [box])
  return (
    <div className="relative overflow-hidden rounded-xl bg-ink-950 p-6 shadow-[inset_0_0_0_1px_var(--color-line)] [perspective:1400px]" data-tour="chip-map" data-testid="chip-map">
      <div className="pointer-events-none absolute inset-0 dot-bg opacity-60" />
      <div className="relative grid gap-6 md:grid-cols-2 [transform:rotateX(16deg)] [transform-origin:50%_100%] [transform-style:preserve-3d]">
        {boards.map(([board, chips]) => (
          <div key={board} className="relative rounded-xl bg-gradient-to-br from-[#0f1a17] to-[#0b1210] p-5 shadow-[0_0_0_1px_rgb(61_220_151/0.15),0_30px_60px_-20px_rgb(0_0_0/0.9)]">
            <svg className="pointer-events-none absolute inset-0 size-full opacity-40" aria-hidden>
              {Array.from({ length: 12 }, (_, i) => (
                <path key={i} d={`M0 ${20 + i * 22} H${60 + (i % 3) * 30} l14 14 H1000`} stroke="#3ddc97" strokeOpacity="0.12" fill="none" />
              ))}
            </svg>
            <div className="relative mb-4 flex items-center justify-between">
              <span className="telemetry text-[10px] tracking-widest text-ok/70">{board.toUpperCase()}</span>
              <span className="telemetry text-[10px] text-fg-faint">PCIe</span>
            </div>
            <div className="relative grid grid-cols-2 gap-4">
              {chips.map((c) => {
                const tone = chipTone(c)
                const active = selected === c.id
                const mem = c.memory ? c.memory.dram_gib / c.memory.dram_total_gib : 0
                return (
                  <motion.button
                    key={c.id}
                    onClick={() => onSelect(c.id)}
                    whileHover={{ y: -4 }}
                    data-testid={`chip-${c.id}`}
                    className={cn(
                      'group relative flex min-h-44 flex-col rounded-lg bg-gradient-to-b from-ink-700 to-ink-800 p-4 text-left transition-shadow',
                      active ? 'shadow-[0_0_0_1.5px_var(--color-ion),0_0_40px_-6px_rgb(60_215_255/0.6)]' : 'shadow-[0_0_0_1px_var(--color-line-strong),0_10px_20px_-6px_rgb(0_0_0/0.8)]',
                    )}
                    aria-pressed={active}
                    aria-label={`Chip ${c.id}, ${GROUP[c.group]?.label ?? c.group}`}
                  >
                    <div className="pointer-events-none absolute inset-2 rounded-md opacity-60" style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgb(255 255 255 / 0.03) 0 2px, transparent 2px 7px)' }} />
                    <div className="relative flex items-center justify-between">
                      <span className="telemetry text-[10px] text-fg-subtle">CHIP {c.id}</span>
                      <StatusDot tone={tone} pulse={tone === 'ok'} />
                    </div>
                    <div className="relative mt-1 text-[13px] font-medium text-fg">{GROUP[c.group]?.label ?? c.group}</div>
                    <div className="relative mt-3 space-y-1">
                      {c.models.map((m) => (
                        <div key={m.name} className={cn('flex items-center justify-between gap-2 rounded-[4px] px-2 py-1 text-[11px]', m.healthy ? 'bg-ion/[0.08] text-ion' : 'bg-fault-soft text-fault')}>
                          <span className="truncate">{m.name}</span>
                          <span className="telemetry shrink-0 text-fg-muted">{fmtMs(m.p50_ms)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="relative mt-auto h-1 overflow-hidden rounded-full bg-white/[0.06] [margin-top:max(0.75rem,auto)]">
                      <div className="h-full bg-ion" style={{ width: `${mem * 100}%` }} />
                    </div>
                  </motion.button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChipPanel({ c, hist, highlight, queue }: { c: BoxChip; hist: Map<string, number[]>; highlight: boolean; queue?: BoxStatus['speech_queue'] }) {
  const tone = chipTone(c)
  return (
    <Panel
      className={cn('transition-shadow', highlight && 'shadow-glow')}
      eyebrow={`chip ${c.id} · ${c.board}`}
      title={
        <span className="flex items-center gap-2">
          {GROUP[c.group]?.label ?? c.group}
          <Badge tone={tone} dot>
            {c.status}
          </Badge>
        </span>
      }
      actions={<span className="telemetry text-[11px] text-fg-subtle">{c.group}</span>}
      pad={false}
      data-testid={`chip-panel-${c.id}`}
    >
      <div className="divide-y divide-line">
        {c.models.map((m) => {
          const h = hist.get(`${c.id}:${m.name}`) ?? []
          return (
            <div key={m.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3" data-testid={`model-${m.name}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <StatusDot tone={m.healthy ? 'ok' : 'fault'} />
                  <span className="truncate text-[13px] font-medium text-fg">{m.name}</span>
                  <BackendBadge backend={m.backend} model={m.name} />
                </div>
                <div className="telemetry mt-0.5 pl-4 text-[11px] text-fg-subtle">
                  {m.role} · :{m.port} · {fmtInt(m.calls)} calls{m.dram_gib != null && ` · ${m.dram_gib.toFixed(2)} GiB`}
                  {m.errors ? <span className="text-warn"> · {fmtInt(m.errors)} errors</span> : null}
                  {m.l1_kib != null && ` · L1 ${m.l1_kib} KiB`}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Sparkline data={h.length > 1 ? h : [m.p50_ms ?? 0, m.p50_ms ?? 0]} width={84} height={24} tone={m.healthy ? 'ion' : 'fault'} />
                <div className="w-16 text-right">
                  <div className="telemetry text-sm text-fg">{fmtMs(m.p50_ms)}</div>
                  <div className="eyebrow text-[9px]">p50</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {queue && c.group.includes('speech') && (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs" data-testid="speech-queue">
          <span className="flex items-center gap-2 text-fg-muted">
            <StatusDot tone={queue.busy ? 'ion' : 'ok'} pulse={queue.busy} />
            Voice gate {queue.busy ? 'busy' : 'idle'}
          </span>
          <span className="telemetry flex gap-3 text-fg-subtle">
            <span title="live answers waiting for Whisper">listen {queue.listen}</span>
            <span title="coach and tutor speech waiting">interactive {queue.interactive}</span>
            <span title="narration and background work">batch {queue.batch}</span>
          </span>
        </div>
      )}
      {c.memory && (
        <div className="space-y-2.5 border-t border-line px-4 py-3">
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-fg-subtle">
              <span className="flex items-center gap-1.5">
                <HardDrive className="size-3" /> Device DRAM
              </span>
              <span className="telemetry">
                {c.memory.dram_gib.toFixed(1)} / {c.memory.dram_total_gib.toFixed(0)} GiB
              </span>
            </div>
            <Meter value={c.memory.dram_gib / c.memory.dram_total_gib} label={`chip ${c.id} DRAM`} />
          </div>
          {c.memory.l1_total_kib != null && c.memory.l1_used_kib != null && (
            <div>
              <div className="mb-1 flex justify-between text-[11px] text-fg-subtle">
                <span>L1 per core (cohost)</span>
                <span className="telemetry">
                  {c.memory.l1_used_kib} / {c.memory.l1_total_kib} KiB
                </span>
              </div>
              <Meter value={c.memory.l1_used_kib / c.memory.l1_total_kib} tone="violet" label={`chip ${c.id} L1`} />
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}

export default function BoxPage() {
  const box = useBox()
  const hist = useHistory(box.data)
  const [selected, setSelected] = useState<number | null>(null)
  const data = box.data
  const calls = data?.chips.flatMap((c) => c.models).reduce((s, m) => s + m.calls, 0) ?? 0
  const visionP50 = data?.chips.find((c) => c.group === 'tacit-vision')?.models.reduce((s, m) => s + (m.name === 'VGGT-1B' ? 0 : m.p50_ms ?? 0), 0)
  return (
    <Page testId="page-box" wide>
      <PageHeader
        eyebrow="Box"
        title="Nine models, four chips, one box"
        description="Live status of every model on the Tenstorrent Blackhole box: health, median latency, calls and device memory. Polled every 3 seconds."
        meta={
          data && (
            <>
              <Badge icon={<Server className="size-3" />}>{data.host}</Badge>
              <Badge tone="neutral" icon={<RefreshCw className="size-3" />}>
                updated {fmtAgo(data.updated_at)}
              </Badge>
            </>
          )
        }
      />
      {box.isError && !data ? (
        <Panel>
          <ErrorState error={box.error} onRetry={() => box.refetch()} />
        </Panel>
      ) : !data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line md:grid-cols-4">
            {[
              { label: 'Models healthy', value: `${data.totals.healthy} / ${data.totals.models}`, tone: data.totals.healthy === data.totals.models ? 'ok' : 'warn', icon: <Activity className="size-3" /> },
              { label: 'Chips', value: String(data.totals.chips), icon: <Cpu className="size-3" /> },
              { label: 'Calls served', value: calls, icon: null },
              { label: 'Vision frame (3 models)', value: visionP50 != null ? fmtMs(visionP50) : '–', icon: null },
            ].map((s) => (
              <div key={s.label} className="bg-ink-850 p-5">
                <Stat label={s.label} icon={s.icon} tone={(s.tone as Tone) ?? 'neutral'} value={typeof s.value === 'number' ? <Ticker value={s.value} format={fmtInt} /> : s.value} />
              </div>
            ))}
          </div>
          <ChipMap box={data} selected={selected} onSelect={(id) => setSelected((s) => (s === id ? null : id))} />
          <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
            {data.chips.map((c) => (
              <ChipPanel key={c.id} c={c} hist={hist} highlight={selected === c.id} queue={data.speech_queue} />
            ))}
          </div>
        </>
      )}
    </Page>
  )
}
