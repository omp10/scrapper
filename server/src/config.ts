import 'dotenv/config'
import { z } from 'zod'

const env = z
  .object({
    GOOGLE_MAPS_API_KEY: z.string().min(1, 'GOOGLE_MAPS_API_KEY is required'),
    PORT: z.coerce.number().default(4000),
    REDIS_URL: z.string().optional(),
    CACHE_TTL_SECONDS: z.coerce.number().default(30 * 24 * 60 * 60),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    MONGO_URI: z.string().optional(),
    // Dev-only defaults. Production must set real secrets — see the check below.
    JWT_SECRET: z.string().min(16).default('dev-only-access-secret-change-me'),
    JWT_REFRESH_SECRET: z.string().min(16).default('dev-only-refresh-secret-change-me'),
    /** Email promoted to admin on signup. First real user of a fresh install. */
    ADMIN_EMAIL: z.string().email().optional(),
  })
  .parse(process.env)

// Shipping the dev secrets to production would let anyone mint a valid admin
// token. Fail at boot rather than at breach.
if (env.NODE_ENV === 'production') {
  for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    if (env[key].startsWith('dev-only-')) {
      throw new Error(`${key} must be set to a real secret in production`)
    }
  }
}

export default env

/**
 * Google Maps Platform list prices, USD per 1000 requests.
 * Correct these against your own billing console — SKU pricing changes and
 * varies by contract. Everything downstream reads from here.
 */
export const PRICING = {
  // Places API (New): the SKU billed is decided by the most expensive field in
  // the field mask, not by the endpoint. One request = one billable call
  // regardless of how many places come back in it.
  search: {
    essentials: 0,
    pro: 32,
    enterprise: 35,
    enterprisePlus: 40,
  },
  geocoding: 5,
} as const
