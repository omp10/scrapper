import { useQuery } from '@tanstack/react-query'
import { estimate, type SearchInput, type Cost } from '../api.ts'
import { useStore } from '../store.ts'

/**
 * The point of this component: nobody should click Search without knowing what
 * it costs. It re-prices on every keystroke and never calls Google to do it.
 */
export default function CostMeter({ input, actual }: { input: SearchInput; actual?: Cost }) {
  const setInput = useStore((s) => s.setInput)

  const { data } = useQuery({
    queryKey: ['estimate', input],
    queryFn: () => estimate(input),
    // The estimate is pure arithmetic on the server — cheap to re-run.
    staleTime: 0,
    retry: false,
  })

  const cost = actual ?? data
  if (!cost) return null

  // Free provider: a billing breakdown would be noise. Say so and stop.
  if (input.provider === 'osm') {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs font-semibold tracking-wide text-emerald-700 uppercase dark:text-emerald-400">
            {actual ? 'This search cost' : 'Estimated cost'}
          </span>
          <span className="text-3xl font-bold text-emerald-900 dark:text-emerald-200">$0.00</span>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-emerald-900/70 dark:text-emerald-200/60">
          OpenStreetMap — no API key, no billing, no quota. No ratings or review counts, and
          contact coverage varies by region. Switch to Google when you need those.
        </p>
      </div>
    )
  }

  const monthly = cost.totalCost * 100

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400">
          {actual ? 'This search cost' : 'Estimated cost'}
        </span>
        <span className="text-3xl font-bold tabular-nums text-amber-900 dark:text-amber-200">
          ${cost.totalCost.toFixed(4)}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-amber-900/80 dark:text-amber-200/70">
        <dt>Billing tier</dt>
        <dd className="text-right font-medium">{cost.tier}</dd>
        <dt>Rate</dt>
        <dd className="text-right tabular-nums">${cost.ratePer1000}/1k calls</dd>
        <dt>Billable calls</dt>
        <dd className="text-right tabular-nums">{cost.actualBillableCalls ?? cost.billableCalls}</dd>
        {cost.tiles > 1 && (
          <>
            <dt>Tiles</dt>
            <dd className="text-right tabular-nums">
              {cost.tiles} <span className="opacity-60">(≤{cost.maxResultCeiling} leads)</span>
            </dd>
          </>
        )}
        <dt>Per lead</dt>
        <dd className="text-right tabular-nums">${cost.costPerLead.toFixed(5)}</dd>
        <dt className="text-amber-900/60 dark:text-amber-200/50">100 searches/mo</dt>
        <dd className="text-right tabular-nums text-amber-900/60 dark:text-amber-200/50">
          ≈ ${monthly.toFixed(2)}
        </dd>
      </dl>

      {input.contactFields && !actual && (
        <button
          type="button"
          onClick={() => setInput({ contactFields: false })}
          className="mt-3 w-full rounded-lg bg-amber-200 px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-300 dark:bg-amber-500/20 dark:text-amber-200 dark:hover:bg-amber-500/30"
        >
          Drop phone/website/rating → cheaper tier
        </button>
      )}
      {!input.contactFields && (
        <button
          type="button"
          onClick={() => setInput({ contactFields: true })}
          className="mt-3 w-full rounded-lg bg-amber-200 px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-300 dark:bg-amber-500/20 dark:text-amber-200 dark:hover:bg-amber-500/30"
        >
          Contact fields off — re-enable to get phone & website
        </button>
      )}

      <p className="mt-2 text-[11px] leading-snug text-amber-900/60 dark:text-amber-200/50">
        Upper bound assuming zero cache hits. Repeat searches are served from cache at $0.
      </p>
    </div>
  )
}
