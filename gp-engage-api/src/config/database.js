// src/config/database.js
// PostgreSQL connection pool — points at Supabase (or any PostgreSQL)
// The rest of the app never imports 'pg' directly; always use this module.

import pg from 'pg'
import { logger } from '../utils/logger.js'

const { Pool } = pg

// Connection pool — reuses connections rather than opening a new one per query.
// Supabase supports up to 60 direct connections on the free tier.
// Pool size of 10 leaves headroom for other connections (Supabase dashboard, migrations).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,                  // max simultaneous connections
  idleTimeoutMillis: 30000, // close idle connections after 30s
  connectionTimeoutMillis: 5000, // fail fast if can't connect within 5s
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: true }  // enforce SSL cert verification in prod
    : { rejectUnauthorized: false } // Supabase dev still needs SSL but relaxed
})

// Log connection events
pool.on('connect', () => {
  logger.debug('New database connection established')
})

pool.on('error', (err) => {
  logger.error('Unexpected database error', { error: err.message })
})

// ─── Core query helper ────────────────────────────────────────────────────────
// All queries go through this function. It:
//   1. Sets the practice_id session variable (Row-Level Security enforcement)
//   2. Runs your query
//   3. Returns rows directly so callers don't need to unwrap .rows every time
//
// USAGE:
//   const rows = await query('SELECT * FROM consultation_requests WHERE id = $1', [id], practiceId)

export async function query(text, params = [], practiceId = null) {
  const client = await pool.connect()
  try {
    // Set practice context for Row-Level Security
    // This ensures a GP from practice A can NEVER accidentally see practice B's data
    if (practiceId) {
      await client.query(
        `SET LOCAL app.current_practice_id = '${practiceId}'`
      )
    }
    const result = await client.query(text, params)
    return result.rows
  } catch (err) {
    logger.error('Database query error', {
      query: text,
      error: err.message,
      code: err.code
    })
    throw err
  } finally {
    client.release() // always return connection to pool
  }
}

// ─── Transaction helper ───────────────────────────────────────────────────────
// Use this when multiple queries must succeed or fail together.
// Example: resolving a consultation (update request + insert message + log audit)
//
// USAGE:
//   await transaction(async (client) => {
//     await client.query('UPDATE consultation_requests SET status = $1 WHERE id = $2', ['resolved', id])
//     await client.query('INSERT INTO audit_log ...', [...])
//   }, practiceId)

export async function transaction(fn, practiceId = null) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    if (practiceId) {
      await client.query(
        `SET LOCAL app.current_practice_id = '${practiceId}'`
      )
    }

    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    logger.error('Transaction rolled back', { error: err.message })
    throw err
  } finally {
    client.release()
  }
}

// ─── Health check ─────────────────────────────────────────────────────────────
export async function checkDatabaseConnection() {
  try {
    const rows = await query('SELECT NOW() as time')
    logger.info('Database connected', { time: rows[0].time })
    return true
  } catch (err) {
    logger.error('Database connection failed', { error: err.message })
    return false
  }
}

export default pool
