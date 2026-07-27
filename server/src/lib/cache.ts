import Redis from 'ioredis'
import env from '../config.js'

/**
 * Redis when REDIS_URL is set, otherwise an in-process Map so the app runs
 * with zero infrastructure. Same two methods either way.
 *
 * ponytail: the Map fallback is per-process and unbounded. Fine for dev and a
 * single node; set REDIS_URL before running more than one instance.
 */

const redis = env.REDIS_URL ? new Redis(env.REDIS_URL) : null
const memory = new Map<string, { value: string; expiresAt: number }>()

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (redis) {
    const raw = await redis.get(key)
    return raw ? (JSON.parse(raw) as T) : null
  }
  const hit = memory.get(key)
  if (!hit) return null
  if (hit.expiresAt < Date.now()) {
    memory.delete(key)
    return null
  }
  return JSON.parse(hit.value) as T
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = env.CACHE_TTL_SECONDS) {
  const raw = JSON.stringify(value)
  if (redis) {
    await redis.set(key, raw, 'EX', ttlSeconds)
    return
  }
  memory.set(key, { value: raw, expiresAt: Date.now() + ttlSeconds * 1000 })
}

export const cacheBackend = redis ? 'redis' : 'memory'
