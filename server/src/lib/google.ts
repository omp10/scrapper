import axios from 'axios'
import axiosRetry from 'axios-retry'
import env from '../config.js'
import { cacheGet, cacheSet } from './cache.js'
import { toFieldMask, type FieldName } from './fields.js'
import { tileCircle } from './tiles.js'
import { recordCall } from './usage.js'

const http = axios.create({ timeout: 15_000 })

// Retry transient failures and Google's rate limiter. Anything 4xx other than
// 429 is our bug, not a blip — don't retry those.
axiosRetry(http, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (err) =>
    axiosRetry.isNetworkOrIdempotentRequestError(err) || err.response?.status === 429,
})

const PLACES = 'https://places.googleapis.com/v1'

export interface Business {
  placeId: string
  name: string
  address: string | null
  phone: string | null
  internationalPhone: string | null
  website: string | null
  rating: number | null
  reviews: number
  types: string[]
  primaryType: string | null
  openingHours: string[] | null
  openNow: boolean | null
  lat: number | null
  lng: number | null
  mapsUrl: string | null
  priceLevel: string | null
  status: string | null
}

/** Google's raw shape is deep and optional-heavy; flatten it once, here. */
function normalize(p: any): Business {
  return {
    placeId: p.id,
    name: p.displayName?.text ?? '(unnamed)',
    address: p.formattedAddress ?? null,
    phone: p.nationalPhoneNumber ?? null,
    internationalPhone: p.internationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    rating: p.rating ?? null,
    reviews: p.userRatingCount ?? 0,
    types: p.types ?? [],
    primaryType: p.primaryTypeDisplayName?.text ?? null,
    openingHours: p.regularOpeningHours?.weekdayDescriptions ?? null,
    openNow: p.regularOpeningHours?.openNow ?? null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    mapsUrl: p.googleMapsUri ?? null,
    priceLevel: p.priceLevel ?? null,
    status: p.businessStatus ?? null,
  }
}

export async function geocode(
  address: string,
  apiKey?: string,
): Promise<{ lat: number; lng: number; formatted: string }> {
  const key = `geo:${address.toLowerCase().trim()}`
  const cached = await cacheGet<{ lat: number; lng: number; formatted: string }>(key)
  if (cached) return cached

  const { data } = await http.get('https://maps.googleapis.com/maps/api/geocode/json', {
    params: { address, key: apiKey ?? env.GOOGLE_MAPS_API_KEY },
  })
  recordCall('geocoding')

  if (data.status !== 'OK' || !data.results?.length) {
    throw new HttpError(400, `Could not geocode "${address}" (${data.status})`)
  }
  const top = data.results[0]
  const result = {
    lat: top.geometry.location.lat,
    lng: top.geometry.location.lng,
    formatted: top.formatted_address,
  }
  await cacheSet(key, result)
  return result
}

export interface SearchParams {
  keyword?: string
  category?: string
  lat: number
  lng: number
  radiusMeters: number
  minRating?: number
  openNow?: boolean
  maxResults: number
  fields: FieldName[]
  /** Split the area into tiles of this radius to break the 60-result cap. */
  tileRadiusKm?: number
  /** Per-user key set by an admin. Falls back to the server key. */
  apiKey?: string
}

/**
 * Text Search when there's a keyword to match, Nearby Search otherwise.
 * Nearby returns one page of up to 20; Text Search paginates in 20s to 60.
 */
async function searchOneTile(p: SearchParams) {
  const cacheKey = `search:${JSON.stringify(p)}`
  const cached = await cacheGet<{ businesses: Business[] }>(cacheKey)
  if (cached) return { ...cached, cached: true, billableCalls: 0 }

  const businesses: Business[] = []
  const seen = new Set<string>()
  let billableCalls = 0

  const useText = Boolean(p.keyword?.trim())
  let pageToken: string | undefined

  const headers = {
    'X-Goog-Api-Key': p.apiKey ?? env.GOOGLE_MAPS_API_KEY,
    // Only Text Search paginates; Nearby rejects the token field outright.
    'X-Goog-FieldMask': toFieldMask(p.fields, useText),
    'Content-Type': 'application/json',
  }

  do {
    const url = useText ? `${PLACES}/places:searchText` : `${PLACES}/places:searchNearby`
    const body: Record<string, unknown> = useText
      ? {
          textQuery: [p.keyword, p.category].filter(Boolean).join(' '),
          pageSize: Math.min(20, p.maxResults - businesses.length),
          pageToken,
          locationBias: circle(p),
          ...(p.minRating ? { minRating: p.minRating } : {}),
          ...(p.openNow ? { openNow: true } : {}),
        }
      : {
          includedTypes: p.category ? [p.category] : undefined,
          maxResultCount: Math.min(20, p.maxResults),
          locationRestriction: circle(p),
          rankPreference: 'POPULARITY',
        }

    const { data } = await http.post(url, body, { headers }).catch(rethrowGoogle)
    billableCalls++
    recordCall('search')

    for (const raw of data.places ?? []) {
      // Same business can surface on more than one page; place_id is the key.
      if (seen.has(raw.id)) continue
      seen.add(raw.id)
      businesses.push(normalize(raw))
    }

    pageToken = useText ? data.nextPageToken : undefined
  } while (pageToken && businesses.length < p.maxResults)

  const result = { businesses: businesses.slice(0, p.maxResults) }
  await cacheSet(cacheKey, result)
  return { ...result, cached: false, billableCalls }
}

/**
 * Public entry point. Tiles the area when asked, runs the tiles with bounded
 * concurrency, and merge-dedupes by place_id — the same business found in two
 * overlapping tiles is one lead.
 */
export async function searchPlaces(p: SearchParams) {
  const tiles = p.tileRadiusKm
    ? tileCircle(p.lat, p.lng, p.radiusMeters / 1000, p.tileRadiusKm)
    : [{ lat: p.lat, lng: p.lng, radiusMeters: p.radiusMeters }]

  const results = await pool(tiles, 5, (t) =>
    searchOneTile({ ...p, lat: t.lat, lng: t.lng, radiusMeters: t.radiusMeters, tileRadiusKm: undefined }),
  )

  const byId = new Map<string, Business>()
  let billableCalls = 0
  let cachedTiles = 0

  for (const r of results) {
    billableCalls += r.billableCalls
    if (r.cached) cachedTiles++
    for (const b of r.businesses) if (!byId.has(b.placeId)) byId.set(b.placeId, b)
  }

  return {
    businesses: [...byId.values()],
    cached: cachedTiles === tiles.length,
    billableCalls,
    tiles: tiles.length,
  }
}

/** Bounded-concurrency map. Google rate-limits; firing 40 tiles at once 429s. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      out[i] = await fn(items[i]!)
    }
  })
  await Promise.all(workers)
  return out
}

function circle(p: SearchParams) {
  return {
    circle: {
      center: { latitude: p.lat, longitude: p.lng },
      radius: Math.min(50_000, Math.max(1, p.radiusMeters)),
    },
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** Surface Google's own error text instead of a bare 500. */
function rethrowGoogle(err: any): never {
  const g = err.response?.data?.error
  if (g) throw new HttpError(err.response.status ?? 502, `Google Places: ${g.message}`)
  throw new HttpError(502, err.message ?? 'Places request failed')
}
