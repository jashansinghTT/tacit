import type { LicenseType, Skill } from '@/lib/api'
import type { CreateListingBody } from '@/lib/api/exchange'
import { DEFAULT_PLANT, DEFAULT_PRICE, DEFAULT_SPLIT } from '../meta'

export interface SellDraft {
  voiceText: boolean
  confirmed: boolean
  price: Record<LicenseType, number>
  expertShare: number
  industry: string
  robots: string[]
  plant: string
}

export const initialDraft = (): SellDraft => ({
  voiceText: true,
  confirmed: false,
  price: { ...DEFAULT_PRICE },
  expertShare: DEFAULT_SPLIT.expert,
  industry: 'Manufacturing',
  robots: ['franka'],
  plant: DEFAULT_PLANT,
})

export type StepKey = 'check' | 'consent' | 'prices' | 'split' | 'market' | 'review'

export const STEPS: { key: StepKey; title: string; hint: string }[] = [
  { key: 'check', title: 'Check', hint: 'Ready and verified' },
  { key: 'consent', title: 'Consent', hint: 'What is shared' },
  { key: 'prices', title: 'Prices', hint: 'Per license type' },
  { key: 'split', title: 'Royalty split', hint: 'Expert and plant' },
  { key: 'market', title: 'Industry and robots', hint: 'Where it fits' },
  { key: 'review', title: 'Review and publish', hint: 'Go live' },
]

export function eligibility(skill: Skill) {
  const ready = skill.status === 'ready'
  const verified = skill.verification?.status === 'verified'
  return { ready, verified, ok: ready && verified && !skill.listing_id }
}

export function priceError(price: Record<LicenseType, number>): string | null {
  for (const v of Object.values(price)) if (!Number.isFinite(v) || v <= 0) return 'Every price must be more than zero.'
  return null
}

export function stepValid(key: StepKey, d: SellDraft, skill: Skill, isExpert: boolean): boolean {
  switch (key) {
    case 'check':
      return eligibility(skill).ok
    case 'consent':
      return d.confirmed && isExpert
    case 'prices':
      return priceError(d.price) === null
    case 'split':
      return d.expertShare > 0 && d.expertShare < 1
    case 'market':
      return d.robots.length > 0 && d.plant.trim().length > 0 && d.industry.length > 0
    case 'review':
      return true
  }
}

export function toBody(skillId: string, d: SellDraft): CreateListingBody {
  const expert = Math.round(d.expertShare * 100) / 100
  return {
    skill_id: skillId,
    price: d.price,
    royalty_split: { expert, plant: Math.round((1 - expert) * 100) / 100 },
    industry: d.industry,
    robot_types: d.robots,
    plant: d.plant.trim(),
    consent: { motion: true, gaze: true, voice_text: d.voiceText, raw_video: false, face: false, expert_confirmed: d.confirmed },
  }
}
