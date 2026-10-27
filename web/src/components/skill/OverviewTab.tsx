import { Eye, Hand, Lightbulb, Quote, ShieldAlert, Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Skill, Tracks } from '@/lib/api'
import { fmtClock, fmtDuration, fmtInt, fmtMs } from '@/lib/format'
import type { Playback } from '@/lib/playback'
import { BackendBadge, Badge, ChipTag, Panel } from '@/components/ui'
import { SkillPlayer, stepAt } from './SkillPlayer'

export function OverviewTab({ skill, tracks, pb }: { skill: Skill; tracks: Tracks | undefined; pb: Playback }) {
  const active = stepAt(skill, pb.time)
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
      <div className="min-w-0 space-y-4">
        <Panel pad>
          <SkillPlayer skill={skill} tracks={tracks} pb={pb} />
        </Panel>
        <section aria-label="Steps" className="space-y-2.5" data-testid="steps-list">
          {skill.steps.map((s) => {
            const on = active?.id === s.id
            const qa = skill.qa.find((q) => q.step_id === s.id && q.answer)
            return (
              <article
                key={s.id}
                className={cn('panel grid cursor-pointer gap-4 p-3 transition-shadow md:grid-cols-[220px_minmax(0,1fr)]', on && 'shadow-[0_0_0_1px_rgb(60_215_255/0.5),0_0_30px_-10px_rgb(60_215_255/0.5)]')}
                onClick={() => pb.seek(s.t_start + 0.01)}
                data-testid={`step-${s.index}`}
              >
                <div className="relative aspect-video overflow-hidden rounded-md bg-ink-950">
                  {s.keyframe && <img src={s.keyframe} alt={`Keyframe for step ${s.index}`} loading="lazy" className="size-full object-cover" />}
                  <span className="telemetry absolute bottom-1.5 left-1.5 rounded-xs bg-ink-950/80 px-1.5 py-0.5 text-[10px] text-fg-muted">
                    {fmtClock(s.t_start)}–{fmtClock(s.t_end)}
                  </span>
                </div>
                <div className="min-w-0 py-1 pr-1">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[15px] font-medium text-fg">
                      <span className={cn('telemetry mr-2 text-sm', on ? 'text-ion' : 'text-fg-faint')}>{String(s.index).padStart(2, '0')}</span>
                      {s.title}
                    </h3>
                    <div className="flex shrink-0 gap-1.5">
                      {s.hand && (
                        <Badge icon={<Hand className="size-3" />} tone={s.hand === 'left' ? 'ion' : s.hand === 'right' ? 'violet' : 'neutral'}>
                          {s.hand}
                        </Badge>
                      )}
                      {s.gaze_target && (
                        <Badge icon={<Eye className="size-3" />} tone="warn">
                          {s.gaze_target}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{s.instruction}</p>
                  <blockquote className="mt-3 flex gap-2.5 rounded-md bg-white/[0.025] p-3 shadow-[inset_2px_0_0_var(--color-ion)]">
                    <Quote className="size-3.5 shrink-0 translate-y-0.5 text-ion" />
                    <div className="min-w-0">
                      <p className="text-[13px] text-fg italic">{qa?.answer ?? s.why}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-fg-subtle">
                        {s.why_source === 'expert' || qa ? (
                          <>— {skill.expert.name}, in their own words</>
                        ) : (
                          <>
                            <Sparkles className="size-3" /> Inferred from the video; waiting for {skill.expert.name.split(' ')[0]} to confirm
                          </>
                        )}
                      </p>
                    </div>
                  </blockquote>
                  {s.tips.length > 0 && (
                    <ul className="mt-2.5 space-y-1">
                      {s.tips.map((t) => (
                        <li key={t} className="flex gap-2 text-xs text-fg-subtle">
                          <Lightbulb className="size-3.5 shrink-0 text-warn" />
                          {t}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            )
          })}
        </section>
      </div>
      <aside className="space-y-4">
        <Panel title="Summary">
          <p className="text-[13px] leading-relaxed text-fg-muted">{skill.summary}</p>
          <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
            <div>
              <dt className="eyebrow">Steps</dt>
              <dd className="telemetry mt-1 text-lg text-fg">{skill.steps.length}</dd>
            </div>
            <div>
              <dt className="eyebrow">Length</dt>
              <dd className="telemetry mt-1 text-lg text-fg">{fmtDuration(skill.source.duration)}</dd>
            </div>
            <div>
              <dt className="eyebrow">Source</dt>
              <dd className="mt-1 text-sm text-fg capitalize">{skill.source.kind}</dd>
            </div>
          </dl>
        </Panel>
        {skill.safety.length > 0 && (
          <Panel title="Safety" actions={<ShieldAlert className="size-4 text-warn" />}>
            <ul className="space-y-2">
              {skill.safety.map((s) => (
                <li key={s} className="flex gap-2 text-[13px] text-fg-muted">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn" />
                  {s}
                </li>
              ))}
            </ul>
          </Panel>
        )}
        <Panel title="Models used" pad={false} data-testid="models-used">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[10px] tracking-wider text-fg-faint uppercase">
                <th className="px-4 py-2 font-medium">Model</th>
                <th className="py-2 font-medium">Where</th>
                <th className="py-2 text-right font-medium">Calls</th>
                <th className="px-4 py-2 text-right font-medium">p50</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {skill.models_used.map((m) => (
                <tr key={m.model}>
                  <td className="px-4 py-2 text-fg-muted">{m.model}</td>
                  <td className="py-2">{m.backend === 'tt' ? <ChipTag chip={m.chip} /> : <BackendBadge backend={m.backend} model={m.model} chip={m.chip} />}</td>
                  <td className="telemetry py-2 text-right text-fg-subtle">{fmtInt(m.calls)}</td>
                  <td className="telemetry px-4 py-2 text-right text-fg">{fmtMs(m.p50_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </aside>
    </div>
  )
}
