import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getHistory, setSearchSaved, deleteSearch, type SearchRecord } from '../api.ts'
import { useStore } from '../store.ts'

export default function HistoryPanel({ onReplay }: { onReplay: () => void }) {
  const replaceInput = useStore((s) => s.replaceInput)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({ queryKey: ['history'], queryFn: getHistory })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['history'] })

  const save = useMutation({
    mutationFn: ({ id, saved }: { id: string; saved: boolean }) => setSearchSaved(id, saved),
    onSuccess: invalidate,
  })
  const remove = useMutation({ mutationFn: deleteSearch, onSuccess: invalidate })

  if (isLoading) return <p className="p-4 text-xs text-slate-500">Loading…</p>
  if (!data?.saved.length && !data?.recent.length) {
    return <p className="p-4 text-xs text-slate-500">Searches you run show up here.</p>
  }

  const row = (h: SearchRecord) => (
    <li key={h._id} className="group flex items-start gap-2 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/40">
      <button
        type="button"
        onClick={() => {
          replaceInput(h.input)
          // Replaying is free — the server serves it from cache.
          onReplay()
        }}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block truncate text-sm text-slate-800 dark:text-slate-200">{h.label}</span>
        <span className="text-[11px] text-slate-500">
          {h.total} leads · ${h.costUsd.toFixed(4)}
          {h.tiles > 1 && ` · ${h.tiles} tiles`} · {new Date(h.createdAt).toLocaleString()}
        </span>
      </button>
      <button
        type="button"
        onClick={() => save.mutate({ id: h._id, saved: !h.saved })}
        title={h.saved ? 'Unsave' : 'Save this search'}
        className={`shrink-0 text-sm ${h.saved ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500 dark:text-slate-600'}`}
      >
        ★
      </button>
      <button
        type="button"
        onClick={() => remove.mutate(h._id)}
        title="Remove"
        className="shrink-0 text-sm text-slate-300 opacity-0 group-hover:opacity-100 hover:text-red-500 dark:text-slate-600"
      >
        ×
      </button>
    </li>
  )

  return (
    <div className="max-h-96 overflow-y-auto">
      {data.saved.length > 0 && (
        <>
          <h4 className="px-4 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">Saved</h4>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">{data.saved.map(row)}</ul>
        </>
      )}
      {data.recent.length > 0 && (
        <>
          <h4 className="px-4 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">Recent</h4>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">{data.recent.map(row)}</ul>
        </>
      )}
    </div>
  )
}
