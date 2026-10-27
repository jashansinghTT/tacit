import type { ReactNode } from 'react'
import { BrainCircuit, Cpu, Grid3x3, Hand, Play, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Tone } from '@/components/ui'
import { StatusDot } from '@/components/ui'

export type LabMode = 'replay' | 'train' | 'evaluate' | 'policy' | 'gr00t'

export const LAB_MODES: LabMode[] = ['replay', 'train', 'evaluate', 'policy', 'gr00t']

export const MODE_META: Record<LabMode, { title: string; line: string; icon: LucideIcon }> = {
  replay: { title: 'Replay the human', line: "The arm follows the expert's wrist path; her hands play alongside.", icon: Hand },
  train: { title: 'Train', line: 'Randomised sim demonstrations, then a behaviour-cloning policy on CPU.', icon: BrainCircuit },
  evaluate: { title: 'Evaluate', line: 'Fresh randomised scenes; success rate and why trials fail.', icon: Grid3x3 },
  policy: { title: 'Run policy', line: 'Watch the trained policy on one randomised scene.', icon: Play },
  gr00t: { title: 'Run GR00T on chip 3', line: 'The foundation model drives the arm from two rendered cameras.', icon: Cpu },
}

export interface ModeState {
  label: ReactNode
  tone: Tone
  busy?: boolean
  disabled?: boolean
}

/** The five things the lab does, as a vertical list of large targets with their readiness. */
export function ModeList({ value, onChange, states }: { value: LabMode; onChange: (m: LabMode) => void; states: Record<LabMode, ModeState> }) {
  return (
    <div role="tablist" aria-label="Robot Lab modes" aria-orientation="vertical" className="flex flex-col gap-1" data-tour="robot-modes" data-testid="robot-modes">
      {LAB_MODES.map((m, i) => {
        const meta = MODE_META[m]
        const Icon = meta.icon
        const active = value === m
        const st = states[m]
        return (
          <button
            key={m}
            role="tab"
            aria-selected={active}
            aria-controls="robot-mode-panel"
            id={`robot-mode-${m}`}
            data-testid={`mode-${m}`}
            onClick={() => onChange(m)}
            onKeyDown={(e) => {
              const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
              if (!d) return
              e.preventDefault()
              const next = LAB_MODES[(i + d + LAB_MODES.length) % LAB_MODES.length]
              onChange(next)
              document.getElementById(`robot-mode-${next}`)?.focus()
            }}
            tabIndex={active ? 0 : -1}
            className={cn(
              'group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors',
              active ? 'bg-ion-soft shadow-[inset_0_0_0_1px_rgb(60_215_255/0.35)]' : 'hover:bg-white/[0.035]',
            )}
          >
            {active && <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-ion shadow-[0_0_10px_rgb(60_215_255/0.8)]" aria-hidden />}
            <span
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-md shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
                active ? 'bg-ion text-ion-ink shadow-none' : 'bg-white/[0.03] text-fg-muted group-hover:text-fg',
              )}
            >
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('block text-[13px] font-medium', active ? 'text-fg' : 'text-fg-muted group-hover:text-fg')}>{meta.title}</span>
              <span className="block truncate text-[11.5px] text-fg-subtle">{meta.line}</span>
            </span>
            <span className={cn('flex shrink-0 items-center gap-1.5 text-[11px]', st.disabled ? 'text-fg-faint' : 'text-fg-muted')}>
              <StatusDot tone={st.tone} pulse={st.busy} />
              <span className="telemetry">{st.label}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
