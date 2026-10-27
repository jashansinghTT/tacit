// Skill Exchange API (F6). The shared `types.ts` follows docs/API.md; the backend returns a few
// more fields (and `terms` per license type), so the exchange pages use these wider types. Every
// extra field is optional, so mock-mode data in the API.md shape still renders.
import { request } from './client'
import type { Consent, Listing, LicenseType, Skill, Twin } from './types'

export const LICENSE_TYPES: LicenseType[] = ['training', 'robot_deploy', 'exclusive']

export interface ExConsent extends Consent {
  face?: boolean
  expert_confirmed?: boolean
}

export interface ExListing extends Omit<Listing, 'consent'> {
  consent: ExConsent
  verification_score?: number | null
  steps_count?: number
  duration?: number | null
}

/** What a buyer may see of the skill: no source video, no keyframes, answered Q&A only. */
export type PublicSkill = Omit<Skill, 'source' | 'qa'> & {
  source?: { duration?: number | null; kind?: string | null }
  qa: { question: string; answer: string | null }[]
}

export interface ListingContents {
  steps?: number
  episodes: number
  hours_of_motion: number
  formats: string[]
  policy?: boolean
}

export interface ExListingDetail extends ExListing {
  skill: PublicSkill
  contents: ListingContents
  /** Per license type from the backend; a single string in the API.md draft. */
  terms: Partial<Record<LicenseType, string>> | string
}

export interface CreateListingBody {
  skill_id: string
  price: Record<LicenseType, number>
  royalty_split: { expert: number; plant: number }
  industry: string
  robot_types: string[]
  plant?: string
  consent: { motion: boolean; gaze: boolean; voice_text: boolean; raw_video: false; face: false; expert_confirmed: boolean }
}

export interface Royalty {
  to: string
  amount: number
}

export interface Receipt {
  amount: number
  currency: string
  royalties: Royalty[]
  license_type?: LicenseType
  demo?: boolean
  issued_at?: string
}

export interface LicenseResult {
  license_id: string
  receipt: Receipt
  download: string
}

export interface ExLicense {
  id: string
  license_type: LicenseType
  amount?: number
  currency?: string
  created_at?: string
  download?: string
  listing_id?: string
}

export interface ExLibraryItem {
  license: ExLicense
  listing: ExListing | null
}

export interface ExEarningsEntry {
  at: string
  listing_id: string
  skill_title: string
  buyer: string
  license_type: LicenseType | ''
  amount: number
}

export interface ExEarnings {
  total: number
  currency: string
  by_month: [string, number][]
  entries: ExEarningsEntry[]
}

export interface ListingFilter {
  q?: string
  industry?: string
  robot?: string
  verified?: boolean
}

function qs(f: ListingFilter) {
  const p = new URLSearchParams()
  if (f.q) p.set('q', f.q)
  if (f.industry) p.set('industry', f.industry)
  if (f.robot) p.set('robot', f.robot)
  if (f.verified) p.set('verified', 'true')
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const exchangeApi = {
  listings: (f: ListingFilter = {}) => request<ExListing[]>(`/api/exchange/listings${qs(f)}`),
  listing: (id: string) => request<ExListingDetail>(`/api/exchange/listings/${id}`),
  create: (body: CreateListingBody) => request<ExListing>('/api/exchange/listings', { method: 'POST', body }),
  license: (listingId: string, licenseType: LicenseType) =>
    request<LicenseResult>(`/api/exchange/listings/${listingId}/license`, { method: 'POST', body: { license_type: licenseType } }),
  library: () => request<ExLibraryItem[]>('/api/exchange/library'),
  earnings: () => request<ExEarnings>('/api/earnings'),
  /** Motion only (body, hands, gaze, object positions): the preview a buyer is allowed to see. */
  twin: (skillId: string) => request<Twin>(`/api/skills/${skillId}/twin`),
}
