import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getLeads, saveLeads } from '../api.ts'
import ResultsList from './ResultsList.tsx'
import ExportDialog from './ExportDialog.tsx'

/**
 * The persistent ledger — every business ever found, across all searches,
 * deduped by place_id. Free to browse: it's already paid for.
 */
export default function SavedLeadsView() {
  const qc = useQueryClient()
  const [savedOnly, setSavedOnly] = useState(true)
  const [noWebsite, setNoWebsite] = useState(false)
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['leads', savedOnly, noWebsite, page],
    queryFn: () =>
      getLeads({
        saved: savedOnly ? 'true' : undefined,
        hasWebsite: noWebsite ? 'false' : undefined,
        page,
        limit: 50,
      }),
  })

  const unsave = useMutation({
    mutationFn: (placeIds: string[]) => saveLeads(placeIds, false),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })

  const items = data?.items ?? []

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3 dark:border-slate-800">
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            className="rounded accent-indigo-600"
            checked={savedOnly}
            onChange={(e) => {
              setSavedOnly(e.target.checked)
              setPage(1)
            }}
          />
          Bookmarked only
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            className="rounded accent-indigo-600"
            checked={noWebsite}
            onChange={(e) => {
              setNoWebsite(e.target.checked)
              setPage(1)
            }}
          />
          No website
        </label>

        <span className="text-xs text-slate-500">{data?.total ?? 0} total</span>

        <div className="ml-auto flex gap-2">
          <ExportDialog businesses={items} defaultName={savedOnly ? 'saved-leads' : 'all-leads'} />
          {savedOnly && items.length > 0 && (
            <button
              onClick={() => unsave.mutate(items.map((i) => i.placeId))}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs dark:border-slate-700"
            >
              Unsave page
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="py-16 text-center text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-500">
          {savedOnly ? 'Bookmark leads from a search to collect them here.' : 'No leads yet — run a search.'}
        </p>
      ) : (
        <ResultsList businesses={items} />
      )}

      {(data?.pages ?? 1) > 1 && (
        <div className="flex items-center justify-center gap-3 border-t border-slate-200 p-3 text-sm dark:border-slate-800">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40 dark:border-slate-700"
          >
            Previous
          </button>
          <span className="text-xs text-slate-500">
            Page {page} of {data!.pages}
          </span>
          <button
            disabled={page >= (data?.pages ?? 1)}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40 dark:border-slate-700"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
