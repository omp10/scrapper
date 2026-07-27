import { Router } from 'express'
import { z } from 'zod'
import env from '../config.js'
import { User } from '../db/models.js'
import { HttpError } from '../lib/google.js'
import {
  hashPassword,
  verifyPassword,
  issueTokens,
  clearTokens,
  userFromRefreshCookie,
  requireAuth,
  type AuthUser,
} from '../lib/auth.js'

export const authRouter = Router()

const Credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Use at least 8 characters'),
  name: z.string().trim().max(80).optional(),
})

const toAuthUser = (u: {
  _id: unknown
  email: string
  role: string
  plan: string
}): AuthUser => ({ id: String(u._id), email: u.email, role: u.role as AuthUser['role'], plan: u.plan })

authRouter.post('/register', async (req, res) => {
  const { email, password, name } = Credentials.parse(req.body)

  if (await User.exists({ email: email.toLowerCase() })) {
    throw new HttpError(409, 'That email is already registered')
  }

  const user = await User.create({
    email,
    name,
    passwordHash: await hashPassword(password),
    // Bootstrap: a fresh install needs one admin, and it can't come from the UI.
    role: env.ADMIN_EMAIL && email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase() ? 'admin' : 'user',
  })

  res.status(201).json(issueTokens(res, toAuthUser(user)))
})

authRouter.post('/login', async (req, res) => {
  const { email, password } = Credentials.parse(req.body)
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash')

  // Same message and the same work either way — don't leak which emails exist.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new HttpError(401, 'Incorrect email or password')
  }
  if (user.disabled) throw new HttpError(403, 'This account has been disabled')

  user.lastLoginAt = new Date()
  await user.save()

  res.json(issueTokens(res, toAuthUser(user)))
})

/** Silent refresh: the client calls this when an access token expires. */
authRouter.post('/refresh', async (req, res) => {
  const user = await userFromRefreshCookie(req.cookies?.refresh)
  res.json(issueTokens(res, user))
})

authRouter.post('/logout', (_req, res) => {
  clearTokens(res)
  res.json({ ok: true })
})

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user!.id)
  if (!user) throw new HttpError(401, 'Account no longer exists')
  res.json(user.toJSON())
})
