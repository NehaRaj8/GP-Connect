// src/config/redis.js
// Redis client for session caching and notification queues.
// If REDIS_URL is not set (local dev without Redis), all cache operations
// are no-ops — the app still works, just without caching.

import { createClient } from 'redis'
import { logger } from '../utils/logger.js'

let client = null
let isConnected = false

export async function connectRedis() {
  if (!process.env.REDIS_URL) {
    logger.warn('REDIS_URL not set — running without cache. Fine for development.')
    return null
  }

  client = createClient({ url: process.env.REDIS_URL })

  client.on('error', (err) => {
    logger.error('Redis error', { error: err.message })
    isConnected = false
  })

  client.on('connect', () => {
    logger.info('Redis connected')
    isConnected = true
  })

  await client.connect()
  return client
}

// ─── Cache helpers ────────────────────────────────────────────────────────────
// Safe wrappers — if Redis is unavailable, return null rather than crashing.

export async function cacheGet(key) {
  if (!isConnected || !client) return null
  try {
    const value = await client.get(key)
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

export async function cacheSet(key, value, ttlSeconds = 300) {
  if (!isConnected || !client) return
  try {
    await client.setEx(key, ttlSeconds, JSON.stringify(value))
  } catch {
    // Cache failure is non-fatal — query will just hit the database
  }
}

export async function cacheDel(key) {
  if (!isConnected || !client) return
  try {
    await client.del(key)
  } catch {}
}

// Pattern delete — e.g. invalidate all keys starting with "practice:abc123:"
export async function cacheDelPattern(pattern) {
  if (!isConnected || !client) return
  try {
    const keys = await client.keys(pattern)
    if (keys.length > 0) await client.del(keys)
  } catch {}
}

export { client }
