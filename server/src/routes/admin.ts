import { Router } from 'express'
import { z } from 'zod'
import { User, Search, Lead, Usage, ExportLog, PLANS, ROLES } from '../db/models.js'
import { requireAuth, requireAdmin, hashPassword } from '../lib/auth.js'
import { HttpError } from '../lib/google.js'
import { PLAN_LIMITS } from '../lib/quota.js'

export const adminRouter = Router()
adminRouter.use(requireAuth, requireAdmin)

/** User management. */
adminRouter.get('/users', async (req, res) => {
  const q = z
    .object({
      search: z.string().trim().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(200).default(50),
    })
    .parse(req.query)

  const filter = q.search ? { email: { $regex: q.search, $options: 'i' } } : {}
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    User.countDocuments(filter),
  ])

  // Attach today's usage in one query rather than one per user.
  const today = new Date().toISOString().slice(0, 10)
  const usage = await Usage.find({ day: today, user: { $in: users.map((u) => u._id) } }).lean()
  const byUser = new Map(usage.map((u) => [String(u.user), u]))

  res.json({
    total,
    page: q.page,
    users: users.map((u) => {
      const { passwordHash, googleApiKey, ...safe } = u as Record<string, unknown>
      return {
        ...safe,
        hasOwnApiKey: Boolean(googleApiKey),
        usageToday: byUser.get(String(u._id)) ?? { searches: 0, calls: 0, costUsd: 0 },
        limits: PLAN_LIMITS[u.plan as keyof typeof PLAN_LIMITS],
      }
    }),
  })
})

const UserPatch = z.object({
  plan: z.enum(PLANS).optional(),
  role: z.enum(ROLES).optional(),
  disabled: z.boolean().optional(),
  password: z.string().min(8).optional(),
})

adminRouter.patch('/users/:id', async (req, res) => {
  const patch = UserPatch.parse(req.body)

  // An admin locking or demoting themselves can leave an install with no way in.
  if (req.params.id === req.user!.id && (patch.disabled === true || patch.role === 'user')) {
    throw new HttpError(400, 'You cannot disable or demote your own admin account')
  }

  const update: Record<string, unknown> = { ...patch }
  if (patch.password) {
    update.passwordHash = await hashPassword(patch.password)
    delete update.password
  }

  const user = await User.findByIdAndUpdate(req.params.id, { $set: update }, { new: true })
  if (!user) throw new HttpError(404, 'User not found')
  res.json(user.toJSON())
})

adminRouter.delete('/users/:id', async (req, res) => {
  if (req.params.id === req.user!.id) throw new HttpError(400, 'You cannot delete your own account')
  const user = await User.findByIdAndDelete(req.params.id)
  if (!user) throw new HttpError(404, 'User not found')
  // Leave nothing orphaned behind.
  await Promise.all([
    Search.deleteMany({ user: user._id }),
    Lead.deleteMany({ user: user._id }),
    Usage.deleteMany({ user: user._id }),
    ExportLog.deleteMany({ user: user._id }),
  ])
  res.json({ ok: true })
})

/**
 * Per-user Google API key. Write-only by design: an admin can set or clear it,
 * but no endpoint ever reads one back out.
 */
adminRouter.put('/users/:id/api-key', async (req, res) => {
  const { apiKey } = z.object({ apiKey: z.string().min(10).nullable() }).parse(req.body)
  const user = await User.findByIdAndUpdate(
    req.params.id,
    apiKey ? { $set: { googleApiKey: apiKey } } : { $unset: { googleApiKey: 1 } },
    { new: true },
  )
  if (!user) throw new HttpError(404, 'User not found')
  res.json({ ok: true, hasOwnApiKey: Boolean(apiKey) })
})

/** Usage analytics across the whole install. */
adminRouter.get('/analytics', async (req, res) => {
  const days = Math.min(90, Number(req.query.days) || 30)
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

  const [daily, totals, topUsers, counts] = await Promise.all([
    Usage.aggregate([
      { $match: { day: { $gte: since } } },
      {
        $group: {
          _id: '$day',
          searches: { $sum: '$searches' },
          calls: { $sum: '$calls' },
          costUsd: { $sum: '$costUsd' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Usage.aggregate([
      {
        $group: {
          _id: null,
          searches: { $sum: '$searches' },
          calls: { $sum: '$calls' },
          costUsd: { $sum: '$costUsd' },
        },
      },
    ]),
    Usage.aggregate([
      { $match: { day: { $gte: since } } },
      { $group: { _id: '$user', searches: { $sum: '$searches' }, costUsd: { $sum: '$costUsd' } } },
      { $sort: { costUsd: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $project: { searches: 1, costUsd: 1, email: { $first: '$user.email' } } },
    ]),
    Promise.all([
      User.countDocuments(),
      User.countDocuments({ disabled: true }),
      Lead.countDocuments(),
      Search.countDocuments(),
      ExportLog.countDocuments(),
    ]),
  ])

  const [users, disabledUsers, leads, searches, exports] = counts
  res.json({
    since,
    daily: daily.map((d) => ({ day: d._id, ...d, _id: undefined })),
    totals: totals[0] ?? { searches: 0, calls: 0, costUsd: 0 },
    topUsers,
    counts: { users, disabledUsers, leads, searches, exports },
  })
})

/** Search logs — who searched for what, and what it cost. */
adminRouter.get('/searches', async (req, res) => {
  const q = z
    .object({
      userId: z.string().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(200).default(50),
    })
    .parse(req.query)

  const filter = q.userId ? { user: q.userId } : {}
  const [items, total] = await Promise.all([
    Search.find(filter)
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate('user', 'email')
      .lean(),
    Search.countDocuments(filter),
  ])
  res.json({ items, total, page: q.page, pages: Math.ceil(total / q.limit) })
})

adminRouter.get('/exports', async (_req, res) => {
  const items = await ExportLog.find().sort({ createdAt: -1 }).limit(100).populate('user', 'email').lean()
  res.json({ items })
})
