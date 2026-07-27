import axios from 'axios'
import axiosRetry from 'axios-retry'
import { cacheGet, cacheSet } from './cache.js'
import { HttpError, type Business } from './google.js'
import { log } from './log.js'

/**
 * OpenStreetMap provider — Overpass for search, Nominatim for geocoding.
 *
 * Free, no API key, no billing. This is the honest free alternative to the
 * Places API: the data is openly licensed and querying it is explicitly
 * allowed, unlike scraping the Google Maps website (which is what the "free"
 * browser extensions do, and which violates Google's terms).
 *
 * What you get: name, address, phone, website, opening hours, category.
 * What you don't: ratings and review counts — OSM has no such concept.
 * For lead-gen that matters less than it sounds, because the strongest signal
 * ("business with a phone but no website") is fully available here.
 *
 * Both endpoints are donated infrastructure. We identify ourselves, cache
 * aggressively, and keep concurrency at 1 — abusing them gets everyone blocked.
 */

const UA = 'LocalLeadFinder/1.0 (self-hosted lead research tool)'

const http = axios.create({
  timeout: 60_000, // Overpass is slow under load; it is not a CDN
  headers: { 'User-Agent': UA },
})

axiosRetry(http, {
  retries: 2,
  // Overpass returns 429/504 when busy. Back off hard rather than hammering.
  retryDelay: (count) => count * 3000,
  retryCondition: (err) =>
    axiosRetry.isNetworkOrIdempotentRequestError(err) ||
    [429, 502, 503, 504].includes(err.response?.status ?? 0),
})

const OVERPASS = 'https://overpass-api.de/api/interpreter'
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'

/**
 * Our category names -> OSM tag filters. OSM has no single "type" field, so
 * each category maps to one or more key=value tag pairs.
 */
const CATEGORY_TAGS: Record<string, string[]> = {
  restaurant: ['amenity=restaurant'],
  cafe: ['amenity=cafe'],
  bakery: ['shop=bakery'],
  bar: ['amenity=bar', 'amenity=pub'],
  hotel: ['tourism=hotel', 'tourism=guest_house'],
  gym: ['leisure=fitness_centre'],
  hospital: ['amenity=hospital', 'amenity=clinic'],
  pharmacy: ['amenity=pharmacy'],
  beauty_salon: ['shop=beauty'],
  hair_care: ['shop=hairdresser'],
  dentist: ['amenity=dentist'],
  car_repair: ['shop=car_repair'],
  real_estate_agency: ['office=estate_agent'],
  lawyer: ['office=lawyer'],
  accounting: ['office=accountant'],
  plumber: ['craft=plumber'],
  electrician: ['craft=electrician'],
  school: ['amenity=school'],
  store: ['shop'],
}

/** Everything a business could plausibly be, when no category is given. */
const ANY_BUSINESS_TAGS = ['shop', 'office', 'craft', 'amenity', 'tourism', 'leisure']

export interface OsmSearchParams {
  keyword?: string
  category?: string
  lat: number
  lng: number
  radiusMeters: number
  maxResults: number
}

/** Free-text geocoding via Nominatim. */
export async function osmGeocode(address: string) {
  const key = `osm:geo:${address.toLowerCase().trim()}`
  const cached = await cacheGet<{ lat: number; lng: number; formatted: string }>(key)
  if (cached) return cached

  const { data } = await http.get(NOMINATIM, {
    params: { q: address, format: 'json', limit: 1 },
  })

  if (!Array.isArray(data) || !data.length) {
    throw new HttpError(400, `Could not find "${address}" on OpenStreetMap`)
  }

  const top = data[0]
  const result = {
    lat: Number(top.lat),
    lng: Number(top.lon),
    formatted: top.display_name as string,
  }
  await cacheSet(key, result)
  return result
}

function buildQuery(p: OsmSearchParams): string {
  const around = `(around:${Math.round(p.radiusMeters)},${p.lat},${p.lng})`
  const tags = p.category ? (CATEGORY_TAGS[p.category] ?? [`amenity=${p.category}`]) : ANY_BUSINESS_TAGS

  // A keyword filters on the name tag, case-insensitively.
  const nameFilter = p.keyword?.trim() ? `["name"~"${escapeRegex(p.keyword.trim())}",i]` : ''

  const clauses = tags.flatMap((tag) => {
    const selector = tag.includes('=') ? `["${tag.split('=')[0]}"="${tag.split('=')[1]}"]` : `["${tag}"]`
    // Businesses are mapped as points (node) or building outlines (way).
    return [
      `node${selector}${nameFilter}${around};`,
      `way${selector}${nameFilter}${around};`,
    ]
  })

  // Only named things are businesses; unnamed nodes are noise.
  return `[out:json][timeout:60];(${clauses.join('')});out center tags ${p.maxResults * 3};`
}

