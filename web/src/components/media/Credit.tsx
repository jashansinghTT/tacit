import type { ReactNode } from 'react'
import { Film } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Sample, Skill } from '@/lib/api'
import { useSamples } from '@/lib/api/queries'
import { creditOf, type Credit } from '@/lib/credits'

/** An external link that opens in a new tab and says so to screen readers. */
function Ext({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) return <>{children}</>
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-fg-muted underline decoration-white/20 underline-offset-2 hover:text-fg hover:decoration-ion" onClick={(e) => e.stopPropagation()}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

/** "Video: Name · License", under a sample in the Studio picker. */
export function SampleCreditLine({ sample, className }: { sample: Sample; className?: string }) {
  const c = creditOf(sample)
  if (!c) return null
  return (
    <p className={cn('text-[11px] text-fg-subtle', className)} data-testid={`sample-credit-${sample.id}`}>
      Video: <Ext href={c.sourceUrl}>{c.name}</Ext>
      {c.licenseName && (
        <>
          {' · '}
          <Ext href={c.licenseUrl}>{c.licenseName}</Ext>
        </>
      )}
    </p>
  )
}

function FootageText({ c }: { c: Credit }) {
  return (
    <>
      Sample footage: <Ext href={c.sourceUrl}>{c.name}</Ext>
      {c.site && <> on {c.site}</>}
    </>
  )
}

/** The credit for a sample clip, by id (Studio streaming a sample). */
export function useSampleCredit(sampleId: string | null | undefined): Credit | null {
  const samples = useSamples()
  if (!sampleId) return null
  return creditOf(samples.data?.find((s) => s.id === sampleId))
}

/**
 * "Sample footage: Name on Pexels" wherever a sample-based skill's source video plays. Renders
 * nothing for live or uploaded captures. `overlay` sits in a corner of the video.
 */
export function FootageCredit({ skill, sampleId, overlay, className }: { skill?: Pick<Skill, 'source'> | null; sampleId?: string | null; overlay?: boolean; className?: string }) {
  const id = sampleId ?? (skill?.source.kind === 'sample' ? skill.source.sample_id : null)
  const c = useSampleCredit(id)
  if (!c) return null
  return (
    <p
      className={cn(
        'flex items-center gap-1.5 text-[11px] text-fg-subtle',
        overlay && 'pointer-events-auto rounded-sm bg-ink-950/75 px-2 py-1 backdrop-blur',
        className,
      )}
      data-testid="footage-credit"
    >
      <Film className="size-3 shrink-0" aria-hidden />
      <span>
        <FootageText c={c} />
      </span>
    </p>
  )
}
