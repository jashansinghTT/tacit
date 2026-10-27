import { useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { CheckCircle2, Dices, Info, Loader2, Play, Square, XCircle } from 'lucide-react'
import type { RobotStatus, RunMode } from '@/lib/api/robot'
import { useBox } from '@/lib/api/queries'
import { cn } from '@/lib/cn'
import { fmtAgo, fmtMs, fmtPct } from '@/lib/format'
import { Badge, Button, ChipTag, Meter, Panel, ScoreRing, Segmented, Sparkline, Stat, StatusDot, Switch } from '@/components/ui'
import { CameraFeed } from './Live'
import { LossChart } from './LossChart'
import { FailureReasons, TrialGrid } from './TrialGrid'
import { stopRun, useRunUi } from './runStream'
import type { LabJobs } from './useLabJobs'

function Explain({ children }: { children: ReactNode }) {
  return <p className="text-[12.5px] leading-relaxed text-fg-subtle">{children}</p>
}

function Section({ title, children, aside, className }: { title: ReactNode; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <section className={cn('border-t border-line pt-3.5', className)}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="eyebrow">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** Start / stop for a streamed run of one mode, with the run's state on the button. */
function RunButton({ mode, label, onRun, disabled, title, variant = 'primary' }: { mode: RunMode; label: string; onRun: () => void; disabled?: boolean; title?: string; variant?: 'primary' | 'secondary' }) {
  const ui = useRunUi(useShallow((s) => ({ mode: s.mode, status: s.status })))
  const mine = ui.mode === mode
  const busy = mine && (ui.status === 'starting' || ui.status === 'streaming')
  if (busy)
    return (
      <Button variant="danger" icon={<Square className="size-3.5 fill-current" />} onClick={stopRun} className="w-full" data-testid={`stop-${mode}`}>
        Stop {ui.status === 'starting' ? '(starting…)' : 'run'}
      </Button>
    )
  return (
    <Button variant={variant} icon={<Play className="size-4" />} onClick={onRun} disabled={disabled} title={title} className="w-full" data-testid={`run-${mode}`}>
      {label}
    </Button>
  )
}

/** What the last streamed run of these modes did. */
function RunOutcome({ modes }: { modes: RunMode[] }) {
  const ui = useRunUi(useShallow((s) => ({ mode: s.mode, status: s.status, phase: s.phase, done: s.done, error: s.error, seed: s.seed })))
  if (!ui.mode || !modes.includes(ui.mode) || ui.status === 'idle') return null
  if (ui.status === 'error')
    return (
      <div role="alert" className="flex items-start gap-2 rounded-md bg-fault-soft px-3 py-2 text-[12.5px] text-fault" data-testid="run-error">
        <XCircle className="mt-0.5 size-4 shrink-0" />
        {ui.error}
      </div>
    )
  if (ui.status === 'stopped')
    return (
      <div className="rounded-md bg-white/[0.03] px-3 py-2 text-[12.5px] text-fg-muted shadow-[inset_0_0_0_1px_var(--color-line)]" data-testid="run-stopped">
        Stopped. Scrub the timeline under the view to look back over it.
      </div>
    )
  if (ui.status !== 'done' || !ui.done)
    return (
      <div className="flex items-center gap-2 rounded-md bg-ion-soft px-3 py-2 text-[12.5px] text-ion" data-testid="run-live">
        <Loader2 className="size-4 animate-spin" />
        {ui.status === 'starting' ? 'Starting the simulation…' : <>Running · <span className="telemetry">{ui.phase ?? '…'}</span></>}
      </div>
    )
  const d = ui.done
  // GR00T is the off-distribution baseline: not finishing is the expected result, not a fault.
  const expected = !d.success && ui.mode === 'gr00t'
  const tone = d.success ? 'ok' : expected ? 'warn' : 'fault'
  return (
    <div
      className={cn('rounded-md px-3 py-2.5 shadow-[inset_0_0_0_1px_currentColor]', { ok: 'bg-ok-soft text-ok/40', warn: 'bg-warn-soft text-warn/40', fault: 'bg-fault-soft text-fault/40' }[tone])}
      data-testid="run-outcome"
      data-success={d.success}
    >
      <div className={cn('flex items-center gap-2 text-[13px] font-medium', { ok: 'text-ok', warn: 'text-warn', fault: 'text-fault' }[tone])}>
        {d.success ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
        {d.success ? 'Success' : expected ? 'Did not finish (expected for the baseline)' : 'Did not succeed'}
        {ui.seed !== null && <span className="telemetry ml-auto text-[11px] font-normal text-fg-subtle">seed {ui.seed}</span>}
      </div>
      {d.reason && <div className="mt-1 text-[12px] text-fg-muted">{d.reason}</div>}
      <div className="telemetry mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-fg-subtle">
        {d.seconds != null && <span>{d.seconds.toFixed(1)} s sim</span>}
        {d.steps != null && <span>{d.steps} steps</span>}
        {d.tasks_done != null && ui.mode !== 'replay' && <span>{d.tasks_done} task{d.tasks_done === 1 ? '' : 's'} done</span>}
        {d.regrasps ? <span>{d.regrasps} regrasp{d.regrasps === 1 ? '' : 's'}</span> : null}
        {d.tracking_error_m != null && <span>tracking error {(d.tracking_error_m * 100).toFixed(1)} cm</span>}
        {d.gr00t?.p50_ms != null && <span>GR00T p50 {fmtMs(d.gr00t.p50_ms)} · {d.gr00t.calls} calls</span>}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------------------------ replay

export function ReplayPanel({
  expert,
  path,
  ghost,
  onGhost,
  onRun,
  disabledReason,
}: {
  expert: string
  path: { seconds: number; frames: number; scale: number | null; side: 'left' | 'right' } | null
  ghost: boolean
  onGhost: (v: boolean) => void
  onRun: () => void
  disabledReason: string | null
}) {
  return (
    <div className="space-y-4">
      <Explain>
        The arm follows {expert}&rsquo;s wrist, frame by frame. Her path was tracked in 3D from the camera, laid onto the table plane and scaled into the robot&rsquo;s reach; her
        hands replay alongside as a ghost so you can compare.
      </Explain>
      {path ? (
        <div className="grid grid-cols-3 gap-3">
          <Stat size="sm" label="Path" value={path.seconds.toFixed(1)} unit="s" />
          <Stat size="sm" label="Tracked" value={path.frames} unit="frames" />
          <Stat size="sm" label="Scale" value={path.scale ? `×${path.scale.toFixed(2)}` : '–'} hint={`${path.side} hand`} />
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3 rounded-md bg-white/[0.025] px-3 py-2 shadow-[inset_0_0_0_1px_var(--color-line)]">
        <span className="flex items-center gap-2 text-[12.5px] text-fg-muted">
          <span className="flex -space-x-1" aria-hidden>
            <span className="size-2.5 rounded-full bg-data-left shadow-[0_0_6px_var(--color-data-left)]" />
            <span className="size-2.5 rounded-full bg-data-right shadow-[0_0_6px_var(--color-data-right)]" />
          </span>
          The expert&rsquo;s hands (left, right) and her wrist path
        </span>
        <Switch checked={ghost} onChange={onGhost} label="Show the expert's hands" />
      </div>
      <RunButton mode="replay" label="Replay the human" onRun={onRun} disabled={Boolean(disabledReason)} title={disabledReason ?? undefined} />
      {disabledReason && (
        <p className="flex items-start gap-2 text-[12px] text-fg-subtle" data-testid="replay-unavailable">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {disabledReason}
        </p>
      )}
      <RunOutcome modes={['replay']} />
    </div>
  )
}

// ------------------------------------------------------------------------------------- train

const DEMO_CHOICES = [50, 100, 200, 400]
const EPOCH_CHOICES = [10, 30, 60]

function ProgressRow({ label, done, total, detail, active, complete }: { label: string; done: number | null; total: number | null; detail?: ReactNode; active: boolean; complete: boolean }) {
  const v = total ? (done ?? 0) / total : complete ? 1 : 0
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[12px]">
        <span className={cn('flex items-center gap-1.5', active || complete ? 'text-fg' : 'text-fg-subtle')}>
          {complete ? <CheckCircle2 className="size-3.5 text-ok" /> : active ? <Loader2 className="size-3.5 animate-spin text-ion" /> : <StatusDot tone="neutral" />}
          {label}
        </span>
        <span className="telemetry text-[11px] text-fg-subtle">{detail}</span>
      </div>
      <Meter value={v} tone={complete ? 'ok' : 'ion'} label={label} />
    </div>
  )
}

export function TrainPanel({ jobs, status, onPreview }: { jobs: LabJobs; status: RobotStatus | undefined; onPreview: () => void }) {
  const [demos, setDemos] = useState(200)
  const [epochs, setEpochs] = useState(30)
  const t = jobs.train
  const job = t.job
  const p = t.progress
  const policy = status?.policy
  const stage = job?.stage
  const curve = p.lossCurve.length ? p.lossCurve : (policy?.loss_curve ?? [])
  const finalLoss = curve.length ? curve[curve.length - 1][1] : null
  const demosDone = job?.stages.find((s) => s.name === 'demos')?.status === 'done'
  const trainDone = job?.stages.find((s) => s.name === 'train')?.status === 'done'
  const showJob = Boolean(job) || t.starting
  return (
    <div className="space-y-4">
      <Explain>
        The program runs {demos} times in simulation from randomised start poses (inside the dashed region), with noise injected so the policy also sees recoveries. A
        behaviour-cloning network then learns those demonstrations on the CPU.
      </Explain>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="eyebrow mb-1.5">Demonstrations</div>
          <Segmented label="Demonstrations" value={String(demos)} onChange={(v) => setDemos(Number(v))} items={DEMO_CHOICES.map((n) => ({ key: String(n), label: n }))} />
        </div>
        <div>
          <div className="eyebrow mb-1.5">Epochs</div>
          <Segmented label="Epochs" value={String(epochs)} onChange={(v) => setEpochs(Number(v))} items={EPOCH_CHOICES.map((n) => ({ key: String(n), label: n }))} />
        </div>
      </div>
      <Button variant="primary" className="w-full" icon={<Play className="size-4" />} loading={t.running} onClick={() => void t.run(demos, epochs)} disabled={t.running} data-testid="run-train">
        {t.running ? 'Training…' : policy?.status === 'trained' ? 'Train again' : 'Train policy'}
      </Button>
      {showJob && (
        <div className="space-y-3" data-testid="train-progress" data-status={job?.status ?? 'starting'}>
          <ProgressRow
            label="Sim demonstrations"
            done={p.demosDone}
            total={p.demosTotal ?? demos}
            active={stage === 'demos'}
            complete={demosDone}
            detail={p.scriptedSuccess != null ? `${p.demosTotal} · scripted ${fmtPct(p.scriptedSuccess)}` : p.demosDone != null ? `${p.demosDone}/${p.demosTotal}` : ''}
          />
          <ProgressRow
            label="Behaviour cloning"
            done={p.epoch}
            total={p.epochs ?? epochs}
            active={stage === 'train'}
            complete={trainDone}
            detail={p.epoch != null ? `epoch ${p.epoch}/${p.epochs}` : ''}
          />
          {job?.status === 'failed' && <p className="text-[12px] text-fault">{job.error ?? 'Training failed'}</p>}
        </div>
      )}
      <Section
        title="Training loss"
        aside={finalLoss != null && <span className="telemetry text-[11px] text-fg-muted">{curve.length} epochs · {finalLoss.toFixed(4)}</span>}
      >
        <LossChart curve={curve} epochs={t.running ? (p.epochs ?? epochs) : curve.length} live={stage === 'train' && t.running} />
      </Section>
      <Section title="Policy">
        <div className="flex items-center justify-between gap-3 text-[12.5px]">
          <span className="text-fg-muted">
            {policy?.status === 'trained' ? (
              <>
                Trained {fmtAgo(policy.trained_at)} on {policy.demos ?? '–'} demos
              </>
            ) : policy?.status === 'training' ? (
              'Training now'
            ) : (
              'Not trained yet'
            )}
          </span>
          <Badge tone={policy?.status === 'trained' ? 'ok' : policy?.status === 'training' ? 'ion' : policy?.status === 'failed' ? 'fault' : 'neutral'} dot pulse={policy?.status === 'training'}>
            {policy?.status ?? 'untrained'}
          </Badge>
        </div>
        <button type="button" onClick={onPreview} className="mt-3 text-[12px] font-medium text-ion hover:underline" data-testid="preview-demo">
          Watch one scripted demonstration →
        </button>
      </Section>
    </div>
  )
}

// ---------------------------------------------------------------------------------- evaluate

export function EvaluatePanel({ jobs, status, onWatch }: { jobs: LabJobs; status: RobotStatus | undefined; onWatch: (seed: number) => void }) {
  const [n, setN] = useState(20)
  const e = jobs.evaluate
  const policy = status?.policy
  const trained = policy?.status === 'trained'
  const trials = e.job ? e.trials : (policy?.last_eval ?? [])
  const finished = e.job?.status === 'done'
  const ok = trials.filter((t) => t.success).length
  const rate = trials.length ? ok / trials.length : (policy?.success_rate ?? null)
  const shownTotal = e.job ? e.config.trials : trials.length || n
  return (
    <div className="space-y-4">
      <Explain>
        Each trial is a new randomised scene the policy has never seen (trial seeds are kept apart from training). A trial succeeds when every object ends in its target.
      </Explain>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <div className="eyebrow mb-1.5">Trials</div>
          <Segmented label="Trials" value={String(n)} onChange={(v) => setN(Number(v))} items={[10, 20, 50].map((k) => ({ key: String(k), label: k }))} />
        </div>
        <Button
          variant="primary"
          icon={<Play className="size-4" />}
          loading={e.running}
          disabled={!trained || e.running}
          title={trained ? undefined : 'Train a policy first'}
          onClick={() => void e.run(n, 0)}
          data-testid="run-evaluate"
        >
          {e.running ? 'Evaluating…' : 'Evaluate policy'}
        </Button>
      </div>
      {!trained && <p className="text-[12px] text-fg-subtle">Train a policy first; evaluation runs it on fresh scenes.</p>}
      <div className="flex items-center gap-4">
        <ScoreRing value={rate} size={84} stroke={7} label="success rate" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="telemetry text-2xl font-medium text-fg" data-testid="eval-score">
            {trials.length ? (
              <>
                {ok}
                <span className="text-fg-subtle">/{trials.length}</span>
              </>
            ) : policy?.trials ? (
              <>
                {Math.round((policy.success_rate ?? 0) * policy.trials)}
                <span className="text-fg-subtle">/{policy.trials}</span>
              </>
            ) : (
              '–'
            )}
          </div>
          <div className="text-[12px] text-fg-subtle">
            {e.running
              ? `Trial ${Math.min(trials.length + 1, shownTotal)} of ${shownTotal}…`
              : finished
                ? `Finished${e.job?.stages[0]?.ms ? ` in ${fmtMs(e.job.stages[0].ms)}` : ''}`
                : policy?.evaluated_at
                  ? `Last evaluated ${fmtAgo(policy.evaluated_at)}`
                  : 'Not evaluated yet'}
          </div>
          {rate != null && (
            <Badge tone={rate >= 0.8 ? 'ok' : rate >= 0.5 ? 'warn' : 'fault'}>{rate >= 0.8 ? 'Meets the 80% bar' : 'Below the 80% bar'}</Badge>
          )}
        </div>
      </div>
      <Section title={`Trials${trials.length ? ` · ${trials.length}/${shownTotal}` : ''}`} aside={trials.length > 0 && <span className="text-[11px] text-fg-subtle">click one to watch it</span>}>
        <TrialGrid total={shownTotal} seed={e.config.seed} trials={trials} running={e.running} onWatch={onWatch} />
      </Section>
      {trials.some((t) => !t.success) && (
        <Section title="Why trials failed">
          <FailureReasons trials={trials} />
        </Section>
      )}
    </div>
  )
}

// ------------------------------------------------------------------------------------ policy

export function PolicyPanel({ status, onRun, onScripted }: { status: RobotStatus | undefined; onRun: (seed: number) => void; onScripted: (seed: number) => void }) {
  const [seed, setSeed] = useState(() => 100 + Math.floor(Math.random() * 900))
  const trained = status?.policy.status === 'trained'
  return (
    <div className="space-y-4">
      <Explain>
        The trained policy runs closed-loop on a randomised scene: every 33 ms it reads the gripper and object positions and outputs the next motion. The seed fixes the scene, so the
        same seed replays the same start.
      </Explain>
      <div className="flex items-end gap-2">
        <label className="flex-1">
          <span className="eyebrow mb-1.5 block">Scene seed</span>
          <input
            type="number"
            min={0}
            value={seed}
            onChange={(e) => setSeed(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            className="telemetry h-10 w-full rounded-md bg-ink-900 px-3 text-sm text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)] focus:shadow-[inset_0_0_0_1px_var(--color-ion)] focus:outline-none"
            data-testid="policy-seed"
          />
        </label>
        <Button variant="secondary" icon={<Dices className="size-4" />} onClick={() => setSeed(Math.floor(Math.random() * 1000))} aria-label="Random seed">
          Shuffle
        </Button>
      </div>
      <RunButton mode="policy" label="Run policy" onRun={() => onRun(seed)} disabled={!trained} title={trained ? undefined : 'Train a policy first'} />
      {!trained && <p className="text-[12px] text-fg-subtle">Train a policy first (Train mode).</p>}
      <RunOutcome modes={['policy', 'scripted']} />
      <button type="button" onClick={() => onScripted(seed)} className="text-[12px] font-medium text-ion hover:underline" data-testid="run-scripted">
        Run the scripted program on this seed instead →
      </button>
    </div>
  )
}

// ------------------------------------------------------------------------------------- gr00t

export function Gr00tPanel({ onRun }: { onRun: () => void }) {
  const box = useBox()
  const chip = box.data?.chips.find((c) => c.models.some((m) => /gr00t/i.test(m.name)))
  const model = chip?.models.find((m) => /gr00t/i.test(m.name))
  const healthy = model?.healthy ?? null
  const g = useRunUi((s) => s.gr00t)
  const meta = useRunUi((s) => s.meta)
  const mode = useRunUi((s) => s.mode)
  const instruction = g.last?.instruction ?? (mode === 'gr00t' ? meta?.instruction : null)
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-md bg-white/[0.025] px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--color-line)]">
        <StatusDot tone={healthy === null ? 'neutral' : healthy ? 'ok' : 'fault'} pulse={Boolean(healthy)} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-fg">GR00T N1.7 · 3B</div>
          <div className="text-[11.5px] text-fg-subtle">NVIDIA&rsquo;s robot foundation model, served on the box</div>
        </div>
        <ChipTag chip={chip?.id ?? 3} />
      </div>
      <Explain>
        GR00T sees what a real robot would: an over-the-shoulder camera and a wrist camera (rendered here at 320×180), the arm&rsquo;s state and a one-line instruction. It answers
        with 40-step action chunks; the sim re-asks every 8 steps. It learned on real DROID data, so this sim is off its training distribution: it is the baseline, not expected to
        finish the task.
      </Explain>
      <RunButton mode="gr00t" label="Run GR00T on chip 3" onRun={onRun} disabled={healthy === false} title={healthy === false ? 'GR00T is not healthy on its chip' : undefined} />
      <RunOutcome modes={['gr00t']} />
      {instruction && (
        <div className="rounded-md border-l-2 border-ion bg-ion-soft/40 px-3 py-2" data-testid="gr00t-instruction">
          <div className="eyebrow mb-0.5">Instruction</div>
          <div className="text-[13px] text-fg">&ldquo;{instruction}&rdquo;</div>
        </div>
      )}
      <Section title="Latency per call" aside={g.calls > 0 && <span className="telemetry text-[11px] text-fg-subtle">{g.calls} calls</span>}>
        <div className="grid grid-cols-3 gap-3" data-testid="gr00t-latency">
          <Stat size="sm" label="Last" value={g.last ? fmtMs(g.last.ms) : '–'} />
          <Stat size="sm" label="p50" value={g.p50 != null ? fmtMs(g.p50) : '–'} tone="ion" />
          <Stat size="sm" label="On chip" value={g.last?.device_ms != null ? fmtMs(g.last.device_ms) : '–'} />
        </div>
        <div className="mt-3 h-10">{g.recent.length > 1 ? <Sparkline data={g.recent} width={380} height={40} className="h-10 w-full" /> : <div className="h-10 rounded-sm dot-bg" />}</div>
      </Section>
    </div>
  )
}

/** GR00T's two inputs side by side, under the viewer: what the foundation model actually sees. */
export function Gr00tFeeds() {
  const g = useRunUi((s) => s.gr00t)
  return (
    <Panel
      eyebrow="Inputs, 320×180 at 5 Hz"
      title="What GR00T sees"
      actions={
        g.calls > 0 && (
          <span className="telemetry text-[11px] text-fg-subtle">
            {g.calls} calls · p50 {g.p50 != null ? fmtMs(g.p50) : '–'}
          </span>
        )
      }
      data-testid="gr00t-feeds"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <CameraFeed name="exterior" label="exterior_image_1_left" />
        <CameraFeed name="wrist" label="wrist_image_left" />
      </div>
    </Panel>
  )
}
