import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import type { RequestHandler, Response } from 'express'
import env from '../config.js'
import { User, type Role } from '../db/models.js'
import { HttpError } from './google.js'

/**
 * Access token in memory (short-lived, sent as a Bearer header), refresh token
 * in an httpOnly cookie. JS can't read the refresh token, so an XSS bug can't
 * walk away with a long-lived credential.
 */

const ACCESS_TTL = '15m'
const REFRESH_TTL_DAYS = 30

export interface AuthUser {
  id: string
  email: string
  role: Role
  plan: string
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12)
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash)

function sign(payload: object, secret: string, expiresIn: string) {
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions)
}

export function issueTokens(res: Response, user: AuthUser) {
  const accessToken = sign(user, env.JWT_SECRET, ACCESS_TTL)
  const refreshToken = sign({ id: user.id }, env.JWT_REFRESH_SECRET, `${REFRESH_TTL_DAYS}d`)

  res.cookie('refresh', refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  })
  return { accessToken, user }
}

export function clearTokens(res: Response) {
  res.clearCookie('refresh', { path: '/api/auth' })
}

/** Resolve a refresh cookie back to a live, non-disabled user. */
export async function userFromRefreshCookie(token?: string): Promise<AuthUser> {
  if (!token) throw new HttpError(401, 'Not signed in')
  let decoded: { id: string }
  try {
    decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as { id: string }
  } catch {
    throw new HttpError(401, 'Session expired — sign in again')
  }
  const user = await User.findById(decoded.id)
  if (!user || user.disabled) throw new HttpError(401, 'Account unavailable')
  return { id: String(user._id), email: user.email, role: user.role as Role, plan: user.plan }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Sign in to continue')
  try {
    req.user = jwt.verify(header.slice(7), env.JWT_SECRET) as AuthUser
    next()
  } catch {
    // The client sees 401 and silently refreshes rather than logging the user out.
    throw new HttpError(401, 'Access token expired')
  }
}

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== 'admin') throw new HttpError(403, 'Admin only')
  next()
}
