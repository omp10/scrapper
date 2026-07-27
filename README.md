# Local Lead Finder

Finds local businesses via the Google Places API (New, v1), scores them as sales leads, and exports them.

## Run

Once:

```bash
npm install && npm run install:all
```

Then, from the repo root — this starts the API and the web app together, because
running only one of them produces `ECONNREFUSED` on every request:

```bash
npm run dev
```

Open http://localhost:5173. API docs at http://localhost:4000/docs.

Other root scripts: `npm test`, `npm run typecheck`, `npm run build`,
and `npm run set-role -- someone@example.com admin`.

The client proxies `/api` to the server, so there's no CORS setup and no API base URL in the frontend code.

### Configuration

`server/.env` is the only place a secret lives:

| Variable | Required | Notes |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | yes | Server-side only. Never sent to the browser. |
| `MONGODB_URI` | no | Falls back to an in-process MongoDB (ephemeral) when unset. `MONGO_URI` also accepted. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | in production | Boot fails if the dev defaults reach production. |
| `ADMIN_EMAIL` | no | This email becomes an admin when it registers. |
| `REDIS_URL` | no | Falls back to an in-process cache. |

## Tests

```bash
cd server && npm test
```

27 tests. The unit suite covers cost estimation, tiling and lead scoring; the integration suite runs against a real MongoDB and covers dedupe, enrichment, cross-user isolation, and whether the quota can be raced past its limit.

## What it does

**Cost meter.** Every search is priced before it runs. The Places API (New) bills by the most expensive field in your field mask, so `src/lib/fields.ts` maps each field to its billing tier — the price shown and the request sent read from the same table and cannot drift. Toggling contact fields off drops you to a cheaper tier, visibly. Geocoding is billed as its own SKU ($5/1000), not at the Places rate.

**Tiled search.** Google caps any single search at 60 results, so a 50 km radius over a city silently hides thousands of businesses. `tileRadiusKm` covers the area with overlapping circles, each with its own 60-result budget. Verified: a 4 km radius in 2 km tiles returned **102 unique businesses** where a single search returned 20. Cost scales linearly with tile count, which is why the meter shows the tile count too.

**Cross-search dedupe.** `place_id` is the primary key, enforced by a unique index on `(user, placeId)`. The same business found by three queries is one lead, and merging enriches — a phone number from a later search fills an earlier gap, and review counts never move backwards.

**Lead scoring.** Results rank by opportunity, not Google's order. A well-reviewed business with no website scores highest: it has money and a gap. That's the list you actually sell into.

**Quota.** Per-user daily caps on both searches and billable calls, held in Mongo as an atomic `findOneAndUpdate` so concurrent requests can't race past the limit. A rejected request hands its reservation back.

**Auth.** Access token in memory, refresh token in an httpOnly cookie — an XSS bug can't walk off with a long-lived credential. Expired access tokens refresh silently mid-session.

**Exports.** CSV and XLSX stream to the socket with backpressure handling rather than buffering the file. Every export is logged.

**Map.** Leaflet + OpenStreetMap, deliberately **not** the Google Maps JS SDK — that bills ~$7 per 1000 map loads while fetching no business data. All business data still comes from the Places API server-side; only the renderer changed. The browser holds no API key at all.

## Not built

- **Redis / BullMQ background jobs.** Large tiled searches run inline and hold the HTTP request open for their duration. The cache falls back to in-process, which works but is per-process and lost on restart.
- **Docker.** No Dockerfile or compose file.

## Before this goes to production

1. **Rotate the Google API key and the MongoDB password** — both were pasted into a chat transcript. Restrict the key to the Places and Geocoding APIs and set a billing budget alert.
2. **Set real JWT secrets.** `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. The server refuses to boot in production with the dev defaults.
3. **Lock down Atlas network access** to your server's IP rather than `0.0.0.0/0`.
4. **Check the Google Maps Platform terms against your use case.** Caching Places content beyond 30 days is prohibited and only `place_id` may be stored indefinitely — which is why the ledger is keyed on it and `CACHE_TTL_SECONDS` defaults to 30 days. Bulk-exporting Places data for lead generation is a policy risk for a commercial product. The provider layer is isolated in `src/lib/google.ts` so the data source can be swapped (Foursquare, OSM/Overpass, Yelp) without touching the rest of the app.

## Layout

```
server/src
  config.ts        env validation + Google price table
  db/              mongoose models, connection
  lib/             google, fields (pricing), tiles, filters, leads, quota, auth, cache, log
  routes/          auth, search, leads, export, dashboard, admin
  docs/openapi.ts  OpenAPI spec served at /docs
client/src
  api.ts           typed client + silent token refresh
  store.ts         Zustand: UI state and session only
  components/      SearchForm, CostMeter, FiltersPanel, ResultsList, MapView,
                   HistoryPanel, DashboardView, SavedLeadsView, AdminView, AuthScreen
```
