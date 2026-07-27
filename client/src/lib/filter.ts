import type { Business, Filters } from '../api.ts'

/**
 * Filter results in the browser.
 *
 * The businesses are already paid for and already in memory, so narrowing them
 * must be instant and must cost nothing. Re-running the search to apply a
 * filter would bill another Places call for data we already hold.
 *
 * The server applies the same rules when a search runs; this mirrors them for
 * the already-fetched set. `minRating` and `openNow` are additionally forwarded
 * to Google on the *next* search, because letting Google exclude them there
 * means fewer wasted results per paid call.
 */
export function filterBusinesses(businesses: Business[], f: Filters): Business[] {
  return businesses.filter((b) => {
    // A null rating means "unknown" (every OSM result), NOT zero stars. Treating
    // unknown as 0 would silently delete every OSM lead the moment a rating
    // filter is set. Unknown data can't fail a filter — only known data can.
    if (f.minRating != null && b.rating != null && b.rating < f.minRating) return false
    // OSM has no review counts (reviews === 0 always). Only filter on reviews
    // when the business actually has some — otherwise this nukes every OSM lead.
    if (f.minReviews != null && b.reviews > 0 && b.reviews < f.minReviews) return false
    if (f.hasWebsite === true && !b.website) return false
    if (f.hasWebsite === false && b.website) return false
    if (f.hasPhone === true && !b.phone) return false
    if (f.hasPhone === false && b.phone) return false
    if (f.openNow === true && b.openNow !== true) return false
    if (f.businessType && !b.types.includes(f.businessType)) return false
    // 0 (or blank) means "no distance limit", not "must be at exactly 0 km".
    // And businesses with no coordinates can't be distance-filtered — keep them
    // rather than dropping a lead for missing metadata.
    if (f.maxDistanceKm && b.distanceKm != null && b.distanceKm > f.maxDistanceKm) {
      return false
    }
    return true
  })
}