function toBusiness(el: any): Business | null {
  const t = el.tags ?? {}
  if (!t.name) return null // unnamed = not a business we can sell to

  const lat = el.lat ?? el.center?.lat ?? null
  const lng = el.lon ?? el.center?.lon ?? null

  const address =
    [
      [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '),
      t['addr:suburb'],
      t['addr:city'],
      t['addr:postcode'],
      t['addr:state'],
    ]
      .filter(Boolean)
      .join(', ') || null

  const phone = t.phone ?? t['contact:phone'] ?? t['contact:mobile'] ?? null
  const website = t.website ?? t['contact:website'] ?? t['contact:facebook'] ?? null

  // The OSM type is whichever classifying tag is present.
  const type =
    t.shop ?? t.office ?? t.craft ?? t.amenity ?? t.tourism ?? t.leisure ?? t.cuisine ?? null

  return {
    // Stable across queries: element type + OSM id.
    placeId: `osm:${el.type}/${el.id}`,
    name: t.name,
    address,
    phone,
    internationalPhone: phone,
    website,
    // OSM genuinely has no ratings. Null is honest; zero would be a lie.
    rating: null,
    reviews: 0,
    types: [type, t.cuisine].filter(Boolean) as string[],
    primaryType: type ? String(type).replace(/_/g, ' ') : null,
    openingHours: t.opening_hours ? [t.opening_hours] : null,
    openNow: null, // would need parsing the opening_hours grammar
    lat,
    lng,
    mapsUrl: lat && lng ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : null,
    priceLevel: null,
    status: null,
  }
}

export async function osmSearch(p: OsmSearchParams) {
  const cacheKey = `osm:search:${JSON.stringify(p)}`
  const cached = await cacheGet<{ businesses: Business[] }>(cacheKey)
  if (cached) return { ...cached, cached: true, billableCalls: 0 }

  const query = buildQuery(p)
  log.debug({ query }, 'overpass query')

  let data: unknown
  try {
    const res = await http.post(OVERPASS, `data=${encodeURIComponent(query)}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    data = res.data
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status === 429 || status === 504) {
      throw new HttpError(503, 'OpenStreetMap is busy right now — try again in a moment, or use the Google provider.')
    }
    throw new HttpError(502, `OpenStreetMap request failed: ${(err as Error).message}`)
  }

  // When Overpass is rate-limited or overloaded it answers 200 with an HTML
  // error page, or JSON carrying a `remark` and no results. Both parse to
  // "zero businesses" — and caching that poisons every future identical search
  // with a permanent empty. Treat them as transient failures, never as data.
  if (typeof data === 'string') {
    throw new HttpError(503, 'OpenStreetMap is rate-limiting right now — wait a few seconds and retry, or use the Google provider.')
  }
  const body = data as { elements?: unknown[]; remark?: string }
  if (body.remark && /timed out|rate_limited|runtime error/i.test(body.remark)) {
    throw new HttpError(503, `OpenStreetMap couldn't complete that query (${body.remark.slice(0, 80)}). Try a smaller radius, or the Google provider.`)
  }
  if (!Array.isArray(body.elements)) {
    throw new HttpError(502, 'Unexpected response from OpenStreetMap — try again in a moment.')
  }

  const seen = new Set<string>()
  const businesses: Business[] = []
  for (const el of body.elements) {
    const b = toBusiness(el)
    if (!b || seen.has(b.placeId)) continue
    seen.add(b.placeId)
    businesses.push(b)
    if (businesses.length >= p.maxResults) break
  }

  const result = { businesses }
  // Only cache a real hit. Caching an empty result would pin a transient miss
  // in place until the TTL expires — the exact "cached · $0 with 0 leads" bug.
  if (businesses.length > 0) await cacheSet(cacheKey, result)
  // billableCalls is 0 because it is genuinely free — the cost meter reads this.
  return { ...result, cached: false, billableCalls: 0 }
}

/**
 * Tiled OSM search, mirroring the Google path so the rest of the app doesn't
 * care which provider ran.
 *
 * Tiles run sequentially, not in parallel: Overpass is donated infrastructure
 * and fans out to a 429 immediately under concurrent load. It's free, so the
 * only cost of going slow is time.
 */
export async function osmSearchTiled(
  p: OsmSearchParams & { tileRadiusKm?: number },
): Promise<{ businesses: Business[]; cached: boolean; billableCalls: number; tiles: number }> {
  const { tileCircle } = await import('./tiles.js')
  const tiles = p.tileRadiusKm
    ? tileCircle(p.lat, p.lng, p.radiusMeters / 1000, p.tileRadiusKm)
    : [{ lat: p.lat, lng: p.lng, radiusMeters: p.radiusMeters }]

  const byId = new Map<string, Business>()
  let cachedTiles = 0

  for (const t of tiles) {
    const r = await osmSearch({
      ...p,
      lat: t.lat,
      lng: t.lng,
      radiusMeters: t.radiusMeters,
    })
    if (r.cached) cachedTiles++
    for (const b of r.businesses) if (!byId.has(b.placeId)) byId.set(b.placeId, b)
  }

  return {
    businesses: [...byId.values()],
    cached: cachedTiles === tiles.length,
    billableCalls: 0, // free, always
    tiles: tiles.length,
  }
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\"]/g, '\\$&')
