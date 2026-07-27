/**
 * Actual API spend, so the dashboard can show estimate-vs-real.
 *
 * ponytail: in-process counters, reset on restart. Swap the two functions for
 * Mongo writes in Phase 3 when usage needs to be per-user and durable.
 */
import { PRICING } from '../config.js'

type Kind = 'search' | 'geocoding'

const counts: Record<Kind, number> = { search: 0, geocoding: 0 }
let spend = 0

export function recordCall(kind: Kind, ratePer1000?: number) {
  counts[kind]++
  const rate = ratePer1000 ?? (kind === 'geocoding' ? PRICING.geocoding : PRICING.search.enterprise)
  spend += rate / 1000
}

export function getUsage() {
  return {
    calls: { ...counts, total: counts.search + counts.geocoding },
    estimatedSpendUsd: Number(spend.toFixed(4)),
  }
}
