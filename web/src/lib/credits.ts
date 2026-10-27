// Stock-footage credits. /api/samples gives author and license as "Name (url)" strings; the seeded
// skills are made from those clips (source.kind "sample", source.sample_id).
import type { Sample } from './api/types'

export interface Credit {
  name: string
  licenseName: string | null
  licenseUrl: string | null
  /** Anything after the license, for example "labeled AI generated on Pixabay". */
  licenseNote: string | null
  /** Where the clip lives (its page on the stock site). */
  sourceUrl: string | null
  /** "Pexels", "Pixabay", or the host name. */
  site: string | null
}

const NAME_URL = /^(.*?)\s*\((https?:\/\/[^)\s]+)\)\s*(.*)$/

const SITES: Record<string, string> = { 'pexels.com': 'Pexels', 'pixabay.com': 'Pixabay' }

function siteOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return SITES[host] ?? host
  } catch {
    return null
  }
}

/** The credit for a sample clip, or null when the backend sent none. */
export function creditOf(sample: Pick<Sample, 'author' | 'license' | 'source_url'> | null | undefined): Credit | null {
  if (!sample || (!sample.author && !sample.source_url)) return null
  const a = sample.author?.match(NAME_URL)
  const l = sample.license?.match(NAME_URL)
  return {
    name: (a ? a[1] : sample.author)?.trim() || 'Unknown author',
    licenseName: (l ? l[1] : sample.license)?.trim() || null,
    licenseUrl: l ? l[2] : null,
    licenseNote: l?.[3]?.replace(/^[;,]\s*/, '').trim() || null,
    sourceUrl: sample.source_url ?? null,
    site: siteOf(sample.source_url),
  }
}
