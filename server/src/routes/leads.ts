import { Router } from 'express'
import { z } from 'zod'
import { Lead } from '../db/models.js'
import { requireAuth } from '../lib/auth.js'
import { HttpError } from '../lib/google.js'

export const leadsRouter = Router()
leadsRouter.use(requireAuth)

/**
 * The user's own ledger — every business ever seen, deduped by place_id.
 * `saved: true` is the curated subset they explicitly bookmarked.
 */
leadsRouter.get('/', async (req, res) => {
  const q = z
    .object({
      saved: z.enum(['true', 'false']).optional(),
      search: z.string().trim().optional(),
      minScore: z.coerce.number().optional(),
      hasWebsite: z.enum(['true', 'false']).optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(200).default(50),
    })
    .parse(req.query)

  const filter: Record<string, unknown> = { user: req.user!.id }
  if (q.saved) filter.saved = q.saved === 'true'
  if (q.minScore != null) filter.leadScore = { $gte: q.minScore }
  if (q.hasWebsite === 'true') filter.website = { $nin: [null, ''] }
  if (q.hasWebsite === 'false') filter.website = { $in: [null, ''] }
  // Anchored regex so the index can still help; a leading .* would table-scan.
  if (q.search) filter.name = { $regex: `^${escapeRegex(q.search)}`, $options: 'i' }

  const [items, total] = await Promise.all([
    Lead.find(filter)
      .sort({ leadScore: -1, reviews: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    Lead.countDocuments(filter),
  ])

  res.json({ items, total, page: q.page, pages: Math.ceil(total / q.limit) })
})

const SaveBody = z.object({
  placeIds: z.array(z.string()).min(1),
  saved: z.boolean().default(true),
  notes: z.string().max(2000).optional(),
})

leadsRouter.post('/save', async (req, res) => {
  const { placeIds, saved, notes } = SaveBody.parse(req.body)
  const update: Record<string, unknown> = { saved }
  if (notes !== undefined) update.notes = notes

  const result = await Lead.updateMany(
    { user: req.user!.id, placeId: { $in: placeIds } },
    { $set: update },
  )
  res.json({ matched: result.matchedCount, modified: result.modifiedCount })
})

leadsRouter.delete('/:placeId', async (req, res) => {
  const result = await Lead.deleteOne({ user: req.user!.id, placeId: req.params.placeId })
  if (!result.deletedCount) throw new HttpError(404, 'Lead not found')
  res.json({ ok: true })
})

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
