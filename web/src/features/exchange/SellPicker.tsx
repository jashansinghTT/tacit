import { Link } from 'react-router-dom'
import { ArrowRight, Camera, Store } from 'lucide-react'
import type { SkillSummary } from '@/lib/api'
import { useSkills } from '@/lib/api/queries'
import { useApp, personaOf } from '@/lib/store'
import { fmtDuration } from '@/lib/format'
import { cn } from '@/lib/cn'
import { Badge, ButtonLink, Dialog, EmptyState, Skeleton, VerifiedBadge } from '@/components/ui'

/** Why a skill can or cannot be listed right now. */
export function listability(s: Pick<SkillSummary, 'status' | 'verification_status' | 'listed'>) {
  if (s.listed) return { ok: false, reason: 'Already listed' }
  if (s.status !== 'ready') return { ok: false, reason: s.status === 'processing' ? 'Still processing' : 'Not processed yet' }
  if (s.verification_status !== 'verified')
    return { ok: false, reason: s.verification_status === 'suspect' ? 'Failed the real-camera check' : 'Not verified yet' }
  return { ok: true, reason: 'Ready to list' }
}

/** Picks one of the current expert's skills to list. */
export function SellPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const persona = useApp((s) => s.persona)
  const skills = useSkills({ expert_id: persona })
  const list = [...(skills.data ?? [])].sort((a, b) => Number(listability(b).ok) - Number(listability(a).ok))
  const p = personaOf(persona)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="List a skill on the Exchange"
      description={`Skills recorded by ${p.name}. Only ready skills that passed the real-camera check can be listed.`}
      size="lg"
      testId="sell-picker"
    >
      {skills.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Camera className="size-5" />}
          title={p.role === 'expert' ? 'No skills recorded yet' : `${p.name} has no recorded skills`}
          action={
            <ButtonLink to="/studio" variant="primary" size="sm" onClick={onClose}>
              Capture a skill
            </ButtonLink>
          }
        >
          {p.role === 'expert' ? 'Record a task in the Studio first.' : 'Switch to an expert (Maria) in the top bar to list a skill.'}
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {list.map((s) => {
            const st = listability(s)
            const body = (
              <>
                <div className="grid size-10 shrink-0 place-items-center rounded-md bg-white/[0.04] text-fg-subtle shadow-[inset_0_0_0_1px_var(--color-line)]">
                  <Store className="size-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-fg">{s.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-fg-subtle">
                    <VerifiedBadge status={s.verification_status} />
                    <span className="telemetry">{s.steps_count} steps</span>
                    <span className="telemetry">{fmtDuration(s.duration)}</span>
                  </div>
                </div>
                <Badge tone={st.ok ? 'ok' : 'neutral'}>{st.reason}</Badge>
                {st.ok && <ArrowRight className="size-4 text-fg-subtle" aria-hidden />}
              </>
            )
            return (
              <li key={s.id}>
                {st.ok ? (
                  <Link
                    to={`/exchange/sell/${s.id}`}
                    onClick={onClose}
                    data-testid={`sell-pick-${s.id}`}
                    className="flex items-center gap-3 rounded-lg bg-white/[0.02] p-3 shadow-[inset_0_0_0_1px_var(--color-line)] transition-colors hover:bg-ion/[0.05] hover:shadow-[inset_0_0_0_1px_rgb(60_215_255/0.35)]"
                  >
                    {body}
                  </Link>
                ) : (
                  <Link
                    to={s.listed ? `/exchange/sell/${s.id}` : `/skills/${s.id}`}
                    onClick={onClose}
                    className={cn('flex items-center gap-3 rounded-lg p-3 opacity-70 shadow-[inset_0_0_0_1px_var(--color-line)] hover:opacity-100')}
                  >
                    {body}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Dialog>
  )
}
