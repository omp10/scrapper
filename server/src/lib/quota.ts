import type { RequestHandler, Request } from 'express'
import { HttpError } from './google.js'
import { Usage, type Plan } from '../db/models.js'

/**
 * Per-user daily caps, by plan. A runaway loop against a $35/1000 SKU is how
 * you wake up to a four-figure bill, so the cap counts *billable Google calls*
 * as well as searches — one 40-tile search must not count as one "search".
 *
 * Counters live in Mongo keyed on (user, UTC day), so they survive restarts
 * and are correct across multiple server processes.
 */

export const PLAN_LIMITS: Record<Plan, { searchesPerDay: number; callsPerDay: number }> = {
  free: { searchesPerDay: 25, callsPerDay: 100 },
  pro: { searchesPerDay: 500, callsPerDay: 5_000 },
  unlimited: { searchesPerDay: Number.MAX_SAFE_INTEGER, callsPerDay: Number.MAX_SAFE_INTEGER },
}

export const today = () => new Date().toISOString().slice(0, 10)

/**
 * Reserve one search up front. The increment and the read are a single atomic
 * findOneAndUpdate — two concurrent requests can't both see "24 used" and both
 * proceed past a limit of 25.
 */
export const enforceQuota: RequestHandler = async (req, _res, next) => {
  const user = req.user!
  const limits = PLAN_LIMITS[user.plan as Plan] ?? PLAN_LIMITS.free

  const usage = await Usage.findOneAndUpdate(
    { user: user.id, day: today() },
    { $inc: { searches: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )

  if (usage.searches > limits.searchesPerDay) {
    // Hand the reservation back so a rejected request doesn't burn quota.
    await Usage.updateOne({ _id: usage._id }, { $inc: { searches: -1 } })
    throw new HttpError(429, `Daily search limit reached (${limits.searchesPerDay}). Resets at UTC midnight.`)
  }
  if (usage.calls >= limits.callsPerDay) {
    await Usage.updateOne({ _id: usage._id }, { $inc: { searches: -1 } })
    throw new HttpError(429, `Daily API call limit reached (${limits.callsPerDay}). Resets at UTC midnight.`)
  }

  next()
}

/** Reconcile after the search — we only know the real call count once it ran. */
export async function recordSpend(userId: string, billableCalls: number, costUsd: number) {
  await Usage.updateOne(
    { user: userId, day: today() },
    { $inc: { calls: billableCalls, costUsd } },
    { upsert: true },
  )
}

export async function quotaStatus(req: Request) {
  const user = req.user!
  const limits = PLAN_LIMITS[user.plan as Plan] ?? PLAN_LIMITS.free
  const usage = await Usage.findOne({ user: user.id, day: today() })
  return {
    plan: user.plan,
    searchesUsed: usage?.searches ?? 0,
    searchesLimit: limits.searchesPerDay,
    callsUsed: usage?.calls ?? 0,
    callsLimit: limits.callsPerDay,
    spentTodayUsd: Number((usage?.costUsd ?? 0).toFixed(4)),
    resetsAt: `${today()}T24:00:00Z`,
  }
}
