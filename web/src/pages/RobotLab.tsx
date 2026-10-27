import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowUpRight, Bot, Camera, CheckCircle2, Eye, History, Route, Tags, TriangleAlert, XCircle } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { RunMode } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
import { useSkill, useSkills, useTwin } from '@/lib/api/queries'
import { robotKeys, useRobotStatus, useRobotStatuses, useSimScene, type RobotStatus, type SimScene } from '@/lib/api/robot'
import { cn } from '@/lib/cn'
import { fmtAgo } from '@/lib/format'
import { Page, PageHeader } from '@/components/layout/Page'
import { Avatar, Badge, ButtonLink, EmptyState, ErrorState, IconButton, Panel, Segmented, Skeleton, toast } from '@/components/ui'
import { SimViewer, type ViewerLayers, type ViewPreset } from '@/features/robot/SimViewer'
import { clearRun, emptyPose, startRun, useRunUi } from '@/features/robot/runStream'
import { buildGhost } from '@/features/robot/retarget'
import { JointTelemetry, PlaybackBar } from '@/features/robot/Live'
import { LAB_MODES, MODE_META, ModeTabs, type LabMode, type ModeState } from '@/features/robot/ModeList'
import { EvaluatePanel, Gr00tFeeds, Gr00tPanel, PolicyPanel, ReplayPanel, TrainPanel } from '@/features/robot/ModePanels'
import { ExplainerStrip, uniqueTasks } from '@/features/robot/Explainer'
import { useLabJobs } from '@/features/robot/useLabJobs'

const RUN_LABEL: Record<RunMode, string> = { replay: 'Replay', policy: 'Policy', gr00t: 'GR00T', scripted: 'Scripted' }

const VIEWS: { key: ViewPreset; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'front', label: 'Front' },
  { key: 'top', label: 'Top' },
  { key: 'exterior', label: 'GR00T cam' },
]

