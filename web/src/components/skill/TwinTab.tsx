import { lazy, Suspense, useState } from 'react'
import { Box as BoxIcon, Eye, Hand, Shapes, User } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Skill, Tracks, Twin } from '@/lib/api'
import { usePointcloud } from '@/lib/api/queries'
import type { Playback } from '@/lib/playback'
import { EmptyState, Panel, Skeleton, Timeline } from '@/components/ui'
import { TWIN_LAYERS, type TwinLayers } from './TwinViewer'
import { SkillPlayer, stepAt } from './SkillPlayer'

const TwinViewer = lazy(() => import('./TwinViewer').then((m) => ({ default: m.TwinViewer })))

const TOGGLES: { key: keyof TwinLayers; label: string; icon: typeof Hand }[] = [
  { key: 'body', label: 'Body', icon: User },
  { key: 'hands', label: 'Hands', icon: Hand },
  { key: 'gaze', label: 'Gaze', icon: Eye },
  { key: 'objects', label: 'Objects', icon: Shapes },
  { key: 'cloud', label: 'Point cloud', icon: BoxIcon },
]

export function TwinTab({ skill, twin, tracks, pb, loading }: { skill: Skill; twin: Twin | undefined; tracks: Tracks | undefined; pb: Playback; loading: boolean }) {
  const [layers, setLayers] = useState<TwinLayers>(TWIN_LAYERS)
  const cloud = usePointcloud(layers.cloud ? skill.verification.pointcloud : null)
  const step = stepAt(skill, pb.time)
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
      <Panel
        pad={false}
        title="Digital twin"
        eyebrow="3D · metres · drag to orbit"
        actions={
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Twin layers">
            {TOGGLES.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                aria-pressed={layers[key]}
                onClick={() => setLayers({ ...layers, [key]: !layers[key] })}
                className={cn('inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors', layers[key] ? 'bg-white/[0.07] text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'text-fg-faint hover:text-fg-muted')}
              >
                <Icon className="size-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        }
        data-testid="twin-panel"
      >
        <div className="relative h-[clamp(420px,62vh,720px)]">
          {loading ? (
            <Skeleton className="absolute inset-0 rounded-none" />
          ) : !twin ? (
            <EmptyState title="No twin yet">The twin is built by the pipeline's twin stage.</EmptyState>
          ) : (
            <Suspense fallback={<Skeleton className="absolute inset-0 rounded-none" />}>
              <TwinViewer twin={twin} timeRef={pb.timeRef} layers={layers} cloud={cloud.data?.points} highlight={step?.objects?.[0] ?? null} className="absolute inset-0" />
            </Suspense>
          )}
          {step && (
            <div className="pointer-events-none absolute bottom-4 left-4 max-w-md rounded-lg bg-ink-950/80 p-3 backdrop-blur">
              <div className="eyebrow text-ion">Step {step.index}</div>
              <div className="mt-0.5 text-sm font-medium text-fg">{step.title}</div>
              <div className="mt-1 text-xs text-fg-muted">{step.instruction}</div>
            </div>
          )}
          <div className="pointer-events-none absolute top-3 left-3 flex gap-3 text-[10px]">
            <span className="flex items-center gap-1 text-data-left">
              <span className="size-1.5 rounded-full bg-data-left" /> left hand
            </span>
            <span className="flex items-center gap-1 text-data-right">
              <span className="size-1.5 rounded-full bg-data-right" /> right hand
            </span>
            <span className="flex items-center gap-1 text-data-gaze">
              <span className="size-1.5 rounded-full bg-data-gaze" /> gaze
            </span>
          </div>
        </div>
        <div className="border-t border-line p-4">
          <Timeline
            segments={skill.steps.map((s) => ({ id: s.id, label: s.title, t0: s.t_start, t1: s.t_end, done: pb.time >= s.t_end }))}
            duration={skill.source.duration}
            time={pb.time}
            onSeek={pb.seek}
            activeId={step?.id}
          />
        </div>
      </Panel>
      <div className="space-y-4">
        <Panel title="Synced video" eyebrow="same clock as the twin">
          <SkillPlayer skill={skill} tracks={tracks} pb={pb} showTimeline={false} />
        </Panel>
        <Panel title="Steps" pad={false}>
          <ol className="divide-y divide-line">
            {skill.steps.map((s) => {
              const on = step?.id === s.id
              return (
                <li key={s.id}>
                  <button onClick={() => pb.seek(s.t_start + 0.01)} className={cn('flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] transition-colors hover:bg-white/[0.03]', on && 'bg-ion/[0.06]')}>
                    <span className={cn('telemetry text-xs', on ? 'text-ion' : 'text-fg-faint')}>{String(s.index).padStart(2, '0')}</span>
                    <span className={cn('flex-1 truncate', on ? 'text-fg' : 'text-fg-muted')}>{s.title}</span>
                    <span className="h-1 w-14 overflow-hidden rounded-full bg-white/[0.06]">
                      <span className="block h-full bg-ion" style={{ width: `${Math.max(0, Math.min(1, (pb.time - s.t_start) / (s.t_end - s.t_start))) * 100}%` }} />
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </Panel>
      </div>
    </div>
  )
}
