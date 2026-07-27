import { PRICING } from '../config.js'

/**
 * Places API (New) field-mask tiers. Google bills a search by the most
 * expensive field you ask for, so the field mask IS the price. Keeping the
 * tier table here means the cost meter and the actual request can never drift
 * apart — they read the same source.
 */

export type Tier = 'essentials' | 'pro' | 'enterprise' | 'enterprisePlus'

const TIER_ORDER: Tier[] = ['essentials', 'pro', 'enterprise', 'enterprisePlus']

/** field name (without the `places.` prefix) -> billing tier */
export const FIELD_TIERS = {
  id: 'essentials',
  displayName: 'pro',
  formattedAddress: 'pro',
  location: 'pro',
  types: 'pro',
  primaryTypeDisplayName: 'pro',
  businessStatus: 'pro',
  googleMapsUri: 'pro',
  rating: 'enterprise',
  userRatingCount: 'enterprise',
  priceLevel: 'enterprise',
  regularOpeningHours: 'enterprise',
  nationalPhoneNumber: 'enterprise',
  internationalPhoneNumber: 'enterprise',
  websiteUri: 'enterprise',
} as const satisfies Record<string, Tier>

export type FieldName = keyof typeof FIELD_TIERS

/** Everything the UI displays. The default ask. */
export const ALL_FIELDS = Object.keys(FIELD_TIERS) as FieldName[]

/** Cheapest set that still identifies a business on a map. */
export const BASIC_FIELDS: FieldName[] = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'types',
  'businessStatus',
  'googleMapsUri',
]

export function tierFor(fields: FieldName[]): Tier {
  let highest = 0
  for (const f of fields) {
    highest = Math.max(highest, TIER_ORDER.indexOf(FIELD_TIERS[f]))
  }
  return TIER_ORDER[highest] ?? 'essentials'
}

/** USD per 1000 requests for this field selection. */
export function ratePer1000(fields: FieldName[]): number {
  return PRICING.search[tierFor(fields)]
}

/**
 * Nearby Search has no pagination, and asking it for `nextPageToken` is a hard
 * 400 — the mask must differ per endpoint.
 */
export function toFieldMask(fields: FieldName[], paginated = false): string {
  const mask = fields.map((f) => `places.${f}`)
  if (paginated) mask.push('nextPageToken')
  return mask.join(',')
}

/**
 * What a search will cost before it runs.
 * Google returns up to 20 places per request and paginates in 20s, so the
 * number of billable calls is driven by how many results you asked for.
 */
export function estimateCost(opts: {
  fields: FieldName[]
  maxResults: number
  needsGeocoding: boolean
  /** Tiles multiply everything — each one is a full paginated search. */
  tiles?: number
}) {
  const tiles = Math.max(1, opts.tiles ?? 1)
  const pagesPerTile = Math.max(1, Math.ceil(opts.maxResults / 20))
  const calls = tiles * pagesPerTile
  const rate = ratePer1000(opts.fields)
  const searchCost = (calls * rate) / 1000
  const geocodeCost = opts.needsGeocoding ? PRICING.geocoding / 1000 : 0
  // Tiles overlap, so unique results are always fewer than the raw ceiling.
  const expectedLeads = Math.max(1, Math.round(tiles * opts.maxResults * (tiles > 1 ? 0.6 : 1)))
  return {
    tier: tierFor(opts.fields),
    ratePer1000: rate,
    tiles,
    billableCalls: calls + (opts.needsGeocoding ? 1 : 0),
    maxResultCeiling: tiles * opts.maxResults,
    searchCost: round(searchCost),
    geocodeCost: round(geocodeCost),
    // Upper bound: assumes zero cache hits. Actual spend is usually lower.
    totalCost: round(searchCost + geocodeCost),
    costPerLead: round((searchCost + geocodeCost) / expectedLeads, 6),
  }
}

function round(n: number, dp = 4) {
  return Number(n.toFixed(dp))
}
