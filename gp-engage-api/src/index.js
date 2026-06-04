// src/index.js
// Main entry point — sets up Express, middleware, routes, and starts the server.

import 'dotenv/config'
import 'express-async-errors'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'

import { checkDatabaseConnection } from './config/database.js'
import { connectRedis } from './config/redis.js'
import { logger } from './utils/logger.js'

// Routes
import authRoutes     from './routes/auth.js'
import requestRoutes  from './routes/requests.js'
import messageRoutes  from './routes/messages.js'
import practiceRoutes from './routes/practice.js'

const app = express()
const PORT = process.env.PORT || 3000

// ─── Security middleware ──────────────────────────────────────────────────────

// Helmet sets secure HTTP headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:']
    }
  }
}))

// CORS — only allow your frontend origins
app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(','),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}))

// Trust proxy (needed when behind Nginx or cloud load balancer)
app.set('trust proxy', 1)

// ─── Rate limiting ────────────────────────────────────────────────────────────

// Global limit — prevents abuse
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again later' }
})

// Strict limit on auth endpoints — prevents brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts — please wait 15 minutes' }
})

app.use(globalLimiter)

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))

// ─── Request logging ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    logger.info(`${req.method} ${req.path}`, {
      status: res.statusCode,
      duration: `${Date.now() - start}ms`,
      ip: req.ip
    })
  })
  next()
})

// ─── Health check ─────────────────────────────────────────────────────────────
// No auth required — used by load balancers to check the service is alive
app.get('/health', async (req, res) => {
  const dbOk = await checkDatabaseConnection()
  const status = dbOk ? 200 : 503
  res.status(status).json({
    status: dbOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      database: dbOk ? 'connected' : 'unavailable'
    }
  })
})

// ─── API routes ───────────────────────────────────────────────────────────────
app.use('/auth',                  authLimiter, authRoutes)
app.use('/requests',              requestRoutes)
app.use('/requests/:requestId/messages', messageRoutes)
app.use('/practice',              practiceRoutes)

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} does not exist`
  })
})

// ─── Global error handler ─────────────────────────────────────────────────────
// express-async-errors ensures async errors reach this handler automatically
app.use((err, req, res, next) => {
  // PostgreSQL unique violation
  if (err.code === '23505') {
    return res.status(409).json({
      error: 'Conflict',
      message: 'A record with this value already exists'
    })
  }

  // PostgreSQL foreign key violation
  if (err.code === '23503') {
    return res.status(400).json({
      error: 'Invalid reference',
      message: 'A referenced record does not exist'
    })
  }

  logger.error('Unhandled error', {
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method
  })

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  })
})

// ─── Startup ──────────────────────────────────────────────────────────────────
async function start() {
  logger.info('Starting GP Engage API...')

  // Connect to database
  const dbOk = await checkDatabaseConnection()
  if (!dbOk) {
    logger.error('Cannot connect to database — check DATABASE_URL in .env')
    process.exit(1)
  }

  // Connect to Redis (non-fatal if unavailable)
  await connectRedis()

  // Start server
  app.listen(PORT, () => {
    logger.info(`GP Engage API running on port ${PORT}`)
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`)
    logger.info(`Health check: http://localhost:${PORT}/health`)
  })
}

// Handle unhandled promise rejections gracefully
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason })
})

start()
