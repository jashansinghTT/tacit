// Query and mutation hooks for the exchange. Keys are the shared `qk` keys, so the landing page's
// exchange preview and the skill page see the same cache and the same invalidations.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LicenseType } from '@/lib/api'
import { exchangeApi, type CreateListingBody, type ListingFilter } from '@/lib/api/exchange'
import { qk } from '@/lib/api/queries'
import { useApp } from '@/lib/store'

export function useExListings(f: ListingFilter = {}) {
  return useQuery({ queryKey: qk.listings(f), queryFn: () => exchangeApi.listings(f), placeholderData: (prev) => prev })
}

export function useExListing(id: string | undefined) {
  return useQuery({ queryKey: qk.listing(id ?? ''), queryFn: () => exchangeApi.listing(id!), enabled: Boolean(id) })
}

export function useExLibrary() {
  const persona = useApp((s) => s.persona)
  return useQuery({ queryKey: qk.library(persona), queryFn: exchangeApi.library })
}

export function useExEarnings() {
  const persona = useApp((s) => s.persona)
  return useQuery({ queryKey: qk.earnings(persona), queryFn: exchangeApi.earnings })
}

/** The motion-only twin: shared with the skill page's cache, fetched once. */
export function useMotion(skillId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: qk.twin(skillId ?? ''),
    queryFn: () => exchangeApi.twin(skillId!),
    enabled: Boolean(skillId) && enabled,
    staleTime: Infinity,
    retry: 1,
  })
}

export function useCreateListing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateListingBody) => exchangeApi.create(body),
    onSuccess: (_l, body) => {
      void qc.invalidateQueries({ queryKey: ['listings'] })
      void qc.invalidateQueries({ queryKey: ['skills'] })
      void qc.invalidateQueries({ queryKey: ['skill', body.skill_id] })
    },
  })
}

export function useLicense(listingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (type: LicenseType) => exchangeApi.license(listingId, type),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['listings'] })
      void qc.invalidateQueries({ queryKey: ['listing', listingId] })
      void qc.invalidateQueries({ queryKey: ['library'] })
      void qc.invalidateQueries({ queryKey: ['earnings'] })
    },
  })
}
