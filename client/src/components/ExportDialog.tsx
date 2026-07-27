import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { exportLeads, type Business } from '../api.ts'

/**
 * Export with a column picker. Which columns you want depends entirely on what
 * you're doing with the file — a dialler list needs name and phone, a CRM
 * import needs everything — so the choice belongs to the user, not to us.
 */

export const COLUMNS = [
  { key: 'name', label: 'Business name' },
  { key: 'phone', label: 'Phone' },
  { key: 'internationalPhone', label: 'Phone (international)' },
  { key: 'website', label: 'Website' },
  { key: 'address', label: 'Address' },
  { key: 'rating', label: 'Rating' },
  { key: 'reviews', label: 'Review count' },
  { key: 'primaryType', label: 'Business type' },
  { key: 'types', label: 'All types' },
  { key: 'openingHours', label: 'Opening hours' },
  { key: 'status', label: 'Status (open/closed)' },
  { key: 'priceLevel', label: 'Price level' },
  { key: 'distanceKm', label: 'Distance (km)' },
  { key: 'leadScore', label: 'Lead score' },
  { key: 'lat', label: 'Latitude' },
  { key: 'lng', label: 'Longitude' },
  { key: 'mapsUrl', label: 'Google Maps URL' },
  { key: 'placeId', label: 'Google Place ID' },
  { key: 'timesSeen', label: 'Times seen' },
] as const

export type ColumnKey = (typeof COLUMNS)[number]['key']

/** What most people actually want in a call sheet. */
const DEFAULT_COLUMNS: ColumnKey[] = [
  'name',
  'phone',
  'website',
  'address',
  'rating',
  'reviews',
  'primaryType',
  'leadScore',
]

const PRESETS: { label: string; columns: ColumnKey[] }[] = [
  { label: 'Call sheet', columns: ['name', 'phone', 'address', 'rating', 'reviews', 'leadScore'] },
  {
    label: 'Outreach',
    columns: ['name', 'phone', 'website', 'address', 'primaryType', 'rating', 'reviews', 'leadScore'],
  },
  { label: 'Everything', columns: COLUMNS.map((c) => c.key) },
]

const STORAGE_KEY = 'export-columns'

export default function ExportDialog({
  businesses,
  defaultName = 'leads',
}: {
  businesses: Business[]
  defaultName?: string
}) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [filename, setFilename] = useState(defaultName)
  const panel = useRef<HTMLDivElement>(null)

  // Column choice is a preference, not session state — remember it.
  const [columns, setColumns] = useState<ColumnKey[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
      return Array.isArray(saved) && saved.length ? saved : DEFAULT_COLUMNS
    } catch {
      return DEFAULT_COLUMNS
    }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(columns))
  }, [columns])

  // Click-outside and Escape to dismiss.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (key: ColumnKey) =>
    setColumns((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]))

  async function run(format: 'csv' | 'xlsx' | 'json') {
    setBusy(true)
    try {
      // Send them in the listed order, not click order — a file whose columns
      // shuffle depending on what you clicked first is maddening.
      const ordered = COLUMNS.filter((c) => columns.includes(c.key)).map((c) => c.key)
      await exportLeads(businesses, format, filename || 'leads', ordered)
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={!businesses.length}
        className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-slate-700"
      >
        Export ({businesses.length}) ▾
      </button>

      {open && (
        <div
          ref={panel}
          className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">Choose columns</h3>
            <span className="text-[11px] text-slate-500">{columns.length} selected</span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setColumns(p.columns)}
                className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setColumns([])}
              className="rounded-md px-2 py-1 text-[11px] text-slate-400 hover:text-red-500"
            >
              Clear
            </button>
          </div>

          <div className="mt-3 max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            {COLUMNS.map((c) => (
              <label
                key={c.key}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <input
                  type="checkbox"
                  className="rounded accent-indigo-600"
                  checked={columns.includes(c.key)}
                  onChange={() => toggle(c.key)}
                />
                <span className="text-slate-700 dark:text-slate-300">{c.label}</span>
              </label>
            ))}
          </div>

          <label className="mt-3 block text-[11px] font-medium text-slate-500">File name</label>
          <input
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          />

          <div className="mt-3 flex gap-2">
            {(['csv', 'xlsx', 'json'] as const).map((f) => (
              <button
                key={f}
                onClick={() => run(f)}
                disabled={busy || !columns.length}
                className="flex-1 rounded-lg bg-indigo-600 px-2 py-2 text-xs font-semibold uppercase text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                {f}
              </button>
            ))}
          </div>
          {!columns.length && (
            <p className="mt-2 text-[11px] text-amber-600">Pick at least one column.</p>
          )}
        </div>
      )}
    </div>
  )
}
