import { z } from 'zod'
import type { Business } from './google.js'

export const FilterSchema = z
  .object({
    minRating: z.coerce.number().min(0).max(5).optional(),
    minReviews: z.coerce.number().min(0).optional(),
    businessType: z.string().trim().optional(),
    hasWebsite: z.boolean().optional(),
    hasPhone: z.boolean().optional(),
    openNow: z.boolean().optional(),
    maxDistanceKm: z.coerce.number().min(0).optional(),
  })
  .default({})

export type Filters = z.infer<typeof FilterSchema>

export interface ScoredBusiness extends Business {
  distanceKm: number | null
  leadScore: number
}

/** Great-circle distance in km. */
export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const rad = (d: number) => (d * Math.PI) / 180

/**
 * A well-reviewed business with no website is the best lead — it has money and
 * a gap. Reviews prove it's real; a website means someone already sold to them.
 */
export function leadScore(b: Business): number {
  let score = 0
  if (!b.website) score += 40
  if (b.reviews >= 100) score += 25
  else if (b.reviews >= 20) score += 15
  else if (b.reviews >= 5) score += 5
  if (b.rating != null && b.rating >= 4) score += 20
  if (b.phone) score += 10
  if (b.status === 'OPERATIONAL') score += 5
  return Math.min(100, score)
}

export function applyFilters(
  businesses: Business[],
  f: Filters,
  origin: { lat: number; lng: number },
): ScoredBusiness[] {
  return businesses
    .map((b) => ({
      ...b,
      distanceKm:
        b.lat != null && b.lng != null
          ? Number(haversine(origin, { lat: b.lat, lng: b.lng }).toFixed(2))
          : null,
      leadScore: leadScore(b),
    }))
    .filter((b) => {
      if (f.minRating != null && (b.rating ?? 0) < f.minRating) return false
      if (f.minReviews != null && b.reviews < f.minReviews) return false
      if (f.hasWebsite === true && !b.website) return false
      if (f.hasWebsite === false && b.website) return false
      if (f.hasPhone === true && !b.phone) return false
      if (f.hasPhone === false && b.phone) return false
      if (f.openNow === true && b.openNow !== true) return false
      if (f.businessType && !b.types.includes(f.businessType)) return false
      // Businesses with no coordinates can't be distance-filtered; keep them.
      if (f.maxDistanceKm != null && b.distanceKm != null && b.distanceKm > f.maxDistanceKm)
        return false
      return true
    })
    .sort((a, b) => b.leadScore - a.leadScore)
}
