import { useEffect, useRef, useState } from 'react'
import type { Business } from '../api.ts'
import { useStore } from '../store.ts'

const PAGE = 20

/**
 * Infinite scroll over an already-fetched array. The network cost was paid at
 * search time — paging here is purely about not rendering 1200 rows at once.
 */
export default function ResultsList({ businesses }: { businesses: Business[] }) {
  const [shown, setShown] = useState(PAGE)
  const selected = useStore((s) => s.selected)
  const toggleSelect = useStore((s) => s.toggleSelect)
  const sentinel = useRef<HTMLDivElement>(null)

  // Reset paging whenever the underlying result set changes.
  useEffect(() => setShown(PAGE), [businesses])

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setShown((n) => Math.min(n + PAGE, businesses.length))
      },
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [businesses.length])

  if (!businesses.length) {
    return (
      <p className="py-16 text-center text-sm text-slate-500">
        No businesses match. Loosen the filters, or widen the radius.
      </p>
    )
  }

  return (
    <div>
      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {businesses.slice(0, shown).map((b) => (
          <li key={b.placeId} className="flex gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0 rounded accent-indigo-600"
              checked={selected.has(b.placeId)}
              onChange={() => toggleSelect(b.placeId)}
              aria-label={`Select ${b.name}`}
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h3 className="truncate font-semibold text-slate-900 dark:text-slate-100">{b.name}</h3>
                <LeadBadge score={b.leadScore} />
                {b.openNow === true && <span className="text-xs font-medium text-emerald-600">Open</span>}
                {b.openNow === false && <span className="text-xs text-slate-400">Closed</span>}
              </div>

              <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{b.address}</p>

              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                {b.rating != null && (
                  <span className="tabular-nums">
                    ★ {b.rating} <span className="text-slate-400">({b.reviews})</span>
                  </span>
                )}
                {b.primaryType && <span>{b.primaryType}</span>}
                {b.distanceKm != null && <span className="tabular-nums">{b.distanceKm} km</span>}
                {b.priceLevel && <span>{b.priceLevel.replace('PRICE_LEVEL_', '').toLowerCase()}</span>}
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {b.phone ? (
                  <a href={`tel:${b.internationalPhone ?? b.phone}`} className="rounded bg-emerald-50 px-2 py-1 font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400">
                    {b.phone}
                  </a>
                ) : (
                  <span className="rounded bg-slate-100 px-2 py-1 text-slate-400 dark:bg-slate-800">No phone</span>
                )}
                {b.website ? (
                  <a href={b.website} target="_blank" rel="noreferrer" className="rounded bg-slate-100 px-2 py-1 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">
                    Website
                  </a>
                ) : (
                  <span className="rounded bg-amber-100 px-2 py-1 font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-400">
                    No website
                  </span>
                )}
                {b.mapsUrl && (
                  <a href={b.mapsUrl} target="_blank" rel="noreferrer" className="rounded bg-slate-100 px-2 py-1 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">
                    Maps
                  </a>
                )}
                {b.openingHours && <Hours hours={b.openingHours} />}
              </div>

              <p className="mt-1.5 font-mono text-[10px] text-slate-400 dark:text-slate-600">
                {b.placeId}
                {b.lat != null && ` · ${b.lat.toFixed(5)}, ${b.lng?.toFixed(5)}`}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {shown < businesses.length && (
        <div ref={sentinel} className="py-6 text-center text-sm text-slate-400">
          Loading more… ({shown} of {businesses.length})
        </div>
      )}
    </div>
  )
}

function LeadBadge({ score }: { score: number }) {
  const tone =
    score >= 70
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400'
      : score >= 40
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400'
        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${tone}`}>{score}</span>
}

function Hours({ hours }: { hours: string[] }) {
  return (
    <details className="w-full">
      <summary className="cursor-pointer rounded bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        Hours
      </summary>
      <ul className="mt-1 space-y-0.5 pl-1 text-slate-500 dark:text-slate-400">
        {hours.map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>
    </details>
  )
}
