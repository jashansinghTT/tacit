import type { ReactNode } from 'react'
import { BrainCircuit, Cpu, Grid3x3, Hand, Play, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Tone } from '@/components/ui'
import { StatusDot } from '@/components/ui'

export type LabMode = 'replay' | 'train' | 'evaluate' | 'policy' | 'gr00t'

export const LAB_MODES: LabMode[] = ['replay', 'train', 'evaluate', 'policy', 'gr00t']

export const MODE_META: Record<LabMode, { title: string; short: string; line: string; icon: LucideIcon }> = {
  replay: { title: 'Replay the human', short: 'Replay', line: "The arm follows the expert's wrist path; the expert's hands play alongside.", icon: Hand },
  train: { title: 'Train a policy', short: 'Train', line: 'Randomised sim demonstrations, then a behaviour-cloning policy on CPU.', icon: BrainCircuit },
  evaluate: { title: 'Evaluate', short: 'Evaluate', line: 'Fresh randomised scenes; success rate and why trials fail.', icon: Grid3x3 },
  policy: { title: 'Run policy', short: 'Policy', line: 'Watch the trained policy on one randomised scene.', icon: Play },
  gr00t: { title: 'Run GR00T on chip 3', short: 'GR00T', line: 'The foundation model drives the arm from two rendered cameras.', icon: Cpu },
}

export interface ModeState {
  label: ReactNode
  tone: Tone
  busy?: boolean
  disabled?: boolean
}

/** The five things the lab does, as a tab bar; each tab carries its readiness as a status dot. */
export function ModeTabs({ value, onChange, states }: { value: LabMode; onChange: (m: LabMode) => void; states: Record<LabMode, ModeState> }) {
  return (
    <div
      role="tablist"
      aria-label="Robot Lab modes"
      className="panel grid grid-cols-5 gap-1 p-1"
      data-tour="robot-modes"
      data-testid="robot-modes"
    >
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
            title={`${meta.title}: ${meta.line}`}
            onClick={() => onChange(m)}
            onKeyDown={(e) => {
              const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
              if (!d) return
              e.preventDefault()
              const next = LAB_MODES[(i + d + LAB_MODES.length) % LAB_MODES.length]
              onChange(next)
              document.getElementById(`robot-mode-${next}`)?.focus()
            }}
            tabIndex={active ? 0 : -1}
            className={cn(
              'group relative flex flex-col items-center gap-1 rounded-md px-1 pt-2 pb-1.5 transition-colors',
              active ? 'bg-ion-soft shadow-[inset_0_0_0_1px_rgb(60_215_255/0.4)]' : 'hover:bg-white/[0.04]',
            )}
          >
            <span className="relative">
              <Icon className={cn('size-[18px]', active ? 'text-ion' : 'text-fg-muted group-hover:text-fg')} />
              <StatusDot tone={st.tone} pulse={st.busy} className="absolute -top-1 -right-2 scale-90" />
            </span>
            <span className={cn('text-[12px] font-medium', active ? 'text-fg' : 'text-fg-muted group-hover:text-fg')}>{meta.short}</span>
            <span className={cn('telemetry max-w-full truncate text-[10px]', st.disabled ? 'text-fg-faint' : active ? 'text-ion' : 'text-fg-subtle')}>{st.label}</span>
            {active && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-ion shadow-[0_0_10px_rgb(60_215_255/0.8)]" aria-hidden />}
          </button>
        )
      })}
    </div>
  )
}
