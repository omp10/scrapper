import { useStore, CATEGORIES } from '../store.ts'

const field =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500'
const label = 'mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400'

export default function SearchForm({
  onSearch,
  loading,
}: {
  onSearch: () => void
  loading: boolean
}) {
  const input = useStore((s) => s.input)
  const setInput = useStore((s) => s.setInput)

  const hasLocation = Boolean(
    input.city || input.state || input.country || (input.lat != null && input.lng != null),
  )
  const isFree = input.provider === 'osm'

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSearch()
      }}
      className="space-y-3"
    >
      {/* Data source, chosen per search. Free is the default; spending is opt-in. */}
      <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
        <span className={label}>Data source</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setInput({ provider: 'osm' })}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium ${
              input.provider === 'osm'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            OpenStreetMap · FREE
          </button>
          <button
            type="button"
            // Clamp on the way in: Google rejects anything above 60.
            onClick={() => setInput({ provider: 'google', maxResults: Math.min(input.maxResults, 60) })}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium ${
              input.provider === 'google'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            Google · PAID
          </button>
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-slate-500 dark:text-slate-500">
          {input.provider === 'osm'
            ? 'No API key, no billing, no quota. Has name, phone, website, address and hours — but no ratings or review counts. Coverage is patchy outside Europe.'
            : 'Costs money per search. Adds ratings, review counts, open-now and far better contact coverage.'}
        </p>
      </div>

      <div>
        <label className={label} htmlFor="category">Category</label>
        <select
          id="category"
          className={field}
          value={input.category}
          onChange={(e) => setInput({ category: e.target.value })}
        >
          <option value="">Any category</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={label} htmlFor="keyword">Keyword</label>
        <input
          id="keyword"
          className={field}
          placeholder="e.g. vegan, 24 hour, wedding"
          value={input.keyword}
          onChange={(e) => setInput({ keyword: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label} htmlFor="city">City</label>
          <input id="city" className={field} value={input.city} onChange={(e) => setInput({ city: e.target.value })} />
        </div>
        <div>
          <label className={label} htmlFor="state">State</label>
          <input id="state" className={field} value={input.state} onChange={(e) => setInput({ state: e.target.value })} />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="country">Country</label>
        <input id="country" className={field} value={input.country} onChange={(e) => setInput({ country: e.target.value })} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label} htmlFor="lat">Latitude</label>
          <input
            id="lat"
            className={field}
            type="number"
            step="any"
            placeholder="optional"
            value={input.lat ?? ''}
            onChange={(e) => setInput({ lat: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={label} htmlFor="lng">Longitude</label>
          <input
            id="lng"
            className={field}
            type="number"
            step="any"
            placeholder="optional"
            value={input.lng ?? ''}
            onChange={(e) => setInput({ lng: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
        </div>
      </div>
      <p className="-mt-1 text-[11px] text-slate-500 dark:text-slate-500">
        Coordinates override city/state/country and skip the geocoding charge.
      </p>

      <div>
        <label className={label} htmlFor="radius">
          Radius: <span className="tabular-nums font-semibold">{input.radiusKm} km</span>
        </label>
        <input
          id="radius"
          type="range"
          min={1}
          max={50}
          value={input.radiusKm}
          onChange={(e) => setInput({ radiusKm: Number(e.target.value) })}
          className="w-full accent-indigo-600"
        />
      </div>

      <div>
        <label className={label} htmlFor="max">
          Max results: <span className="tabular-nums font-semibold">{input.maxResults}</span>
        </label>
        <input
          id="max"
          type="range"
          // Google hard-caps at 60 and bills per page of 20. OSM has no cap and
          // costs nothing, so there's no reason to ask for fewer.
          min={20}
          max={isFree ? 500 : 60}
          step={20}
          value={Math.min(input.maxResults, isFree ? 500 : 60)}
          onChange={(e) => setInput({ maxResults: Number(e.target.value) })}
          className={`w-full ${isFree ? 'accent-emerald-600' : 'accent-indigo-600'}`}
        />
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
          {isFree
            ? 'Free — ask for as many as you want. 500 is the practical ceiling per query.'
            : 'Google caps a search at 60 and bills per page of 20. Use tiling to go beyond.'}
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            className="rounded accent-indigo-600"
            checked={input.tileRadiusKm != null}
            onChange={(e) => setInput({ tileRadiusKm: e.target.checked ? 3 : undefined })}
          />
          Deep coverage (tiled)
        </label>
        <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-500">
          Google caps any one search at 60 results. Tiling splits the area into
          overlapping circles so you actually cover the city — and multiplies the bill.
        </p>
        {input.tileRadiusKm != null && (
          <div className="mt-2">
            <label className={label} htmlFor="tile">
              Tile radius: <span className="tabular-nums font-semibold">{input.tileRadiusKm} km</span>
              <span className="ml-1 font-normal text-slate-400">(smaller = deeper + costlier)</span>
            </label>
            <input
              id="tile"
              type="range"
              min={1}
              max={Math.max(2, input.radiusKm)}
              step={0.5}
              value={input.tileRadiusKm}
              onChange={(e) => setInput({ tileRadiusKm: Number(e.target.value) })}
              className="w-full accent-amber-600"
            />
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || !hasLocation}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? 'Searching…' : 'Find leads'}
      </button>
      {!hasLocation && (
        <p className="text-center text-[11px] text-slate-500">Enter a city, or latitude & longitude.</p>
      )}
    </form>
  )
}
