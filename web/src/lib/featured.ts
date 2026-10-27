import { useListings, useSkills } from './api/queries'

/**
 * The skill (and its listing) that the tour and the landing links show. The demo script follows
 * the first seeded sample skill, so prefer the oldest ready, verified skill made from a sample;
 * then a listed one; then the newest. Falls back to index pages.
 */
export function useFeatured() {
  const skills = useSkills({ status: 'ready' })
  const listings = useListings({ verified: true })
  const verified = (skills.data ?? []).filter((s) => s.verification_status === 'verified')
  const seeded = verified.filter((s) => s.source_kind === 'sample').sort((a, b) => a.created_at.localeCompare(b.created_at))
  const skill = seeded[0] ?? verified.find((s) => s.listed) ?? verified[0] ?? skills.data?.[0] ?? null
  const listing = (listings.data ?? []).find((l) => l.skill_id === skill?.id) ?? listings.data?.[0] ?? null
  const id = skill?.id
  return {
    loading: skills.isLoading,
    skillId: id ?? null,
    listingId: listing?.id ?? null,
    links: {
      verify: id ? `/skills/${id}?tab=verify` : '/skills',
      sop: id ? `/skills/${id}?tab=sop` : '/skills',
      skill: id ? `/skills/${id}` : '/skills',
      learn: id ? `/learn/${id}` : '/learn',
      robot: id ? `/robot/${id}` : '/robot',
      listing: listing ? `/exchange/${listing.id}` : '/exchange',
    },
  }
}
