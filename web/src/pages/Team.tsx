import { useMemo } from 'react'
import { ArrowRight, Users } from 'lucide-react'
import { Page, PageHeader } from '@/components/layout/Page'
import { ButtonLink, EmptyState, ErrorState, Panel, Skeleton, Stat } from '@/components/ui'
import { useCapturedSkills, useRobotReadiness, useTeamProgress } from '@/lib/api/learn'
import { useUsers } from '@/lib/api/queries'
import { Activity, isRobotReady, ProgressMatrix, ROBOT_TARGET, SkillsTable, traineesFrom } from '@/features/learn/team'

export default function TeamPage() {
  const progress = useTeamProgress()
  const skills = useCapturedSkills()
  const users = useUsers()
  const rows = useMemo(() => progress.data ?? [], [progress.data])
  const all = useMemo(() => skills.data ?? [], [skills.data])
  const ready = useMemo(() => all.filter((s) => s.status === 'ready'), [all])
  const robotQ = useRobotReadiness(ready.map((s) => s.id))
  const robot = useMemo(() => new Map(ready.map((s, i) => [s.id, { data: robotQ[i]?.data, loading: Boolean(robotQ[i]?.isLoading) }])), [ready, robotQ])
  const trainees = traineesFrom(users.data, rows)

  const certified = rows.filter((r) => r.passed).length
  const best = rows.map((r) => r.best_score ?? 0).filter((v) => v > 0)
  const avgBest = best.length ? best.reduce((a, b) => a + b, 0) / best.length : null
  const verified = all.filter((s) => s.verification_status === 'verified').length
  const robotReady = ready.filter((s) => isRobotReady(robot.get(s.id)?.data)).length
  const trained = ready.filter((s) => robot.get(s.id)?.data?.policy.status === 'trained').length
  const loading = progress.isLoading || skills.isLoading

  return (
    <Page wide testId="page-team">
      <PageHeader
        eyebrow="Plant manager"
        title="Team"
        description="Who has learned which skill, what the plant has captured, and which skills a robot can already do."
        actions={
          <ButtonLink to="/studio" variant="secondary" iconRight={<ArrowRight className="size-4" />}>
            Capture a skill
          </ButtonLink>
        }
      />

      {loading ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-28" />
          <Skeleton className="h-64" />
          <Skeleton className="h-80" />
        </div>
      ) : progress.error || skills.error ? (
        <ErrorState error={progress.error ?? skills.error} onRetry={() => void Promise.all([progress.refetch(), skills.refetch()])} />
      ) : (
        <div className="flex flex-col gap-4">
          <section className="panel grid grid-cols-2 gap-x-6 gap-y-5 p-5 md:grid-cols-3 xl:grid-cols-6" data-testid="team-stats">
            <Stat label="Skills captured" value={all.length} hint={`${ready.length} ready · ${verified} verified`} />
            <Stat label="Trainees" value={trainees.length} hint={`${new Set(rows.map((r) => r.trainee.id)).size} active`} />
            <Stat label="Lessons started" value={rows.length} tone={rows.length ? 'ion' : 'neutral'} />
            <Stat label="Certificates" value={certified} tone={certified ? 'ok' : 'neutral'} />
            <Stat label="Average best match" value={avgBest === null ? '–' : Math.round(avgBest * 100)} unit={avgBest === null ? undefined : '/ 100'} />
            <Stat label="Robot-ready" value={robotReady} unit={`/ ${ready.length}`} tone={robotReady ? 'ok' : 'neutral'} hint={`${trained} trained · target ${ROBOT_TARGET * 100}% in sim`} />
          </section>

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Panel title="Trainee progress" eyebrow="Per trainee and skill" pad={false} data-testid="team-progress">
              {ready.length === 0 ? (
                <EmptyState icon={<Users className="size-5" />} title="No lessons yet">
                  Trainee progress appears here once a skill is ready to teach.
                </EmptyState>
              ) : trainees.length === 0 ? (
                <EmptyState icon={<Users className="size-5" />} title="No trainees yet" />
              ) : (
                <ProgressMatrix trainees={trainees} skills={ready} rows={rows} />
              )}
            </Panel>
            <Panel title="Recent activity" eyebrow="Live" pad={false}>
              <Activity rows={rows} />
            </Panel>
          </div>

          <Panel title="Skills captured" eyebrow={`${all.length} skills · provenance, trainees and robot readiness`} pad={false} data-testid="team-skills">
            {all.length === 0 ? (
              <EmptyState
                title="Nothing captured yet"
                action={
                  <ButtonLink to="/studio" size="sm" variant="primary">
                    Open Studio
                  </ButtonLink>
                }
              >
                Record an expert in Studio, or process a sample, to start the library.
              </EmptyState>
            ) : (
              <SkillsTable skills={all} rows={rows} robot={robot} />
            )}
          </Panel>
        </div>
      )}
    </Page>
  )
}