function RunStatusChip() {
  const ui = useRunUi(useShallow((s) => ({ mode: s.mode, status: s.status, done: s.done, seed: s.seed })))
  if (ui.status === 'idle' || !ui.mode)
    return (
      <Badge tone="neutral" className="bg-ink-950/70 backdrop-blur" data-testid="run-status" data-status="idle">
        At rest · home pose
      </Badge>
    )
  const label = RUN_LABEL[ui.mode]
  if (ui.status === 'starting' || ui.status === 'streaming')
    return (
      <Badge tone="ion" dot pulse className="bg-ink-950/70 backdrop-blur" data-testid="run-status" data-status={ui.status}>
        {label} · {ui.status === 'starting' ? 'starting' : 'live'}
        {ui.seed !== null && <span className="telemetry opacity-70">seed {ui.seed}</span>}
      </Badge>
    )
  if (ui.status === 'stopped')
    return (
      <Badge tone="neutral" className="bg-ink-950/70 backdrop-blur" data-testid="run-status" data-status="stopped">
        {label} · stopped
      </Badge>
    )
  if (ui.status === 'error')
    return (
      <Badge tone="fault" icon={<TriangleAlert className="size-3" />} className="bg-ink-950/70 backdrop-blur" data-testid="run-status" data-status="error">
        {label} · stream error
      </Badge>
    )
  const expected = !ui.done?.success && ui.mode === 'gr00t'
  return (
    <Badge
      tone={ui.done?.success ? 'ok' : expected ? 'warn' : 'fault'}
      icon={ui.done?.success ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
      className="bg-ink-950/70 backdrop-blur"
      data-testid="run-status"
      data-status="done"
    >
      {label} · {ui.done?.success ? 'success' : expected ? 'did not finish' : 'failed'}
    </Badge>
  )
}

function PhasePill({ scene }: { scene: SimScene }) {
  const phase = useRunUi((s) => s.phase)
  const status = useRunUi((s) => s.status)
  if (!phase || status === 'idle') return null
  const tasks = scene.tasks ?? []
  const idx = tasks.findIndex((t) => phase === `pick ${t.object}` || (t.target && phase === `place ${t.target}`))
  return (
    <div className="flex items-center gap-2 rounded-md bg-ink-950/75 px-2.5 py-1.5 shadow-[inset_0_0_0_1px_var(--color-line-strong)] backdrop-blur" data-testid="run-phase">
      <span className="eyebrow !text-[10px]">Phase</span>
      <span className="telemetry text-[12px] text-fg">{phase}</span>
      {tasks.length > 1 && idx >= 0 && (
        <span className="telemetry text-[10px] text-fg-subtle">
          task {idx + 1}/{tasks.length}
        </span>
      )}
    </div>
  )
}

function RunHistory({ status }: { status: RobotStatus | undefined }) {
  const runs = [...(status?.runs ?? [])].reverse().slice(0, 8)
  return (
    <Panel title="Recent runs" eyebrow="History" actions={<History className="size-4 text-fg-faint" />} pad={false}>
      {runs.length === 0 ? (
        <EmptyState title="No runs yet" className="py-8">
          Replay the human, run the policy or GR00T; every run lands here.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line" data-testid="run-history">
          {runs.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-[12.5px]">
              {r.success === null ? <span className="size-4" /> : r.success ? <CheckCircle2 className="size-4 text-ok" /> : <XCircle className="size-4 text-fault" />}
              <span className="font-medium text-fg">{RUN_LABEL[r.mode] ?? r.mode}</span>
              <span className="telemetry text-[11px] text-fg-faint">{r.id}</span>
              <span className="ml-auto text-[11px] text-fg-subtle">{fmtAgo(r.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function ProgramPanel({ status, scene }: { status: RobotStatus | undefined; scene: SimScene | undefined }) {
  const program = status?.program ?? []
  const color = (name: string | undefined) => {
    const o = scene?.objects.find((x) => x.name === name) ?? scene?.targets.find((x) => x.name === name)
    const c = o?.rgba
    return c ? `rgb(${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)})` : 'var(--color-fg-subtle)'
  }
  return (
    <Panel title="Robot program" eyebrow="Written from the capture" actions={<Route className="size-4 text-fg-faint" />}>
      {program.length === 0 ? (
        <p className="text-[12.5px] text-fg-subtle">No program yet.</p>
      ) : (
        <ol className="space-y-1.5" data-testid="robot-program">
          {program.map((a, i) => (
            <li key={i} className="flex items-center gap-2.5 text-[12.5px]">
              <span className="telemetry w-5 text-right text-[10px] text-fg-faint">{i + 1}</span>
              <span className={cn('telemetry rounded-xs px-1.5 py-px text-[10px] uppercase', a.op === 'pick' ? 'bg-ion-soft text-ion' : 'bg-[rgb(167_139_250/0.12)] text-data-right')}>{a.op}</span>
              <span className="size-2.5 rounded-[3px]" style={{ background: color(a.object ?? a.target) }} aria-hidden />
              <span className="text-fg">{a.object ?? a.target}</span>
            </li>
          ))}
        </ol>
      )}
      {scene && (
        <p className="mt-3 border-t border-line pt-3 text-[11.5px] text-fg-subtle">
          Objects and bins come from the expert&rsquo;s capture; the sim gives each a shape and a fixed colour, and bins sit along the far edge of the table.
        </p>
      )}
    </Panel>
  )
}

/**
 * A link to a skill that is not on this box (the landing and the tour link to the sample's id)
 * lands on the best ready skill instead, a trained one first, and says so. With no ready skill,
 * it explains how skills get here.
 */
function UnknownSkill({ id }: { id: string }) {
  const skills = useSkills({ status: 'ready' })
  const navigate = useNavigate()
  const ids = (skills.data ?? []).map((s) => s.id)
  const statuses = useRobotStatuses(ids)
  const settled = skills.isSuccess && statuses.every((q) => !q.isLoading)
  useEffect(() => {
    if (!settled || !skills.data?.length) return
    const trained = skills.data.find((_, i) => statuses[i]?.data?.policy.status === 'trained')
    const pick = trained ?? skills.data[0]
    toast.info(`${id} is not on this box`, `Opened “${pick.title}” instead.`)
    navigate(`/robot/${pick.id}${location.search}`, { replace: true })
    // statuses is a new array every render; `settled` is the signal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, skills.data, id, navigate])
  if (!settled || skills.data?.length)
    return (
      <Page testId="page-robotlab">
        <Skeleton className="mb-6 h-20 w-2/3" />
        <Skeleton className="h-[520px]" />
      </Page>
    )
  return (
    <Page testId="page-robotlab">
      <PageHeader crumbs={[{ label: 'Robot Lab', to: '/robot' }, { label: id }]} title="Robot Lab" />
      <Panel>
        <EmptyState icon={<Bot className="size-5" />} title="This skill is not on this box" action={<ButtonLink to="/studio" variant="primary" size="sm">Capture a skill</ButtonLink>}>
          There is no skill with the id <span className="telemetry text-fg-muted">{id}</span>, and no processed skill yet. Capture one in the Studio; once it is
          processed it has a robot program and opens here.
        </EmptyState>
      </Panel>
    </Page>
  )
}

export default function RobotLabPage() {
  const { skillId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const skill = useSkill(skillId)
  const status = useRobotStatus(skillId)
  const scene = useSimScene(skillId)
  const ready = skill.data?.status === 'ready'
  const twin = useTwin(skillId, ready)
  const jobs = useLabJobs(skillId)
  const pose = useRef(emptyPose())
  const runMode = useRunUi((s) => s.mode)
  const runStatus = useRunUi((s) => s.status)
  const meta = useRunUi((s) => s.meta)

  const queryMode = params.get('mode') as LabMode | null
  const mode: LabMode = queryMode && LAB_MODES.includes(queryMode) ? queryMode : 'replay'
  const setMode = useCallback((m: LabMode) => setParams(m === 'replay' ? {} : { mode: m }, { replace: true }), [setParams])

  const [view, setView] = useState<ViewPreset>('overview')
  const [viewNonce, setViewNonce] = useState(0)
  const [labels, setLabels] = useState(true)
  const [trail, setTrail] = useState(true)
  const [ghostOn, setGhostOn] = useState(true)

  // Finished runs land in the skill's run history.
  const qc = useQueryClient()
  useEffect(() => {
    if (runStatus === 'done') void qc.invalidateQueries({ queryKey: robotKeys.status(skillId) })
  }, [runStatus, qc, skillId])

  // Leaving the page (or switching skill) ends the stream.
  useEffect(() => {
    clearRun()
    return () => clearRun()
  }, [skillId])

  const matrix = runMode === 'replay' ? meta?.human?.transform?.matrix : null
  const ghost = useMemo(() => (twin.data ? buildGhost(twin.data, matrix) : null), [twin.data, matrix])
  const showReplayLayer = mode === 'replay' || runMode === 'replay'
  const humanPath = showReplayLayer ? (runMode === 'replay' && meta?.human?.points?.length ? meta.human.points : ghost?.wrist ?? null) : null

  const layers: ViewerLayers = {
    labels,
    trail,
    ghost: ghostOn && showReplayLayer,
    cameras: mode === 'gr00t' || runMode === 'gr00t',
    spawn: mode === 'train' || mode === 'evaluate' || mode === 'policy',
  }

  const run = useCallback(
    (m: RunMode, seed: number) => {
      startRun(skillId, m, seed).catch((err: Error) => toast.error(`${RUN_LABEL[m]} run did not start`, err.message))
    },
    [skillId],
  )

  const policy = status.data?.policy
  const trained = policy?.status === 'trained'
  const simOff = status.data?.sim_available === false
  const replayReason = simOff
    ? 'The simulator is not installed on this box.'
    : !ready
      ? 'The skill is still being processed; replay needs its tracked hands.'
      : twin.isLoading
        ? null
        : !ghost
          ? 'This capture has no tracked hand path to replay (too few frames with a hand).'
          : null

  const evalTrials = jobs.evaluate.trials
  const modeStates: Record<LabMode, ModeState> = {
    replay: replayReason ? { label: 'no path', tone: 'neutral', disabled: true } : { label: ghost ? `${(ghost.times[ghost.times.length - 1] - ghost.t0).toFixed(0)} s` : '…', tone: 'ok' },
    train: jobs.train.running
      ? { label: jobs.train.progress.epoch != null ? `epoch ${jobs.train.progress.epoch}` : 'demos', tone: 'ion', busy: true }
      : trained
        ? { label: 'trained', tone: 'ok' }
        : { label: 'untrained', tone: 'neutral' },
    evaluate: jobs.evaluate.running
      ? { label: `${evalTrials.length}/${jobs.evaluate.config.trials}`, tone: 'ion', busy: true }
      : policy?.success_rate != null
        ? { label: `${Math.round(policy.success_rate * 100)}%`, tone: policy.success_rate >= 0.8 ? 'ok' : 'warn' }
        : { label: trained ? 'not run' : 'needs policy', tone: 'neutral', disabled: !trained },
    policy: trained ? { label: 'ready', tone: 'ok' } : { label: 'needs policy', tone: 'neutral', disabled: true },
    gr00t: runMode === 'gr00t' && (runStatus === 'streaming' || runStatus === 'starting') ? { label: 'live', tone: 'ion', busy: true } : { label: 'chip 3', tone: 'ok' },
  }

  if (skill.isError && (skill.error as { status?: number }).status === 404) return <UnknownSkill id={skillId} />

  const s = skill.data
  const tasks = uniqueTasks(status.data?.program ?? [])
  const evalLive = jobs.evaluate.running ? { ok: evalTrials.filter((t) => t.success).length, n: evalTrials.length } : null

  return (
    <Page testId="page-robotlab" wide>
      <PageHeader
        crumbs={[{ label: 'Robot Lab', to: '/robot' }, { label: s?.title ?? skillId }]}
        eyebrow="Do · Robot Lab"
        title={s ? s.title : <Skeleton className="h-9 w-80" />}
        meta={
          s && (
            <>
              <span className="flex items-center gap-2 text-[13px] text-fg-muted">
                <Avatar name={s.expert.name} size={22} />
                {s.expert.name}
              </span>
              <span className="text-fg-faint">·</span>
              {tasks.map((t) => (
                <Badge key={t} tone="neutral" icon={<Tags className="size-3" />}>
                  {t}
                </Badge>
              ))}
              <Badge tone="neutral" icon={<Bot className="size-3" />}>
                Franka Panda · MuJoCo
              </Badge>
              {simOff && <Badge tone="fault">Simulator not installed</Badge>}
            </>
          )
        }
        actions={
          <>
            <ButtonLink to="/robot" variant="ghost">
              All skills
            </ButtonLink>
            <ButtonLink to={`/skills/${skillId}`} variant="secondary" icon={<ArrowUpRight className="size-4" />}>
              Skill
            </ButtonLink>
          </>
        }
      />

      {skill.isError ? (
        <Panel>
          <ErrorState error={skill.error} onRetry={() => skill.refetch()} />
        </Panel>
      ) : (
        <>
          <ExplainerStrip
            skill={s}
            status={status.data}
            train={jobs.train.progress}
            training={jobs.train.running}
            evaluating={jobs.evaluate.running}
            evalLive={evalLive}
            onMode={setMode}
          />

          <div className="mt-5 grid gap-5 xl:grid-cols-12">
            <div className="flex min-w-0 flex-col gap-5 xl:col-span-8">
              <div className="panel overflow-hidden p-1.5">
                {scene.data ? (
                  <SimViewer
                    scene={scene.data}
                    pose={pose}
                    layers={layers}
                    view={view}
                    viewNonce={viewNonce}
                    ghost={showReplayLayer ? ghost : null}
                    humanPath={humanPath}
                    className="aspect-[16/10] min-h-[420px] w-full"
                  >
                    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
                      <div className="pointer-events-auto flex flex-wrap items-center gap-2">
                        <RunStatusChip />
                      </div>
                      <div className="pointer-events-auto flex items-center gap-1.5 rounded-md bg-ink-950/70 p-1 shadow-[inset_0_0_0_1px_var(--color-line-strong)] backdrop-blur">
                        <Segmented
                          label="Camera view"
                          value={view}
                          onChange={(v) => {
                            setView(v)
                            setViewNonce((n) => n + 1)
                          }}
                          items={VIEWS}
                        />
                        <span className="mx-0.5 h-5 w-px bg-line-strong" aria-hidden />
                        <IconButton label={labels ? 'Hide labels' : 'Show labels'} size="xs" onClick={() => setLabels((v) => !v)} className={labels ? 'text-fg' : undefined} aria-pressed={labels}>
                          <Tags className="size-3.5" />
                        </IconButton>
                        <IconButton label={trail ? 'Hide gripper trail' : 'Show gripper trail'} size="xs" onClick={() => setTrail((v) => !v)} className={trail ? 'text-fg' : undefined} aria-pressed={trail}>
                          <Route className="size-3.5" />
                        </IconButton>
                        <IconButton label="Reset view" size="xs" onClick={() => setViewNonce((n) => n + 1)}>
                          <Eye className="size-3.5" />
                        </IconButton>
                      </div>
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
                      <PhasePill scene={scene.data} />
                      {(mode === 'gr00t' || runMode === 'gr00t') && (
                        <span className="flex items-center gap-1.5 rounded-xs bg-ink-950/70 px-1.5 py-0.5 text-[10px] text-data-gaze backdrop-blur">
                          <Camera className="size-3" /> GR00T&rsquo;s two cameras shown as frustums
                        </span>
                      )}
                    </div>
                  </SimViewer>
                ) : scene.isError ? (
                  <div className="grid aspect-[16/10] min-h-[420px] place-items-center rounded-lg bg-ink-950">
                    <ErrorState error={scene.error} onRetry={() => scene.refetch()} />
                  </div>
                ) : (
                  <Skeleton className="aspect-[16/10] min-h-[420px] w-full rounded-lg" />
                )}
                <div className="space-y-3 px-3 pt-3 pb-2">
                  <PlaybackBar pose={pose} />
                  {scene.data && <JointTelemetry robot={scene.data.robot} pose={pose} />}
                </div>
              </div>
              {(mode === 'gr00t' || runMode === 'gr00t') && <Gr00tFeeds />}
            </div>

            <div className="flex min-w-0 flex-col gap-3 xl:col-span-4">
              <ModeTabs value={mode} onChange={setMode} states={modeStates} />
              <Panel
                id="robot-mode-panel"
                role="tabpanel"
                aria-labelledby={`robot-mode-${mode}`}
                eyebrow="Mode"
                title={MODE_META[mode].title}
                actions={
                  <Badge tone={modeStates[mode].tone} dot pulse={modeStates[mode].busy}>
                    {modeStates[mode].label}
                  </Badge>
                }
                data-testid={`panel-${mode}`}
                className="-mt-2"
              >
                {mode === 'replay' && (
                  <ReplayPanel
                    expert={s?.expert.name.split(' ')[0] ?? 'the expert'}
                    path={ghost ? { seconds: ghost.times[ghost.times.length - 1] - ghost.t0, frames: ghost.wrist.length, scale: ghost.scale, side: ghost.side } : null}
                    ghost={ghostOn}
                    onGhost={setGhostOn}
                    onRun={() => run('replay', 0)}
                    disabledReason={replayReason}
                  />
                )}
                {mode === 'train' && <TrainPanel jobs={jobs} status={status.data} onPreview={() => run('scripted', Math.floor(Math.random() * 1000))} />}
                {mode === 'evaluate' && (
                  <EvaluatePanel
                    jobs={jobs}
                    status={status.data}
                    onWatch={(seed) => {
                      run('policy', seed)
                      toast.info(`Watching trial seed ${seed}`, 'The same seed rebuilds the same scene, so the policy replays that trial live.')
                    }}
                  />
                )}
                {mode === 'policy' && <PolicyPanel status={status.data} onRun={(seed) => run('policy', seed)} onScripted={(seed) => run('scripted', seed)} />}
                {mode === 'gr00t' && <Gr00tPanel onRun={() => run('gr00t', Math.floor(Math.random() * 1000))} />}
              </Panel>
            </div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <RunHistory status={status.data} />
            <ProgramPanel status={status.data} scene={scene.data} />
          </div>
        </>
      )}
    </Page>
  )
}
