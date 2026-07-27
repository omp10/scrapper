import { Router } from 'express'
import { z } from 'zod'
import { geocode, searchPlaces, HttpError } from '../lib/google.js'
import { ALL_FIELDS, BASIC_FIELDS, estimateCost, type FieldName } from '../lib/fields.js'
import { applyFilters, FilterSchema } from '../lib/filters.js'
import { getUsage } from '../lib/usage.js'
import { tileCount } from '../lib/tiles.js'
import { mergeAll, ledgerStats } from '../lib/leads.js'
import { enforceQuota, recordSpend, quotaStatus } from '../lib/quota.js'
import { requireAuth } from '../lib/auth.js'
import { Search, User } from '../db/models.js'
import { PRICING } from '../config.js'
import { osmGeocode, osmSearchTiled } from '../lib/osm.js'

/** OpenStreetMap costs nothing. Shaped like a cost so the UI needs no branch. */
const FREE_COST = {
  tier: 'openstreetmap',
  ratePer1000: 0,
  tiles: 1,
  maxResultCeiling: 0,
  billableCalls: 0,
  searchCost: 0,
  geocodeCost: 0,
  totalCost: 0,
  costPerLead: 0,
} as const

export const searchRouter = Router()

// Everything below costs money and belongs to a user. No anonymous access.
searchRouter.use(requireAuth)

const BaseSchema = z
  .object({
    /**
     * 'osm' is free (OpenStreetMap: no key, no billing, no ratings).
     * 'google' costs money and adds ratings, review counts and open-now.
     */
    provider: z.enum(['osm', 'google']).default('osm'),
    keyword: z.string().trim().optional(),
    category: z.string().trim().optional(),
    city: z.string().trim().optional(),
    state: z.string().trim().optional(),
    country: z.string().trim().optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().min(1).max(50).default(5),
    /**
     * Google hard-caps a search at 60 (3 pages of 20) and bills per page.
     * OpenStreetMap has no such cap and costs nothing, so there's no reason to
     * truncate it — the per-provider ceiling is enforced below.
     */
    maxResults: z.coerce.number().min(1).max(1000).default(20),
    /**
     * Tile the area to break Google's 60-result ceiling. Smaller tiles = deeper
     * coverage and a linearly larger bill, so it's off unless asked for.
     */
    tileRadiusKm: z.coerce.number().min(0.5).max(50).optional(),
    /** Drop contact fields to fall to a cheaper billing tier. */
    // Not z.coerce.boolean() — that turns the string "false" into true.
    contactFields: z.boolean().default(true),
    filters: FilterSchema.default({}),
  })
  .superRefine((v, ctx) => {
    if (v.provider === 'google' && v.maxResults > 60) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxResults'],
        message: 'Google returns at most 60 results per search. Use tiling, or the OSM provider.',
      })
    }
  })
/**
 * Running a search needs somewhere to search. Pricing one does not — the cost
 * meter must render on an empty form, before the user has typed anything.
 */
const SearchSchema = BaseSchema.refine(
  (v) => (v.lat != null && v.lng != null) || v.city || v.state || v.country,
  'Provide lat/lng, or at least one of city / state / country',
)

type SearchInput = z.infer<typeof BaseSchema>

function fieldsFor(input: SearchInput): FieldName[] {
  return input.contactFields ? ALL_FIELDS : BASIC_FIELDS
}

/**
 * lat/lng wins when given; otherwise geocode the place name.
 * OSM searches geocode via Nominatim so the whole request stays free.
 */
async function resolveLocation(input: SearchInput, apiKey?: string) {
  if (input.lat != null && input.lng != null) {
    return { lat: input.lat, lng: input.lng, label: `${input.lat}, ${input.lng}`, geocoded: false }
  }
  const address = [input.city, input.state, input.country].filter(Boolean).join(', ')
  const g = input.provider === 'osm' ? await osmGeocode(address) : await geocode(address, apiKey)
  return { lat: g.lat, lng: g.lng, label: g.formatted, geocoded: true }
}

/** An admin can give a user their own key; otherwise the server key is used. */
async function apiKeyFor(userId: string): Promise<string | undefined> {
  const user = await User.findById(userId).select('+googleApiKey').lean()
  return user?.googleApiKey ?? undefined
}

/**
 * Price a search *before* running it. The UI calls this on every form change,
 * so it must never hit Google — the geocode flag is inferred, not resolved.
 */
