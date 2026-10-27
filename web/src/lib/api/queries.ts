import { useEffect, useRef, useState } from 'react'
import { QueryClient, useQuery } from '@tanstack/react-query'
import { useApp } from '../store'
import { api, sockets } from './index'
import type { Job } from './types'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, err) => {
        const status = (err as { status?: number }).status
        return status !== 404 && status !== 400 && count < 2
      },
      refetchOnWindowFocus: false,
    },
  },
})

export const qk = {
  health: ['health'] as const,
  box: ['box'] as const,
  users: ['users'] as const,
  samples: ['samples'] as const,
  skills: (f: object = {}) => ['skills', f] as const,
  skill: (id: string) => ['skill', id] as const,
  tracks: (id: string) => ['tracks', id] as const,
  twin: (id: string) => ['twin', id] as const,
  pointcloud: (url: string) => ['pointcloud', url] as const,
  lessons: (u: string) => ['lessons', u] as const,
  lesson: (id: string) => ['lesson', id] as const,
  progress: ['progress'] as const,
  robotScene: ['robot-scene'] as const,
  robot: (id: string) => ['robot', id] as const,
  listings: (f: object = {}) => ['listings', f] as const,
  listing: (id: string) => ['listing', id] as const,
  library: (u: string) => ['library', u] as const,
  earnings: (u: string) => ['earnings', u] as const,
}

export const useHealth = () => useQuery({ queryKey: qk.health, queryFn: api.health, refetchInterval: 15_000, retry: false })
export const useBox = (live = true) =>
  useQuery({ queryKey: qk.box, queryFn: api.box, refetchInterval: live ? 3000 : false, staleTime: 2000 })
export const useUsers = () => useQuery({ queryKey: qk.users, queryFn: api.users, staleTime: Infinity })
export const useSamples = () => useQuery({ queryKey: qk.samples, queryFn: api.samples, staleTime: 60_000 })
export const useSampleVerify = (id: string | undefined) =>
  useQuery({ queryKey: ['sample-verify', id], queryFn: () => api.sampleVerify(id!), enabled: Boolean(id), staleTime: Infinity, retry: 1 })
export const useSkills = (f: { status?: string; expert_id?: string } = {}) =>
  useQuery({ queryKey: qk.skills(f), queryFn: () => api.skills(f) })
export const useSkill = (id: string | undefined, poll = false) =>
  useQuery({
    queryKey: qk.skill(id ?? ''),
    queryFn: () => api.skill(id!),
    enabled: Boolean(id),
    refetchInterval: (q) => (poll || q.state.data?.status === 'processing' ? 2500 : false),
  })
export const useTracks = (id: string | undefined, enabled = true) =>
  useQuery({ queryKey: qk.tracks(id ?? ''), queryFn: () => api.tracks(id!), enabled: Boolean(id) && enabled, staleTime: Infinity })
export const useTwin = (id: string | undefined, enabled = true) =>
  useQuery({ queryKey: qk.twin(id ?? ''), queryFn: () => api.twin(id!), enabled: Boolean(id) && enabled, staleTime: Infinity })
export const useAudits = (skillId: string | undefined) =>
  useQuery({ queryKey: ['audits', skillId], queryFn: () => api.audits(skillId!), enabled: Boolean(skillId) })
export const useAudit = (skillId: string | undefined, auditId: string | null) =>
  useQuery({ queryKey: ['audit', skillId, auditId], queryFn: () => api.audit(skillId!, auditId!), enabled: Boolean(skillId && auditId), staleTime: Infinity })
export const usePointcloud = (url: string | null | undefined) =>
  useQuery({ queryKey: qk.pointcloud(url ?? ''), queryFn: () => api.pointcloud(url!), enabled: Boolean(url), staleTime: Infinity })

export function useLessons() {
  const persona = useApp((s) => s.persona)
  return useQuery({ queryKey: qk.lessons(persona), queryFn: api.lessons })
}
export const useLesson = (id: string | undefined) =>
  useQuery({ queryKey: qk.lesson(id ?? ''), queryFn: () => api.lesson(id!), enabled: Boolean(id) })
export const useProgress = () => useQuery({ queryKey: qk.progress, queryFn: api.progress, refetchInterval: 10_000 })

export const useRobotScene = () => useQuery({ queryKey: qk.robotScene, queryFn: api.robotScene, staleTime: Infinity, retry: 1 })
export const useRobot = (id: string | undefined) =>
  useQuery({ queryKey: qk.robot(id ?? ''), queryFn: () => api.robot(id!), enabled: Boolean(id) })

export const useListings = (f: { q?: string; industry?: string; robot?: string; verified?: boolean } = {}) =>
  useQuery({ queryKey: qk.listings(f), queryFn: () => api.listings(f), placeholderData: (prev) => prev })
export const useListing = (id: string | undefined) =>
  useQuery({ queryKey: qk.listing(id ?? ''), queryFn: () => api.listing(id!), enabled: Boolean(id) })
export function useLibrary() {
  const persona = useApp((s) => s.persona)
  return useQuery({ queryKey: qk.library(persona), queryFn: api.library })
}
export function useEarnings() {
  const persona = useApp((s) => s.persona)
  return useQuery({ queryKey: qk.earnings(persona), queryFn: api.earnings })
}

/**
 * Follows a job: `WS /ws/jobs/{id}` pushes every change; if the socket fails, poll
 * `GET /api/jobs/{id}` once a second until the job is done or failed.
 */
export function useJob<R = Record<string, unknown>>(jobId: string | null | undefined, onFinish?: (job: Job<R>) => void) {
  const [job, setJob] = useState<Job<R> | null>(null)
  const finishRef = useRef(onFinish)
  useEffect(() => {
    finishRef.current = onFinish
  })
  useEffect(() => {
    if (!jobId) {
      setJob(null)
      return
    }
    let stopped = false
    let finished = false
    let poll: ReturnType<typeof setInterval> | null = null
    const accept = (j: Job<R>) => {
      if (stopped) return
      setJob(j)
      if (!finished && (j.status === 'done' || j.status === 'failed')) {
        finished = true
        finishRef.current?.(j)
        if (poll) clearInterval(poll)
      }
    }
    const startPolling = () => {
      if (poll || finished) return
      const tick = () => api.job<R>(jobId).then(accept).catch(() => undefined)
      void tick()
      poll = setInterval(tick, 1000)
    }
    const sock = sockets.job(jobId)
    sock.onMessage((m) => accept(m as unknown as Job<R>))
    sock.onState((s) => {
      if ((s === 'error' || s === 'closed') && !finished) startPolling()
    })
    // An initial GET so the view is filled before the first push.
    api.job<R>(jobId).then(accept).catch(() => undefined)
    return () => {
      stopped = true
      sock.close()
      if (poll) clearInterval(poll)
    }
  }, [jobId])
  return job
}
