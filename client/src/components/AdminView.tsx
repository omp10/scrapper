import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  adminUsers,
  adminPatchUser,
  adminDeleteUser,
  adminSetApiKey,
  adminAnalytics,
  adminSearches,
} from '../api.ts'
import { useStore } from '../store.ts'

export default function AdminView() {
  const me = useStore((s) => s.user)
  const [tab, setTab] = useState<'users' | 'analytics' | 'logs'>('users')

  return (
    <div className="p-4">
      <div className="mb-4 flex gap-1">
        {(['users', 'analytics', 'logs'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize ${
              tab === t
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {t === 'logs' ? 'Search logs' : t}
          </button>
        ))}
      </div>

      {tab === 'users' && <Users myId={me?.id} />}
      {tab === 'analytics' && <Analytics />}
      {tab === 'logs' && <Logs />}
    </div>
  )
}

function Users({ myId }: { myId?: string }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const { data, isLoading } = useQuery({ queryKey: ['admin-users', search], queryFn: () => adminUsers(search) })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-users'] })

  const patch = useMutation({
    mutationFn: ({ id, ...rest }: { id: string } & Record<string, unknown>) => adminPatchUser(id, rest),
    onSuccess: invalidate,
  })
  const remove = useMutation({ mutationFn: adminDeleteUser, onSuccess: invalidate })
  const setKey = useMutation({
    mutationFn: ({ id, apiKey }: { id: string; apiKey: string | null }) => adminSetApiKey(id, apiKey),
    onSuccess: invalidate,
  })

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>

  return (
    <div>
      <input
        className="mb-3 w-full max-w-xs rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
        placeholder="Filter by email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/50">
            <tr>
              {['Email', 'Plan', 'Role', 'Today', 'Own key', 'Status', ''].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data?.users.map((u) => {
              const isMe = u._id === myId
              return (
                <tr key={u._id} className={u.disabled ? 'opacity-50' : ''}>
                  <td className="px-3 py-2">
                    {u.email}
                    {isMe && <span className="ml-1 text-[10px] text-indigo-500">(you)</span>}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={u.plan}
                      onChange={(e) => patch.mutate({ id: u._id, plan: e.target.value })}
                      className="rounded border border-slate-300 bg-transparent px-1 py-0.5 text-xs dark:border-slate-700"
                    >
                      {['free', 'pro', 'unlimited'].map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={u.role}
                      disabled={isMe}
                      onChange={(e) => patch.mutate({ id: u._id, role: e.target.value })}
                      className="rounded border border-slate-300 bg-transparent px-1 py-0.5 text-xs disabled:opacity-40 dark:border-slate-700"
                    >
                      {['user', 'admin'].map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-slate-500">
                    {u.usageToday.searches} searches · ${u.usageToday.costUsd.toFixed(3)}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => {
                        const key = prompt(`Google API key for ${u.email} (blank to clear):`)
                        if (key !== null) setKey.mutate({ id: u._id, apiKey: key.trim() || null })
                      }}
                      className="rounded bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800"
                    >
                      {(u as { hasOwnApiKey?: boolean }).hasOwnApiKey ? 'Set ✓' : 'Set'}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      disabled={isMe}
                      onClick={() => patch.mutate({ id: u._id, disabled: !u.disabled })}
                      className={`rounded px-2 py-0.5 text-xs disabled:opacity-40 ${
                        u.disabled
                          ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                      }`}
                    >
                      {u.disabled ? 'Disabled' : 'Active'}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      disabled={isMe}
                      onClick={() => {
                        if (confirm(`Delete ${u.email} and all their data? This cannot be undone.`))
                          remove.mutate(u._id)
                      }}
                      className="text-xs text-slate-400 hover:text-red-500 disabled:opacity-30"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Analytics() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-analytics'], queryFn: adminAnalytics })
  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>
  if (!data) return null

  const peak = Math.max(1, ...data.daily.map((d) => d.costUsd))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Users" value={data.counts.users} />
        <Stat label="Disabled" value={data.counts.disabledUsers} />
        <Stat label="Leads" value={data.counts.leads} />
        <Stat label="Searches" value={data.counts.searches} />
        <Stat label="Exports" value={data.counts.exports} />
        <Stat label="Total spend" value={`$${data.totals.costUsd.toFixed(2)}`} />
      </div>

      <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Daily spend</h3>
        <div className="mt-3 flex h-24 items-end gap-1">
          {data.daily.map((d) => (
            <div key={d.day} className="flex-1" title={`${d.day}: $${d.costUsd.toFixed(4)}`}>
              <div
                className="w-full rounded-t bg-indigo-500/70"
                style={{ height: `${Math.max(2, (d.costUsd / peak) * 100)}%` }}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top spenders</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {data.topUsers.map((u) => (
            <li key={u._id} className="flex justify-between">
              <span className="text-slate-700 dark:text-slate-300">{u.email}</span>
              <span className="tabular-nums text-slate-500">
                {u.searches} searches · ${u.costUsd.toFixed(3)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Logs() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-searches'], queryFn: adminSearches })
  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/50">
          <tr>
            {['When', 'User', 'Query', 'Results', 'Tiles', 'Cost'].map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {data?.items.map((s) => (
            <tr key={s._id}>
              <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                {new Date(s.createdAt).toLocaleString()}
              </td>
              <td className="px-3 py-2 text-xs">{s.user?.email ?? '—'}</td>
              <td className="max-w-xs truncate px-3 py-2">{s.label}</td>
              <td className="px-3 py-2 tabular-nums">{s.total}</td>
              <td className="px-3 py-2 tabular-nums">{s.tiles}</td>
              <td className="px-3 py-2 tabular-nums">${s.costUsd.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
    </div>
  )
}
