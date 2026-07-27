import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { search, saveLeads, type SearchResponse } from '../api.ts'
import { filterBusinesses } from '../lib/filter.ts'
import { useStore } from '../store.ts'
import SearchForm from '../components/SearchForm.tsx'
import FiltersPanel from '../components/FiltersPanel.tsx'
import CostMeter from '../components/CostMeter.tsx'
import ResultsList from '../components/ResultsList.tsx'
import MapView from '../components/MapView.tsx'
import HistoryPanel from '../components/HistoryPanel.tsx'
import ExportDialog from '../components/ExportDialog.tsx'
import Skeleton from '../components/Skeleton.tsx'

/**
 * /search and /map are the same page with a different result renderer.
 *
 * The last result set lives in the React Query cache rather than component
 * state, so switching between the two routes doesn't unmount the results and
 * silently throw away a search the user just paid for.
 */
const LAST_SEARCH = ['lastSearch'] as const

export default function SearchPage({ view }: { view: 'list' | 'map' }) {
  const qc = useQueryClient()
  const input = useStore((s) => s.input)
  const selected = useStore((s) => s.selected)
  const selectAll = useStore((s) => s.selectAll)
  const clearSelection = useStore((s) => s.clearSelection)

  const { data } = useQuery<SearchResponse | null>({
    queryKey: LAST_SEARCH,
    queryFn: () => null, // never fetches; the mutation populates it
    enabled: false,
    initialData: null,
  })

  const run = useMutation({
    mutationFn: () => search(input),
    onSuccess: (res) => {
      qc.setQueryData(LAST_SEARCH, res)
      clearSelection()
      // History, dashboard and the ledger all changed server-side.
      qc.invalidateQueries({ queryKey: ['history'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['leads'] })
    },
  })

  // Filters run over the already-fetched set: instant, and $0. Re-searching to
  // apply one would bill another Places call for data we already have.
  const allResults = data?.businesses ?? []
  const businesses = useMemo(
    () => filterBusinesses(allResults, input.filters),
    [allResults, input.filters],
  )
  const chosen = selected.size ? businesses.filter((b) => selected.has(b.placeId)) : businesses

  const bookmark = useMutation({
    mutationFn: () => saveLeads(chosen.map((b) => b.placeId), true),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })

  return (
    <main className="mx-auto grid max-w-[1600px] gap-4 p-4 lg:grid-cols-[320px_1fr]">
      <aside className="space-y-4">
        <Card title="Search">
          <SearchForm onSearch={() => run.mutate()} loading={run.isPending} />
        </Card>

        <CostMeter input={input} actual={data?.cost} />

        {/* Type options come from the unfiltered set, or picking one type
            would erase every other option from the dropdown. */}
        <Card title="Filters">
          <FiltersPanel businesses={allResults} />
        </Card>

        <Card title="History & saved" flush>
          <HistoryPanel onReplay={() => run.mutate()} />
        </Card>
      </aside>

      <section className="min-w-0 space-y-4">
        {run.isError && (
          <p className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
            {(run.error as Error).message}
          </p>
        )}

        {data && !run.isPending && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm">
              <strong className="tabular-nums">{businesses.length}</strong> leads in{' '}
              <span className="text-slate-500">{data.location.label}</span>
              {businesses.length !== allResults.length && (
                <span className="text-slate-400">
                  {' '}
                  (filtered from {allResults.length} · free)
                </span>
              )}
              {data.cached && <span className="ml-2 text-xs text-emerald-600">cached · $0</span>}
              {data.tiles > 1 && <span className="ml-2 text-xs text-slate-400">{data.tiles} tiles</span>}
            </p>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                onClick={() =>
                  selected.size ? clearSelection() : selectAll(businesses.map((b) => b.placeId))
                }
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium dark:border-slate-700"
              >
                {selected.size ? `Clear (${selected.size})` : 'Select all'}
              </button>
              <button
                onClick={() => bookmark.mutate()}
                disabled={!chosen.length || bookmark.isPending}
                className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                {bookmark.isSuccess ? 'Saved ✓' : `Save ${selected.size || 'all'}`}
              </button>
              <ExportDialog businesses={chosen} defaultName="leads" />
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {run.isPending ? (
            // Skeleton during the search — holds layout, reads as "results coming".
            <Skeleton tiled={Boolean(input.tileRadiusKm)} />
          ) : !data ? (
            <p className="py-24 text-center text-sm text-slate-500">
              Pick a category and a city, check the cost, then search.
            </p>
          ) : view === 'map' ? (
            <div className="h-[70vh]">
              <MapView businesses={businesses} center={data.location} />
            </div>
          ) : (
            <ResultsList businesses={businesses} />
          )}
        </div>
      </section>
    </main>
  )
}

function Card({
  title,
  children,
  flush,
}: {
  title: string
  children: React.ReactNode
  flush?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <h2 className="border-b border-slate-200 px-4 py-2.5 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:border-slate-800">
        {title}
      </h2>
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </div>
  )
}
