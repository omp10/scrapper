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
  distanceKm: number | null
  leadScore: number
  timesSeen?: number
  foundVia?: string[]
  saved?: boolean
  notes?: string
}

export interface Quota {
  plan: string
  searchesUsed: number
  searchesLimit: number
  callsUsed: number
  callsLimit: number
  spentTodayUsd: number
  resetsAt: string
}

export interface Cost {
  tier: string
  ratePer1000: number
  tiles: number
  maxResultCeiling: number
  billableCalls: number
  searchCost: number
  geocodeCost: number
  totalCost: number
  costPerLead: number
  actualBillableCalls?: number
  actualCostUsd?: number
  note?: string
  quota?: Quota
}

export interface SearchResponse {
  searchId: string
  location: { lat: number; lng: number; label: string; geocoded: boolean }
  total: number
  totalBeforeFilters: number
  cached: boolean
  tiles: number
  cost: Cost
  quota: Quota
  businesses: Business[]
}

export interface Filters {
  minRating?: number
  minReviews?: number
  businessType?: string
  hasWebsite?: boolean
  hasPhone?: boolean
  openNow?: boolean
  maxDistanceKm?: number
}

export interface SearchInput {
  /** osm = free (OpenStreetMap). google = paid, adds ratings and review counts. */
  provider: 'osm' | 'google'
  keyword?: string
  category?: string
  city?: string
  state?: string
  country?: string
  lat?: number
  lng?: number
  radiusKm: number
  maxResults: number
  tileRadiusKm?: number
  contactFields: boolean
  filters: Filters
}

export interface User {
  _id: string
  id?: string
  email: string
  name?: string
  role: 'user' | 'admin'
  plan: string
  disabled?: boolean
  createdAt?: string
}

export interface SearchRecord {
  _id: string
  label: string
  input: SearchInput
  location: { lat: number; lng: number; label: string }
  total: number
  tiles: number
  costUsd: number
  saved: boolean
  createdAt: string
}

/* ---------------------------------------------------------------- transport */

/**
 * The access token is held in memory only. Putting it in localStorage would
 * make it readable by any injected script; the refresh token lives in an
 * httpOnly cookie the page can't touch, so a reload restores the session
 * without ever exposing a long-lived credential to JS.
 */
/**
 * Where the backend lives.
 *
 * Empty string = same origin, which is what the Vite dev proxy and a
 * single-domain production deploy both want. Set VITE_API_URL when the API is
 * on a different host (separate backend deploy, staging, a phone on the LAN).
 * Trailing slashes are stripped so `${API_URL}/api/x` can't become `//api/x`.
 */
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

const url = (path: string) => `${API_URL}${path}`

let accessToken: string | null = null
let onAuthLost: (() => void) | null = null