searchRouter.post('/estimate', async (req, res) => {
  const input = BaseSchema.parse(req.body)
  const tiles = input.tileRadiusKm ? tileCount(input.radiusKm, input.tileRadiusKm) : 1

  if (input.provider === 'osm') {
    return res.json({
      ...FREE_COST,
      tiles,
      maxResultCeiling: tiles * input.maxResults,
      quota: await quotaStatus(req),
      note: 'OpenStreetMap is free — no API key, no billing, no quota. No ratings or review counts.',
    })
  }

  res.json({
    ...estimateCost({
      fields: fieldsFor(input),
      maxResults: input.maxResults,
      needsGeocoding: input.lat == null || input.lng == null,
      tiles,
    }),
    quota: await quotaStatus(req),
    note: 'Upper bound, assumes no cache hits. Cached searches cost $0.',
  })
})

searchRouter.post('/', enforceQuota, async (req, res) => {
  const input = SearchSchema.parse(req.body)
  const apiKey = await apiKeyFor(req.user!.id)
  const location = await resolveLocation(input, apiKey)

  const isFree = input.provider === 'osm'

  const { businesses, cached, billableCalls, tiles } = isFree
    ? await osmSearchTiled({
        keyword: input.keyword,
        category: input.category,
        lat: location.lat,
        lng: location.lng,
        radiusMeters: input.radiusKm * 1000,
        maxResults: input.maxResults,
        tileRadiusKm: input.tileRadiusKm,
      })
    : await searchPlaces({
        apiKey,
        keyword: input.keyword,
        category: input.category,
        lat: location.lat,
        lng: location.lng,
        radiusMeters: input.radiusKm * 1000,
        minRating: input.filters.minRating,
        openNow: input.filters.openNow,
        maxResults: input.maxResults,
        fields: fieldsFor(input),
        tileRadiusKm: input.tileRadiusKm,
      })

  const userId = req.user!.id
  const geocodeCalls = !isFree && location.geocoded && !cached ? 1 : 0
  const actualCalls = billableCalls + geocodeCalls

  const cost = isFree
    ? { ...FREE_COST, tiles, maxResultCeiling: tiles * input.maxResults, actualBillableCalls: 0 }
    : {
        ...estimateCost({
          fields: fieldsFor(input),
          maxResults: input.maxResults,
          needsGeocoding: location.geocoded,
          tiles,
        }),
        actualBillableCalls: actualCalls,
      }

  // Charge what was actually spent, not the up-front estimate. Geocoding is a
  // different SKU ($5/1000) — billing it at the Places rate overstates the cost.
  const actualCost = isFree
    ? 0
    : (billableCalls * cost.ratePer1000 + geocodeCalls * PRICING.geocoding) / 1000

  await recordSpend(userId, actualCalls, actualCost)

  // Fold into the cross-search ledger before filtering, so a lead found by an
  // earlier search keeps its phone number even if this search didn't return one.
  const via = [input.keyword, input.category, location.label].filter(Boolean).join(' | ')
  const enriched = await mergeAll(userId, businesses, via)

  const filtered = applyFilters(enriched, input.filters, location)

  const label = [input.keyword, input.category, location.label].filter(Boolean).join(' · ')
  const record = await Search.create({
    user: userId,
    label,
    input,
    location,
    total: filtered.length,
    tiles,
    billableCalls: actualCalls,
    costUsd: Number(actualCost.toFixed(4)),
    cached,
  })

  res.json({
    searchId: record._id,
    location,
    total: filtered.length,
    totalBeforeFilters: businesses.length,
    cached,
    tiles,
    cost: { ...cost, actualCostUsd: Number(actualCost.toFixed(4)) },
    quota: await quotaStatus(req),
    businesses: filtered,
  })
})

searchRouter.get('/usage', async (req, res) =>
  res.json({ ...getUsage(), ...(await ledgerStats(req.user!.id)), quota: await quotaStatus(req) }),
)

/** Search history, newest first. Saved searches are pinned above the rest. */
searchRouter.get('/history', async (req, res) => {
  const limit = Math.min(100, Number(req.query.limit) || 25)
  const [saved, recent] = await Promise.all([
    Search.find({ user: req.user!.id, saved: true }).sort({ createdAt: -1 }).limit(50).lean(),
    Search.find({ user: req.user!.id, saved: false }).sort({ createdAt: -1 }).limit(limit).lean(),
  ])
  res.json({ saved, recent })
})

searchRouter.patch('/history/:id', async (req, res) => {
  const updated = await Search.findOneAndUpdate(
    { _id: req.params.id, user: req.user!.id },
    { $set: { saved: Boolean(req.body?.saved) } },
    { new: true },
  ).lean()
  if (!updated) throw new HttpError(404, 'Search not found')
  res.json(updated)
})

searchRouter.delete('/history/:id', async (req, res) => {
  const result = await Search.deleteOne({ _id: req.params.id, user: req.user!.id })
  if (!result.deletedCount) throw new HttpError(404, 'Search not found')
  res.json({ ok: true })
})

export { HttpError }
