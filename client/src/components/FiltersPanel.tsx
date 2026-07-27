import { useStore } from '../store.ts'
import type { Business } from '../api.ts'

/**
 * Filters narrow the already-fetched results in the browser — instant, and $0.
 * They never re-run the search, so they never cost an API call.
 *
 * Rating and review filters are hidden for OpenStreetMap: it has neither, so
 * offering them is a trap that silently empties the list.
 */
export default function FiltersPanel({ businesses }: { businesses: Business[] }) {
  const provider = useStore((s) => s.input.provider)
  const filters = useStore((s) => s.input.filters)
  const setFilters = useStore((s) => s.setFilters)
  const hasRatings = provider === 'google'

  // Only offer types that actually appear in the results.
  const types = [...new Set(businesses.flatMap((b) => b.types))].sort()

  const tri = (key: 'hasWebsite' | 'hasPhone', label: string) => (
    <div key={key}>
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
      <div className="flex gap-1">
        {[
          { v: undefined, t: 'Any' },
          { v: true, t: 'Yes' },
          { v: false, t: 'No' },
        ].map(({ v, t }) => (
          <button
            key={t}
            type="button"
            onClick={() => setFilters({ [key]: v })}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium ${
              filters[key] === v
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  )

  const num =
    'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

  return (
    <div className="space-y-3">
      {!hasRatings && (
        <p className="rounded-lg bg-slate-100 p-2 text-[11px] leading-snug text-slate-500 dark:bg-slate-800/50 dark:text-slate-500">
          OpenStreetMap has no ratings or reviews — those filters appear only on the Google
          provider. Filter by phone, website and distance instead.
        </p>
      )}
      {hasRatings && (
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="minRating">
            Min rating
          </label>
          <input
            id="minRating"
            type="number"
            min={0}
            max={5}
            step={0.1}
            className={num}
            value={filters.minRating ?? ''}
            onChange={(e) => setFilters({ minRating: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="minReviews">
            Min reviews
          </label>
          <input
            id="minReviews"
            type="number"
            min={0}
            className={num}
            value={filters.minReviews ?? ''}
            onChange={(e) => setFilters({ minReviews: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
        </div>
      </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="maxDistance">
          Max distance (km) <span className="font-normal text-slate-400">— blank = no limit</span>
        </label>
        <input
          id="maxDistance"
          type="number"
          min={0}
          placeholder="no limit"
          className={num}
          value={filters.maxDistanceKm ?? ''}
          // 0 and blank both mean "no limit" — never a hard "must be at 0 km".
          onChange={(e) =>
            setFilters({ maxDistanceKm: Number(e.target.value) > 0 ? Number(e.target.value) : undefined })
          }
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="btype">
          Business type
        </label>
        <select
          id="btype"
          className={num}
          value={filters.businessType ?? ''}
          onChange={(e) => setFilters({ businessType: e.target.value || undefined })}
        >
          <option value="">Any</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      {tri('hasWebsite', 'Has website')}
      {tri('hasPhone', 'Has phone')}

      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          className="rounded accent-indigo-600"
          checked={filters.openNow ?? false}
          onChange={(e) => setFilters({ openNow: e.target.checked || undefined })}
        />
        Open now
      </label>

      <button
        type="button"
        onClick={() =>
          setFilters({
            minRating: undefined,
            minReviews: undefined,
            businessType: undefined,
            hasWebsite: undefined,
            hasPhone: undefined,
            openNow: undefined,
            maxDistanceKm: undefined,
          })
        }
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        Clear filters
      </button>

      <p className="rounded-lg bg-slate-100 p-2 text-[11px] leading-snug text-slate-500 dark:bg-slate-800/50 dark:text-slate-500">
        Tip: <strong>Has website: No</strong> + high reviews is the strongest lead list — a real
        business with a gap you can sell into.
      </p>
    </div>
  )
}
