import { useQuery } from '@tanstack/react-query'
import { getDashboard } from '../api.ts'

export default function DashboardView() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard })

  if (isLoading) return <p className="p-8 text-center text-sm text-slate-500">Loading…</p>
  if (!data) return null

  const { totals, quota, daily, recentSearches, recentExports } = data
  const peak = Math.max(1, ...daily.map((d) => d.costUsd))

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Businesses found" value={totals.leads} />
        <Tile label="Saved leads" value={totals.savedLeads} />
        <Tile label="Searches" value={totals.searches} />
        <Tile label="API calls" value={totals.apiCalls} />
        <Tile label="Total spend" value={`$${totals.spendUsd.toFixed(4)}`} accent />
      </div>

      <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
        <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Today's quota — {quota.plan} plan
        </h3>
        <div className="mt-3 space-y-3">
          <Bar label="Searches" used={quota.searchesUsed} limit={quota.searchesLimit} />
          <Bar label="Billable API calls" used={quota.callsUsed} limit={quota.callsLimit} />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Spent today: ${quota.spentTodayUsd.toFixed(4)} · resets at UTC midnight
        </p>
      </section>

      {daily.length > 0 && (
        <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Daily spend (last {daily.length} days)
          </h3>
          <div className="mt-3 flex h-28 items-end gap-1">
            {daily.map((d) => (
              <div key={d.day} className="group relative flex-1" title={`${d.day}: $${d.costUsd.toFixed(4)}`}>
                <div
                  className="w-full rounded-t bg-indigo-500/70 transition-colors group-hover:bg-indigo-500"
                  style={{ height: `${Math.max(2, (d.costUsd / peak) * 100)}%` }}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Recent searches</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {recentSearches.length === 0 && <li className="text-xs text-slate-500">Nothing yet.</li>}
            {recentSearches.map((s) => (
              <li key={s._id} className="flex justify-between gap-2">
                <span className="truncate text-slate-700 dark:text-slate-300">{s.label}</span>
                <span className="shrink-0 tabular-nums text-slate-400">
                  {s.total} · ${s.costUsd.toFixed(4)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Export history</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {recentExports.length === 0 && <li className="text-xs text-slate-500">Nothing exported yet.</li>}
            {recentExports.map((e) => (
              <li key={e._id} className="flex justify-between gap-2">
                <span className="text-slate-700 dark:text-slate-300">
                  {e.rows} rows · {e.format.toUpperCase()}
                </span>
                <span className="shrink-0 text-slate-400">{new Date(e.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

function Tile({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        accent
          ? 'border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10'
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="text-[10px] tracking-wide text-slate-500 uppercase">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  )
}

function Bar({ label, used, limit }: { label: string; used: number; limit: number }) {
  // "Unlimited" arrives as MAX_SAFE_INTEGER; a progress bar for it is nonsense.
  const unlimited = limit > 1e15
  const pct = unlimited ? 0 : Math.min(100, (used / limit) * 100)
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-600 dark:text-slate-400">{label}</span>
        <span className="tabular-nums text-slate-500">
          {used} / {unlimited ? '∞' : limit}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className={`h-full rounded-full ${pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
