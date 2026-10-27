// License types, royalty arithmetic and labels shared by every exchange page.
import { Bot, Crown, GraduationCap, type LucideIcon } from 'lucide-react'
import type { LicenseType } from '@/lib/api'
import type { ExListing, ExListingDetail } from '@/lib/api/exchange'

export interface LicenseMeta {
  type: LicenseType
  label: string
  icon: LucideIcon
  short: string
  /** Shown when the backend sends no terms for this type. */
  terms: string
  rights: string[]
}

export const LICENSES: Record<LicenseType, LicenseMeta> = {
  training: {
    type: 'training',
    label: 'Training',
    icon: GraduationCap,
    short: 'Teach people inside your organisation',
    terms: 'Use the lesson, SOP and motion data to train people inside your organisation. No robot deployment.',
    rights: ['Lesson, SOP and motion data', 'Train your own staff', 'No robot deployment'],
  },
  robot_deploy: {
    type: 'robot_deploy',
    label: 'Robot deploy',
    icon: Bot,
    short: 'Train and deploy robot policies',
    terms: 'Train and deploy robot policies from this skill on any number of robots you operate. Royalties are paid per license.',
    rights: ['Everything in Training', 'Train robot policies', 'Deploy on any number of your robots'],
  },
  exclusive: {
    type: 'exclusive',
    label: 'Exclusive',
    icon: Crown,
    short: 'Deploy, and the skill leaves the Exchange for a year',
    terms: 'As robot deploy, and the skill is removed from the Exchange for 12 months.',
    rights: ['Everything in Robot deploy', 'Removed from the Exchange for 12 months', 'No other buyer can license it'],
  },
}

export const DEFAULT_PRICE: Record<LicenseType, number> = { training: 49, robot_deploy: 499, exclusive: 9900 }
export const DEFAULT_SPLIT = { expert: 0.7, plant: 0.3 }
export const DEFAULT_PLANT = 'Northline Assembly, Plant 2'

export const INDUSTRIES = ['Manufacturing', 'Logistics', 'Food and beverage', 'Automotive', 'Electronics', 'Pharma', 'Aerospace']
export const ROBOT_TYPES: { key: string; label: string; detail: string }[] = [
  { key: 'franka', label: 'Franka', detail: '7-DoF arm, the sim and GR00T baseline' },
  { key: 'ur5', label: 'UR5', detail: 'Universal Robots cobot' },
  { key: 'ur10', label: 'UR10', detail: 'Universal Robots, long reach' },
  { key: 'xarm', label: 'xArm', detail: 'UFactory 6/7-DoF arm' },
  { key: 'humanoid', label: 'Humanoid', detail: 'Two-handed humanoid upper body' },
]

export function robotLabel(key: string) {
  return ROBOT_TYPES.find((r) => r.key === key)?.label ?? key
}

/** The terms for one license type, whichever shape the backend sent. */
export function termsFor(l: Pick<ExListingDetail, 'terms'> | null | undefined, type: LicenseType) {
  const t = l?.terms
  const raw = t && typeof t === 'object' && t[type] ? (t[type] as string) : LICENSES[type].terms
  // The backend names other license types by key ("As robot_deploy, ..."); say them as words.
  return raw.replace(/\b(training|robot_deploy|exclusive)\b/g, (k) => LICENSES[k as LicenseType].label.toLowerCase())
}

const round2 = (v: number) => Math.round(v * 100) / 100

/** The same split the backend books: amount × share, rounded to cents. */
export function royaltySplit(amount: number, split: { expert: number; plant: number }) {
  return { expert: round2(amount * split.expert), plant: round2(amount * split.plant) }
}

export function verificationScore(l: ExListing | ExListingDetail) {
  if (l.verification_score != null) return l.verification_score
  if ('skill' in l) return l.skill?.verification?.score ?? null
  return null
}

/** Reprojection: the backend reports either a pixel error or a relative one. */
export function reprojection(details: Record<string, unknown> | undefined) {
  if (!details) return null
  if (typeof details.reproj_px === 'number') return { value: details.reproj_px, label: `${details.reproj_px.toFixed(2)} px` }
  if (typeof details.reproj_rel === 'number') return { value: details.reproj_rel, label: `${(details.reproj_rel * 100).toFixed(2)} %` }
  return null
}
