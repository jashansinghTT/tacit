import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { EvalTrial, Job } from '@/lib/api'
import { qk, useJob } from '@/lib/api/queries'
import { robotApi, robotKeys, type EvalJobResult, type TrainJobResult } from '@/lib/api/robot'
import { toast } from '@/components/ui'

type Kind = 'train' | 'evaluate'

function storageKey(skillId: string, kind: Kind) {
  return `tacit.robot.${skillId}.${kind}`
}

function readJobId(skillId: string, kind: Kind) {
  try {
    return sessionStorage.getItem(storageKey(skillId, kind))
  } catch {
    return null
  }
}

function writeJobId(skillId: string, kind: Kind, id: string | null) {
  try {
    if (id) sessionStorage.setItem(storageKey(skillId, kind), id)
    else sessionStorage.removeItem(storageKey(skillId, kind))
  } catch {
    /* storage unavailable */
  }
}

/**
 * One backend job of `kind` for a skill. The id is kept in sessionStorage, so a reload (or leaving
 * the page and coming back) picks the running job up again instead of losing it.
 */
function useLabJob<R>(skillId: string, kind: Kind, onDone?: (job: Job<R>) => void) {
  const qc = useQueryClient()
  const [jobId, setJobId] = useState<string | null>(() => readJobId(skillId, kind))
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  })
  useEffect(() => {
    setJobId(readJobId(skillId, kind))
  }, [skillId, kind])
  // Only report a finish this page watched happen (not one found already done after a reload).
  const sawRunning = useRef(false)
  const job = useJob<R>(jobId, (j) => {
    writeJobId(skillId, kind, null)
    void qc.invalidateQueries({ queryKey: robotKeys.status(skillId) })
    void qc.invalidateQueries({ queryKey: qk.skill(skillId) })
    void qc.invalidateQueries({ queryKey: ['skills'] })
    if (!sawRunning.current) return
    sawRunning.current = false
    if (j.status === 'failed') setError(j.error ?? `${kind} failed`)
    doneRef.current?.(j)
  })
  useEffect(() => {
    if (job?.status === 'running' || job?.status === 'queued') sawRunning.current = true
  }, [job?.status])
  const start = useCallback(
    async (fn: () => Promise<{ job_id: string }>) => {
      setStarting(true)
      setError(null)
      try {
        const { job_id } = await fn()
        writeJobId(skillId, kind, job_id)
        sawRunning.current = true
        setJobId(job_id)
        void qc.invalidateQueries({ queryKey: robotKeys.status(skillId) })
      } catch (err) {
        const msg = (err as Error).message
        setError(msg)
        toast.error(kind === 'train' ? 'Training did not start' : 'Evaluation did not start', msg)
      } finally {
        setStarting(false)
      }
    },
    [skillId, kind, qc],
  )
  // A job id from an earlier session that the backend no longer knows (restart) is dropped.
  useEffect(() => {
    if (!jobId) return
    let stop = false
    fetch(`/api/jobs/${jobId}`)
      .then((r) => {
        if (!stop && r.status === 404) {
          writeJobId(skillId, kind, null)
          setJobId(null)
        }
      })
      .catch(() => undefined)
    return () => {
      stop = true
    }
  }, [jobId, skillId, kind])
  const running = starting || job?.status === 'running' || job?.status === 'queued'
  return { jobId, job, start, starting, running, error }
}

export interface TrainProgress {
  demosDone: number | null
  demosTotal: number | null
  scriptedSuccess: number | null
  epoch: number | null
  epochs: number | null
  lossCurve: [number, number][]
}

export function trainProgress(job: Job<TrainJobResult> | null): TrainProgress {
  const out: TrainProgress = { demosDone: null, demosTotal: null, scriptedSuccess: null, epoch: null, epochs: null, lossCurve: job?.result?.loss_curve ?? [] }
  if (!job) return out
  const demos = job.stages.find((s) => s.name === 'demos')
  const train = job.stages.find((s) => s.name === 'train')
  const d = demos?.detail ?? ''
  let m = d.match(/(\d+)\s*\/\s*(\d+)\s+demonstrations/)
  if (m) {
    out.demosDone = Number(m[1])
    out.demosTotal = Number(m[2])
  }
  m = d.match(/(\d+)\s+demos?,\s*scripted success\s+(\d+)%/)
  if (m) {
    out.demosDone = out.demosTotal = Number(m[1])
    out.scriptedSuccess = Number(m[2]) / 100
  }
  m = (train?.detail ?? '').match(/epoch\s+(\d+)\s*\/\s*(\d+)/)
  if (m) {
    out.epoch = Number(m[1])
    out.epochs = Number(m[2])
  }
  return out
}

/**
 * Trials as they finish. The job's final result has every trial with its reason; while it runs,
 * the stage detail says "k/n succeeded", so each new count tells whether the newest trial passed.
 */
function useLiveTrials(job: Job<EvalJobResult> | null, total: number, seed: number) {
  const [live, setLive] = useState<EvalTrial[]>([])
  const last = useRef({ id: '', done: 0, ok: 0 })
  useEffect(() => {
    if (!job) {
      setLive([])
      last.current = { id: '', done: 0, ok: 0 }
      return
    }
    if (job.id !== last.current.id) {
      last.current = { id: job.id, done: 0, ok: 0 }
      setLive([])
    }
    if (job.result?.trials?.length) return
    const m = (job.stages[0]?.detail ?? '').match(/(\d+)\s*\/\s*(\d+)\s+succeeded/)
    if (!m) return
    const ok = Number(m[1])
    const done = Number(m[2])
    const prev = last.current
    if (done <= prev.done) return
    const fresh: EvalTrial[] = []
    let okLeft = ok - prev.ok
    for (let i = prev.done; i < done; i++) {
      // successes first within a burst: the order inside one update is unknown anyway
      const success = okLeft > 0
      if (success) okLeft--
      fresh.push({ seed: seed + i, success, steps: 0, reason: success ? null : 'failed (reason when the evaluation finishes)' })
    }
    last.current = { id: job.id, done, ok }
    setLive((l) => [...l, ...fresh])
  }, [job, seed])
  const final = job?.result?.trials
  return useMemo(() => {
    if (final?.length) return final
    return live.slice(0, total)
  }, [final, live, total])
}

export function useLabJobs(skillId: string) {
  const train = useLabJob<TrainJobResult>(skillId, 'train', (j) => {
    if (j.status === 'done') toast.ok('Policy trained', `${j.result?.loss_curve?.length ?? 0} epochs on CPU`)
  })
  const [evalCfg, setEvalCfg] = useState({ trials: 20, seed: 0 })
  const evaluate = useLabJob<EvalJobResult>(skillId, 'evaluate', (j) => {
    if (j.status === 'done' && j.result?.success_rate != null) toast.ok('Evaluation finished', `${Math.round(j.result.success_rate * 100)}% success over ${j.result.trials?.length ?? 0} trials`)
  })
  const trials = useLiveTrials(evaluate.job, evalCfg.trials, evalCfg.seed)
  return {
    train: {
      ...train,
      progress: trainProgress(train.job),
      run: (demos: number, epochs: number) => train.start(() => robotApi.train(skillId, demos, epochs)),
    },
    evaluate: {
      ...evaluate,
      trials,
      config: evalCfg,
      run: (n: number, seed: number) => {
        setEvalCfg({ trials: n, seed })
        return evaluate.start(() => robotApi.evaluate(skillId, n, seed))
      },
    },
  }
}

export type LabJobs = ReturnType<typeof useLabJobs>
