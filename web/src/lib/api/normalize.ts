// The backend fills skills in stage by stage, so a skill that is still processing (or an older
// record) can miss fields. Normalise once here so every page can rely on the full shape.
import type { Audit, AuditStep, BoxStatus, Skill, SkillSummary } from './types'

export function normalizeSkill(raw: Partial<Skill> & { id: string }): Skill {
  const v = (raw.verification ?? {}) as Partial<Skill['verification']>
  const r = (raw.robot ?? {}) as Partial<Skill['robot']>
  const src = (raw.source ?? {}) as Partial<Skill['source']>
  const steps = [...(raw.steps ?? [])].sort((a, b) => a.t_start - b.t_start)
  const duration = src.duration ?? (steps.length ? steps[steps.length - 1].t_end : 0)
  return {
    id: raw.id,
    title: raw.title || 'Untitled skill',
    summary: raw.summary ?? '',
    status: raw.status ?? 'draft',
    created_at: raw.created_at ?? new Date().toISOString(),
    expert: raw.expert ?? { id: 'unknown', name: 'Unknown expert' },
    source: {
      kind: src.kind ?? 'upload',
      video: src.video ?? null,
      fps: src.fps ?? 30,
      duration,
      width: src.width ?? 1280,
      height: src.height ?? 720,
    },
    consent: raw.consent ?? { motion: false, gaze: false, voice_text: false, raw_video: false, signed_by: null, signed_at: null },
    steps: steps.map((s) => ({ ...s, objects: s.objects ?? [], tips: s.tips ?? [], why: s.why ?? '', why_source: s.why_source ?? 'inferred' })),
    // QA rows may carry step_index instead of step_id, and no id of their own.
    qa: (raw.qa ?? []).map((q, i) => {
      const qq = q as typeof q & { step_index?: number }
      return { ...q, id: q.id ?? `qa${i + 1}`, step_id: q.step_id ?? steps.find((s) => s.index === qq.step_index)?.id ?? '' }
    }),
    sop_markdown: raw.sop_markdown ?? '',
    quiz: raw.quiz ?? [],
    safety: raw.safety ?? [],
    verification: {
      status: v.status ?? 'pending',
      score: v.score ?? null,
      method: v.method ?? 'VGGT multi-view consistency',
      details: { views: 0, ...(v.details ?? {}) },
      checked_at: v.checked_at ?? null,
      pointcloud: v.pointcloud ?? null,
      served_by: v.served_by,
    },
    robot: {
      program: r.program ?? [],
      policy: r.policy ?? { status: 'untrained', success_rate: null, trials: null, trained_at: null },
      gr00t: r.gr00t ?? { last_run: null },
    },
    listing_id: raw.listing_id ?? null,
    models_used: raw.models_used ?? [],
    job_id: raw.job_id ?? null,
  }
}

export function normalizeSummary(raw: Partial<SkillSummary> & { id: string }): SkillSummary {
  return {
    id: raw.id,
    title: raw.title || 'Untitled skill',
    summary: raw.summary ?? '',
    status: raw.status ?? 'draft',
    created_at: raw.created_at ?? new Date().toISOString(),
    expert: raw.expert ?? { id: 'unknown', name: 'Unknown expert' },
    thumb: raw.thumb ?? null,
    duration: raw.duration ?? null,
    steps_count: raw.steps_count ?? 0,
    verification_status: raw.verification_status ?? 'pending',
    listed: raw.listed ?? false,
    source_kind: raw.source_kind,
  }
}

export function normalizeBox(raw: BoxStatus): BoxStatus {
  return {
    ...raw,
    chips: (raw.chips ?? []).map((c) => ({
      ...c,
      models: (c.models ?? []).map((m) => ({
        ...m,
        calls: m.calls ?? 0,
        // Per-member device memory from the cohost status, when the backend sends it.
        dram_gib: m.dram_gib ?? (m.key && c.memory?.members ? c.memory.members[m.key] : undefined),
      })),
    })),
    totals: raw.totals ?? { models: 0, healthy: 0, chips: raw.chips?.length ?? 0 },
  }
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : [])

export function normalizeAudit(raw: Audit): Audit {
  return {
    ...raw,
    narrative: raw.narrative ?? null,
    summary: raw.summary ?? null,
    steps: (raw.steps ?? []).map((st) => {
      const r = st as AuditStep & { run_t?: number | number[] | null; gaze_check?: { expert_looked_at?: unknown; worker_looked_at?: unknown; ok?: boolean | null } | null }
      const rt = Array.isArray(r.run_t) ? r.run_t : r.run_t != null ? [r.run_t] : []
      return {
        ...st,
        score: st.score ?? null,
        expert_seconds: st.expert_seconds ?? null,
        run_seconds: st.run_seconds ?? null,
        run_t: rt[0] ?? null,
        run_t_end: rt[1] ?? null,
        gaze_check: r.gaze_check
          ? { expert_looked_at: asList(r.gaze_check.expert_looked_at), worker_looked_at: asList(r.gaze_check.worker_looked_at), ok: r.gaze_check.ok ?? null }
          : null,
      }
    }),
  }
}
