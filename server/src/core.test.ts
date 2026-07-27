import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimateCost, tierFor, toFieldMask, ALL_FIELDS, BASIC_FIELDS } from './lib/fields.ts'
import { applyFilters, haversine, leadScore } from './lib/filters.ts'
import { tileCircle, tileCount } from './lib/tiles.ts'
import type { Business } from './lib/google.ts'

const biz = (o: Partial<Business>): Business => ({
  placeId: 'x',
  name: 'X',
  address: null,
  phone: null,
  internationalPhone: null,
  website: null,
  rating: null,
  reviews: 0,
  types: [],
  primaryType: null,
  openingHours: null,
  openNow: null,
  lat: null,
  lng: null,
  mapsUrl: null,
  priceLevel: null,
  status: null,
  ...o,
})

test('billing tier follows the most expensive field in the mask', () => {
  assert.equal(tierFor(BASIC_FIELDS), 'pro')
  assert.equal(tierFor(ALL_FIELDS), 'enterprise')
  assert.equal(tierFor(['id']), 'essentials')
})

test('field mask asks Google for exactly what we priced', () => {
  // Nearby Search 400s if the mask mentions nextPageToken.
  assert.equal(toFieldMask(['id', 'websiteUri']), 'places.id,places.websiteUri')
  assert.equal(toFieldMask(['id'], true), 'places.id,nextPageToken')
})

test('cost scales with pages, not with results', () => {
  const twenty = estimateCost({ fields: ALL_FIELDS, maxResults: 20, needsGeocoding: false })
  const sixty = estimateCost({ fields: ALL_FIELDS, maxResults: 60, needsGeocoding: false })
  assert.equal(twenty.billableCalls, 1)
  assert.equal(sixty.billableCalls, 3)
  assert.ok(Math.abs(sixty.totalCost - twenty.totalCost * 3) < 1e-9)
  // Pages scale linearly with results, so cost per lead is flat when
  // maxResults fills whole pages — asking for 60 is no cheaper per lead.
  assert.equal(sixty.costPerLead, twenty.costPerLead)
  // A partial page is pure waste: 21 results bills the same as 40.
  const twentyOne = estimateCost({ fields: ALL_FIELDS, maxResults: 21, needsGeocoding: false })
  assert.equal(twentyOne.billableCalls, 2)
  assert.ok(twentyOne.costPerLead > twenty.costPerLead)
})

test('geocoding adds exactly one billable call', () => {
  const withGeo = estimateCost({ fields: ALL_FIELDS, maxResults: 20, needsGeocoding: true })
  const without = estimateCost({ fields: ALL_FIELDS, maxResults: 20, needsGeocoding: false })
  assert.equal(withGeo.billableCalls - without.billableCalls, 1)
  assert.ok(withGeo.totalCost > without.totalCost)
})

test('dropping contact fields drops the bill', () => {
  const full = estimateCost({ fields: ALL_FIELDS, maxResults: 20, needsGeocoding: false })
  const basic = estimateCost({ fields: BASIC_FIELDS, maxResults: 20, needsGeocoding: false })
  assert.ok(basic.totalCost < full.totalCost)
})

test('hasWebsite:false keeps only businesses without one', () => {
  const rows = applyFilters(
    [biz({ placeId: 'a', website: 'http://a.com' }), biz({ placeId: 'b' })],
    { hasWebsite: false },
    { lat: 0, lng: 0 },
  )
  assert.deepEqual(rows.map((r) => r.placeId), ['b'])
})

test('distance filter keeps rows that have no coordinates', () => {
  const rows = applyFilters(
    [biz({ placeId: 'near', lat: 0, lng: 0 }), biz({ placeId: 'nocoords' })],
    { maxDistanceKm: 1 },
    { lat: 0, lng: 0 },
  )
  assert.equal(rows.length, 2)
})

test('distance filter drops what is genuinely far', () => {
  const rows = applyFilters(
    [biz({ placeId: 'far', lat: 10, lng: 10 })],
    { maxDistanceKm: 5 },
    { lat: 0, lng: 0 },
  )
  assert.equal(rows.length, 0)
})

test('haversine matches a known distance', () => {
  // London -> Paris is ~343 km.
  const d = haversine({ lat: 51.5074, lng: -0.1278 }, { lat: 48.8566, lng: 2.3522 })
  assert.ok(Math.abs(d - 343) < 5, `got ${d}`)
})

test('best lead is well-reviewed with no website', () => {
  const gap = leadScore(biz({ website: null, rating: 4.6, reviews: 250, phone: '1', status: 'OPERATIONAL' }))
  const saturated = leadScore(biz({ website: 'http://x.com', rating: 4.6, reviews: 250, phone: '1', status: 'OPERATIONAL' }))
  assert.ok(gap > saturated)
})

test('one tile when it already covers the request', () => {
  assert.equal(tileCircle(18.5, 73.8, 5, 5).length, 1)
  assert.equal(tileCircle(18.5, 73.8, 5, 10).length, 1)
})

test('tiling a city produces many tiles and raises the result ceiling', () => {
  const tiles = tileCircle(18.5, 73.8, 25, 3)
  assert.ok(tiles.length > 20, `expected many tiles, got ${tiles.length}`)
  // Every tile centre must actually sit near the requested area.
  for (const t of tiles) {
    assert.ok(haversine({ lat: 18.5, lng: 73.8 }, t) <= 25 + 3)
  }
})

test('smaller tiles mean more coverage and a bigger bill', () => {
  const coarse = estimateCost({ fields: ALL_FIELDS, maxResults: 20, needsGeocoding: false, tiles: tileCount(20, 10) })
  const fine = estimateCost({ fields: ALL_FIELDS, maxResults: 20, needsGeocoding: false, tiles: tileCount(20, 2) })
  assert.ok(fine.tiles > coarse.tiles)
  assert.ok(fine.totalCost > coarse.totalCost)
  assert.ok(fine.maxResultCeiling > 60, 'tiling must break the 60-result cap')
})

// Ledger dedupe/enrichment now runs in Mongo — covered by db.test.ts.

test('results come back ranked by lead score', () => {
  const rows = applyFilters(
    [biz({ placeId: 'weak', website: 'http://x.com' }), biz({ placeId: 'strong', reviews: 300, rating: 5 })],
    {},
    { lat: 0, lng: 0 },
  )
  assert.equal(rows[0]!.placeId, 'strong')
})
