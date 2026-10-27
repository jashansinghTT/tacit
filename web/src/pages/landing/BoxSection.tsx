import { Link } from 'react-router-dom'
import { ArrowRight, Cpu } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useBox } from '@/lib/api/queries'
import { fmtInt, fmtMs } from '@/lib/format'
import { Meter, Skeleton, StatusDot, Ticker } from '@/components/ui'

const GROUP_LABEL: Record<string, string> = {
  'tacit-vision': 'Vision',
  'cohost-speech': 'Speech',
  'gpt-oss-20b': 'Language',
  gr00t: 'Robot policy',
}

function groupLabel(group: string) {
  const g = group.toLowerCase()
  if (g.includes('vision')) return GROUP_LABEL['tacit-vision']
  if (g.includes('speech')) return GROUP_LABEL['cohost-speech']
  if (g.startsWith('gpt-oss') || g.includes('llm')) return GROUP_LABEL['gpt-oss-20b']
  if (g.includes('gr00t') || g.includes('groot')) return GROUP_LABEL.gr00t
  return GROUP_LABEL[group] ?? group
}

export function BoxSection() {
  const box = useBox()
  const data = box.data
  const calls = data?.chips.flatMap((c) => c.models).reduce((s, m) => s + m.calls, 0) ?? 0
  return (
    <section className="relative px-4 py-16 lg:px-6" data-testid="landing-box">
      <div className="mx-auto max-w-[1680px]">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-end">
          <div>
            <div className="eyebrow">The box</div>
            <h2 className="mt-4 text-[clamp(2.2rem,4vw,3.5rem)] leading-[1.02] font-medium tracking-[-0.035em] text-fg">
              Nine models, four chips,
              <br />
              <span className="text-fg-subtle">one box.</span>
            </h2>
            <p className="mt-5 max-w-md text-[15px] text-fg-muted">
              Everything runs on a Tenstorrent Blackhole box inside the plant. Raw video never leaves it; only motion, gaze and text do. These numbers are live.
            </p>
            <Link to="/box" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-ion hover:underline">
              Open the box <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line sm:grid-cols-4">
            {[
              { label: 'Models healthy', value: data ? `${data.totals.healthy}/${data.totals.models}` : null },
              { label: 'Chips', value: data ? String(data.totals.chips) : null },
              { label: 'Model calls', value: data ? calls : null },
              { label: 'Video sent out', value: '0 B' },
            ].map((s) => (
              <div key={s.label} className="bg-ink-900 p-5">
                <div className="eyebrow">{s.label}</div>
                <div className="telemetry mt-3 text-3xl font-medium tracking-tight text-fg">
                  {s.value === null ? <Skeleton className="h-8 w-16" /> : typeof s.value === 'number' ? <Ticker value={s.value} format={fmtInt} /> : s.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(data?.chips ?? Array.from({ length: 4 }, () => null)).map((chip, i) => (
            <div key={chip?.id ?? i} className="panel relative overflow-hidden p-5">
              {chip ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="grid size-9 place-items-center rounded-md bg-ion-soft text-ion shadow-[inset_0_0_0_1px_rgb(60_215_255/0.3)]">
                        <Cpu className="size-4.5" />
                      </div>
                      <div>
                        <div className="telemetry text-[11px] text-fg-subtle">
                          CHIP {chip.id} · {chip.board}
                        </div>
                        <div className="text-sm font-medium text-fg">{groupLabel(chip.group)}</div>
                      </div>
                    </div>
                    <StatusDot tone={chip.status === 'ok' ? 'ok' : chip.status === 'degraded' ? 'warn' : 'fault'} pulse={chip.status === 'ok'} />
                  </div>
                  <ul className="mt-5 space-y-2.5">
                    {chip.models.map((m) => (
                      <li key={m.name} className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={cn('size-1.5 shrink-0 rounded-full', m.healthy ? 'bg-ok' : 'bg-fault')} />
                          <span className="truncate text-fg-muted">{m.name}</span>
                        </span>
                        <span className="telemetry text-fg">{fmtMs(m.p50_ms)}</span>
                      </li>
                    ))}
                  </ul>
                  {chip.memory && (
                    <div className="mt-5 border-t border-line pt-4">
                      <div className="mb-1.5 flex justify-between text-[11px] text-fg-subtle">
                        <span>Device memory</span>
                        <span className="telemetry">
                          {chip.memory.dram_gib.toFixed(1)} / {chip.memory.dram_total_gib.toFixed(0)} GiB
                        </span>
                      </div>
                      <Meter value={chip.memory.dram_gib / chip.memory.dram_total_gib} label={`Chip ${chip.id} memory`} />
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <Skeleton className="h-9 w-40" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-4/6" />
                </div>
              )}
            </div>
          ))}
        </div>
        {box.isError && <p className="mt-4 text-sm text-fg-subtle">The box is not answering right now; live numbers appear when it is back.</p>}
      </div>
    </section>
  )
}
