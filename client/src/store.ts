import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SearchInput, Session } from './api.ts'

/**
 * UI state and the session only. Server data — results, history, leads,
 * dashboard — lives in React Query. Mirroring it here would give two sources
 * of truth and a stale-cache bug.
 */

export const CATEGORIES = [
  'restaurant',
  'cafe',
  'bakery',
  'bar',
  'hotel',
  'gym',
  'hospital',
  'pharmacy',
  'beauty_salon',
  'hair_care',
  'dentist',
  'car_repair',
  'real_estate_agency',
  'lawyer',
  'accounting',
  'plumber',
  'electrician',
  'school',
  'store',
] as const

export const DEFAULT_INPUT: SearchInput = {
  // Free by default — you opt in to spending, never out of it.
  provider: 'osm',
  keyword: '',
  category: '',
  city: '',
  state: '',
  country: '',
  radiusKm: 5,
  maxResults: 20,
  contactFields: true,
  filters: {},
}

interface State {
  user: Session['user'] | null
  input: SearchInput
  selected: Set<string>
  dark: boolean
  setUser: (u: Session['user'] | null) => void
  setInput: (patch: Partial<SearchInput>) => void
  replaceInput: (input: SearchInput) => void
  setFilters: (patch: Partial<SearchInput['filters']>) => void
  toggleSelect: (id: string) => void
  selectAll: (ids: string[]) => void
  clearSelection: () => void
  toggleDark: () => void
}

export const useStore = create<State>()(
  persist(
    (set) => ({
      user: null,
      input: DEFAULT_INPUT,
      selected: new Set<string>(),
      dark: document.documentElement.classList.contains('dark'),

      setUser: (user) => set({ user }),
      setInput: (patch) => set((s) => ({ input: { ...s.input, ...patch } })),
      replaceInput: (input) => set({ input: { ...DEFAULT_INPUT, ...input } }),
      setFilters: (patch) =>
        set((s) => ({ input: { ...s.input, filters: { ...s.input.filters, ...patch } } })),

      toggleSelect: (id) =>
        set((s) => {
          const next = new Set(s.selected)
          next.has(id) ? next.delete(id) : next.add(id)
          return { selected: next }
        }),
      selectAll: (ids) => set({ selected: new Set(ids) }),
      clearSelection: () => set({ selected: new Set() }),

      toggleDark: () =>
        set((s) => {
          const dark = !s.dark
          document.documentElement.classList.toggle('dark', dark)
          localStorage.theme = dark ? 'dark' : 'light'
          return { dark }
        }),
    }),
    {
      name: 'lead-finder',
      // Sets don't survive JSON, and selection shouldn't outlive the session.
      // The user is re-derived from the refresh cookie, never trusted from here.
      // Which page you're on is the URL's job now, not the store's.
      partialize: (s) => ({ input: s.input, dark: s.dark }),
    },
  ),
)
