// Number, time and money formatting used across the app. Telemetry uses tabular figures.

export function fmtMs(ms: number | null | undefined) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '–'
  if (ms >= 10000) return `${(ms / 1000).toFixed(1)} s`
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`
  if (ms >= 100) return `${Math.round(ms)} ms`
  return `${ms.toFixed(1)} ms`
}

export function fmtDuration(sec: number | null | undefined) {
  if (sec === null || sec === undefined || Number.isNaN(sec)) return '–'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function fmtClock(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`
}

export function fmtMoney(v: number | null | undefined, currency = 'USD', digits?: number) {
  if (v === null || v === undefined) return '–'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: digits ?? (v % 1 === 0 ? 0 : 2),
    minimumFractionDigits: digits ?? (v % 1 === 0 ? 0 : 2),
  }).format(v)
}

export function fmtInt(v: number | null | undefined) {
  if (v === null || v === undefined) return '–'
  return new Intl.NumberFormat('en-US').format(Math.round(v))
}

export function fmtPct(v: number | null | undefined, digits = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return '–'
  return `${(v * 100).toFixed(digits)}%`
}

export function fmtScore(v: number | null | undefined) {
  if (v === null || v === undefined) return '–'
  return v.toFixed(2)
}

export function fmtDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return '–'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

export function fmtAgo(iso: string | null | undefined) {
  if (!iso) return '–'
  const d = new Date(iso).getTime()
  const s = Math.round((Date.now() - d) / 1000)
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  if (s < 86400 * 14) return `${Math.round(s / 86400)} d ago`
  return fmtDate(iso)
}

export function fmtMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

export const LICENSE_LABEL: Record<string, string> = {
  training: 'Training',
  robot_deploy: 'Robot deploy',
  exclusive: 'Exclusive',
}

export const STAGE_LABEL: Record<string, string> = {
  decode: 'Decode',
  perceive: 'Perceive',
  events: 'Events',
  steps: 'Steps',
  write: 'Write',
  verify: 'Verify',
  twin: 'Twin',
  narrate: 'Narrate',
  ready: 'Ready',
  sample: 'Sample views',
  rebuild: 'Rebuild',
  score: 'Score',
  demos: 'Sim demos',
  train: 'Train',
  save: 'Save',
  trials: 'Trials',
  report: 'Report',
}
