/**
 * Cross-search lead ledger, keyed by (user, place_id).
 *
 * The same restaurant surfaces from "cafe Pune", "coffee Koregaon Park", and a
 * neighbouring tile. That's one lead, not three. Merging also enriches: an
 * early cheap search may have no phone, a later one does — keep the better
 * value rather than the newer one.
 *
 * Storing place_id indefinitely is the one thing Google's terms explicitly
 * allow; the content fields alongside it are refreshed on every sighting.
 */
import { Lead } from '../db/models.js'
import type { Business } from './google.js'
import { leadScore } from './filters.js'

export interface EnrichedBusiness extends Business {
  timesSeen: number
  foundVia: string[]
  saved: boolean
  notes?: string
}

/** Fields where a real value must never be overwritten by a null. */
const ENRICHABLE = [
  'name',
  'address',
  'phone',
  'internationalPhone',
  'website',
  'rating',
  'primaryType',
  'mapsUrl',
  'priceLevel',
  'status',
  'lat',
  'lng',
] as const

/**
 * One bulk upsert for the whole batch. A 40-tile search can return 800 places;
 * that must be one round trip, not 800.
 */
export async function mergeAll(
  userId: string,
  businesses: Business[],
  via: string,
): Promise<EnrichedBusiness[]> {
  if (!businesses.length) return []

  const ops = businesses.map((b) => {
    const set: Record<string, unknown> = { types: b.types, openNow: b.openNow }
    for (const f of ENRICHABLE) {
      const v = b[f]
      if (v != null && v !== '') set[f] = v
    }
    if (b.openingHours?.length) set.openingHours = b.openingHours

    return {
      updateOne: {
        filter: { user: userId, placeId: b.placeId },
        update: {
          $set: { ...set, leadScore: leadScore(b) },
          // Review counts only ever grow; never let a stale page walk them back.
          $max: { reviews: b.reviews },
          $inc: { timesSeen: 1 },
          $addToSet: { foundVia: via },
          $setOnInsert: { user: userId, placeId: b.placeId },
        },
        upsert: true,
      },
    }
  })

  // Mongoose's bulkWrite generic can't see that the string ids and the dynamic
  // $set are cast at runtime. The shape is exercised by db.test.ts.
  await Lead.bulkWrite(ops as never, { ordered: false })

  // Read back the merged state so the response reflects enrichment from
  // earlier searches, not just what Google returned this time.
  const ids = businesses.map((b) => b.placeId)
  const docs = await Lead.find({ user: userId, placeId: { $in: ids } }).lean()

  return docs.map((d) => ({
    placeId: d.placeId,
    name: d.name ?? '(unnamed)',
    address: d.address ?? null,
    phone: d.phone ?? null,
    internationalPhone: d.internationalPhone ?? null,
    website: d.website ?? null,
    rating: d.rating ?? null,
    reviews: d.reviews ?? 0,
    types: d.types ?? [],
    primaryType: d.primaryType ?? null,
    openingHours: d.openingHours?.length ? d.openingHours : null,
    openNow: d.openNow ?? null,
    lat: d.lat ?? null,
    lng: d.lng ?? null,
    mapsUrl: d.mapsUrl ?? null,
    priceLevel: d.priceLevel ?? null,
    status: d.status ?? null,
    timesSeen: d.timesSeen ?? 1,
    foundVia: d.foundVia ?? [],
    saved: d.saved ?? false,
    notes: d.notes ?? undefined,
  }))
}

export async function ledgerStats(userId: string) {
  const [uniqueLeads, savedLeads] = await Promise.all([
    Lead.countDocuments({ user: userId }),
    Lead.countDocuments({ user: userId, saved: true }),
  ])
  return { uniqueLeads, savedLeads }
}
