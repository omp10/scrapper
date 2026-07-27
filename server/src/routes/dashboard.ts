import { Router } from 'express'
import { Search, Lead, Usage, ExportLog } from '../db/models.js'
import { requireAuth } from '../lib/auth.js'
import { quotaStatus } from '../lib/quota.js'

export const dashboardRouter = Router()
dashboardRouter.use(requireAuth)

/** Everything the dashboard shows, in one round trip. */
dashboardRouter.get('/', async (req, res) => {
  const userId = req.user!.id

  const [totalLeads, savedLeads, totalSearches, spend, recentSearches, recentExports, daily] =
    await Promise.all([
      Lead.countDocuments({ user: userId }),
      Lead.countDocuments({ user: userId, saved: true }),
      Search.countDocuments({ user: userId }),
      Usage.aggregate([
        { $match: { user: toObjectId(userId) } },
        { $group: { _id: null, calls: { $sum: '$calls' }, costUsd: { $sum: '$costUsd' } } },
      ]),
      Search.find({ user: userId }).sort({ createdAt: -1 }).limit(10).lean(),
      ExportLog.find({ user: userId }).sort({ createdAt: -1 }).limit(10).lean(),
      Usage.find({ user: userId }).sort({ day: -1 }).limit(30).lean(),
    ])

  res.json({
    totals: {
      leads: totalLeads,
      savedLeads,
      searches: totalSearches,
      apiCalls: spend[0]?.calls ?? 0,
      spendUsd: Number((spend[0]?.costUsd ?? 0).toFixed(4)),
    },
    quota: await quotaStatus(req),
    recentSearches,
    recentExports,
    daily: daily.reverse().map((d) => ({
      day: d.day,
      searches: d.searches,
      calls: d.calls,
      costUsd: Number((d.costUsd ?? 0).toFixed(4)),
    })),
  })
})

// Aggregate pipelines don't cast strings to ObjectId the way queries do.
import mongoose from 'mongoose'
const toObjectId = (id: string) => new mongoose.Types.ObjectId(id)
