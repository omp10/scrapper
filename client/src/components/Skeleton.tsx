import { useEffect, useState } from 'react'

/**
 * Loading state for a search.
 *
 * A row of shimmer placeholders reads as "results are coming" far better than a
 * spinner, and it holds the layout so the page doesn't jump when data lands.
 *
 * OSM tiled sweeps run tile-by-tile and can take 20–40s, so past a few seconds
 * we surface an honest "this is a big free query" note rather than leaving the
 * user wondering if it hung.
 */
export default function Skeleton({ tiled }: { tiled?: boolean }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="h-2 w-2 animate-ping rounded-full bg-indigo-500" />
        <p className="text-sm text-slate-500">
          {tiled ? 'Sweeping the area tile by tile…' : 'Searching…'}
          {seconds >= 4 && (
            <span className="text-slate-400">
              {' '}
              {seconds}s{tiled && ' — big free queries take a moment'}
            </span>
          )}
        </p>
      </div>

      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="flex gap-3 p-4">
            <div className="h-4 w-4 shrink-0 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex gap-2">
                {/* Slightly varied widths read as text, not a progress bar. */}
                <Shimmer className={`h-4 ${['w-40', 'w-52', 'w-32', 'w-48', 'w-44', 'w-36'][i]}`} />
                <Shimmer className="h-4 w-8" />
              </div>
              <Shimmer className="h-3 w-3/4" />
              <div className="flex gap-2 pt-1">
                <Shimmer className="h-6 w-24 rounded" />
                <Shimmer className="h-6 w-16 rounded" />
                <Shimmer className="h-6 w-14 rounded" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Shimmer({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 bg-[length:200%_100%] dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 ${className}`}
    />
  )
}