export const setAccessToken = (t: string | null) => {
  accessToken = t
}
export const onAuthLostSet = (fn: () => void) => {
  onAuthLost = fn
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues?: unknown,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}, retrying = false): Promise<T> {
  const res = await fetch(url(path), {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  })

  // Access tokens last 15 minutes. Refresh once, silently, then retry — the
  // user should never be logged out mid-search because of an expiry.
  if (res.status === 401 && !retrying && !path.startsWith('/api/auth/')) {
    const refreshed = await refresh().catch(() => null)
    if (refreshed) return request<T>(path, init, true)
    onAuthLost?.()
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new ApiError(res.status, body.error ?? 'Request failed', body.issues)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
const get = <T>(path: string) => request<T>(path)

/* --------------------------------------------------------------------- auth */

export interface Session {
  accessToken: string
  user: { id: string; email: string; role: 'user' | 'admin'; plan: string }
}

export async function register(email: string, password: string, name?: string) {
  const s = await post<Session>('/api/auth/register', { email, password, name })
  setAccessToken(s.accessToken)
  return s
}

export async function login(email: string, password: string) {
  const s = await post<Session>('/api/auth/login', { email, password })
  setAccessToken(s.accessToken)
  return s
}

export async function refresh() {
  const s = await post<Session>('/api/auth/refresh')
  setAccessToken(s.accessToken)
  return s
}

export async function logout() {
  await post('/api/auth/logout').catch(() => {})
  setAccessToken(null)
}

/* ------------------------------------------------------------------- search */

/** Strip empty strings so the server's "provide a location" check is honest. */
export function clean(input: SearchInput): SearchInput {
  const out = { ...input, filters: { ...input.filters } }
  for (const k of Object.keys(out) as (keyof SearchInput)[]) {
    if (out[k] === '' || out[k] === undefined) delete out[k]
  }
  for (const k of Object.keys(out.filters) as (keyof Filters)[]) {
    if (out.filters[k] === '' || out.filters[k] === undefined) delete out.filters[k]
  }
  return out
}

export const estimate = (input: SearchInput) => post<Cost>('/api/search/estimate', clean(input))
export const search = (input: SearchInput) => post<SearchResponse>('/api/search', clean(input))

export const getHistory = () =>
  get<{ saved: SearchRecord[]; recent: SearchRecord[] }>('/api/search/history')
export const setSearchSaved = (id: string, saved: boolean) =>
  request<SearchRecord>(`/api/search/history/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ saved }),
  })
export const deleteSearch = (id: string) =>
  request<{ ok: true }>(`/api/search/history/${id}`, { method: 'DELETE' })

/* -------------------------------------------------------------------- leads */

export const getLeads = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][],
  )
  return get<{ items: Business[]; total: number; page: number; pages: number }>(`/api/leads?${q}`)
}

export const saveLeads = (placeIds: string[], saved = true) =>
  post<{ matched: number; modified: number }>('/api/leads/save', { placeIds, saved })

/* ---------------------------------------------------------------- dashboard */

export interface Dashboard {
  totals: { leads: number; savedLeads: number; searches: number; apiCalls: number; spendUsd: number }
  quota: Quota
  recentSearches: SearchRecord[]
  recentExports: { _id: string; format: string; rows: number; createdAt: string }[]
  daily: { day: string; searches: number; calls: number; costUsd: number }[]
}

export const getDashboard = () => get<Dashboard>('/api/dashboard')

/* -------------------------------------------------------------------- admin */

export const adminUsers = (search = '') =>
  get<{ users: (User & { usageToday: { searches: number; calls: number; costUsd: number } })[]; total: number }>(
    `/api/admin/users?search=${encodeURIComponent(search)}`,
  )

export const adminPatchUser = (id: string, patch: Record<string, unknown>) =>
  request<User>(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })

export const adminDeleteUser = (id: string) =>
  request<{ ok: true }>(`/api/admin/users/${id}`, { method: 'DELETE' })

export const adminSetApiKey = (id: string, apiKey: string | null) =>
  request<{ ok: true }>(`/api/admin/users/${id}/api-key`, {
    method: 'PUT',
    body: JSON.stringify({ apiKey }),
  })

export interface Analytics {
  daily: { day: string; searches: number; calls: number; costUsd: number }[]
  totals: { searches: number; calls: number; costUsd: number }
  topUsers: { _id: string; email: string; searches: number; costUsd: number }[]
  counts: { users: number; disabledUsers: number; leads: number; searches: number; exports: number }
}

export const adminAnalytics = () => get<Analytics>('/api/admin/analytics')
export const adminSearches = () =>
  get<{ items: (SearchRecord & { user: { email: string } })[]; total: number }>('/api/admin/searches')

/* ------------------------------------------------------------------- export */

export async function exportLeads(
  businesses: Business[],
  format: 'csv' | 'xlsx' | 'json',
  filename = 'leads',
  columns?: string[],
) {
  // Not routed through request(): this returns a file blob, not JSON.
  const res = await fetch(url('/api/export'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ format, filename, businesses, columns }),
  })
  if (!res.ok) throw new Error('Export failed')

  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = `${filename}.${format}`
  a.click()
  URL.revokeObjectURL(objectUrl)
}
