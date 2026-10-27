import { useListings, useSkills } from './api/queries'

/**
 * The skill (and its listing) that the tour and the landing links show: the newest ready,
 * verified skill on this box, preferring one that is listed. Falls back to index pages.
 */
export function useFeatured() {
  const skills = useSkills({ status: 'ready' })
  const listings = useListings({ verified: true })
  const verified = (skills.data ?? []).filter((s) => s.verification_status === 'verified')
  const skill = verified.find((s) => s.listed) ?? verified[0] ?? skills.data?.[0] ?? null
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
