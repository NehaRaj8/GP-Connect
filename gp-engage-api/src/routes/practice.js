// src/routes/practice.js
// Practice management endpoints for practice managers.
//
//   GET  /practice                   — practice details + current demand
//   PATCH /practice/demand           — update request limits
//   GET  /practice/demand/today      — today's request counts vs limits
//   GET  /practice/staff             — list staff users
//   POST /practice/staff             — create staff user
//   PATCH /practice/staff/:id/duty   — toggle duty GP flag

import { Router } from 'express'
import bcrypt from 'bcrypt'
import { query } from '../config/database.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { validate, schemas } from '../middleware/validate.js'
import { auditLog } from '../middleware/audit.js'
import { z } from 'zod'

const router = Router()
router.use(authenticate)
router.use(requireRole('gp', 'practice_manager', 'admin'))

// ─── Practice details ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const practices = await query(
    `SELECT id, name, ods_code, address_line1, city, postcode,
            phone, email, opening_hours,
            medical_request_limit, admin_request_limit,
            requests_enabled, override_message, clinical_system
     FROM practices WHERE id = $1`,
    [req.practiceId]
  )

  if (!practices.length) {
    return res.status(404).json({ error: 'Practice not found' })
  }

  // Get today's demand counts
  const demand = await query(
    `SELECT request_type, request_count, limit_at_time, limit_hit_at
     FROM demand_log
     WHERE practice_id = $1 AND log_date = CURRENT_DATE`,
    [req.practiceId]
  )

  res.json({
    practice: practices[0],
    todayDemand: demand
  })
})

// ─── Update demand limits ─────────────────────────────────────────────────────
router.patch('/demand',
  validate(schemas.updateDemandLimits),
  async (req, res) => {
    const {
      medical_request_limit,
      admin_request_limit,
      requests_enabled,
      override_message
    } = req.body

    const rows = await query(
      `UPDATE practices
       SET medical_request_limit = $1,
           admin_request_limit = $2,
           requests_enabled = $3,
           override_message = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING medical_request_limit, admin_request_limit,
                 requests_enabled, override_message`,
      [
        medical_request_limit,
        admin_request_limit,
        requests_enabled,
        override_message ?? null,
        req.practiceId
      ]
    )

    await auditLog({
      practiceId: req.practiceId,
      action: 'update',
      entityType: 'practices',
      entityId: req.practiceId,
      actorType: 'staff',
      actorStaffId: req.user.id,
      newValues: req.body,
      req
    })

    res.json({ settings: rows[0] })
  }
)

// ─── Today's demand dashboard ─────────────────────────────────────────────────
router.get('/demand/today', async (req, res) => {
  const practice = await query(
    `SELECT medical_request_limit, admin_request_limit, requests_enabled
     FROM practices WHERE id = $1`,
    [req.practiceId]
  )

  const demand = await query(
    `SELECT request_type, request_count, limit_at_time
     FROM demand_log
     WHERE practice_id = $1 AND log_date = CURRENT_DATE`,
    [req.practiceId]
  )

  // Build a clear summary
  const counts = {}
  demand.forEach(d => { counts[d.request_type] = d.request_count })

  const p = practice[0]
  res.json({
    requestsEnabled: p.requests_enabled,
    medical: {
      count: counts.medical || 0,
      limit: p.medical_request_limit,
      percentUsed: p.medical_request_limit > 0
        ? Math.round((counts.medical || 0) / p.medical_request_limit * 100)
        : 0
    },
    admin: {
      count: counts.admin || 0,
      limit: p.admin_request_limit,
      percentUsed: p.admin_request_limit > 0
        ? Math.round((counts.admin || 0) / p.admin_request_limit * 100)
        : 0
    }
  })
})

// ─── List staff ───────────────────────────────────────────────────────────────
router.get('/staff', async (req, res) => {
  const staff = await query(
    `SELECT id, email, first_name, last_name, role, is_active,
            is_duty_gp, last_login_at, created_at
     FROM staff_users
     WHERE practice_id = $1 AND deleted_at IS NULL
     ORDER BY role, last_name`,
    [req.practiceId]
  )

  res.json({ staff })
})

// ─── Create staff user ────────────────────────────────────────────────────────
const createStaffSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(12, 'Staff passwords must be at least 12 characters'),
    first_name: z.string().min(1),
    last_name: z.string().min(1),
    role: z.enum(['gp', 'nurse', 'advanced_practitioner', 'receptionist', 'practice_manager', 'admin']),
    gmc_number: z.string().optional()
  })
})

router.post('/staff', validate(createStaffSchema), async (req, res) => {
  const { email, password, first_name, last_name, role, gmc_number } = req.body

  // Check email not already in use
  const existing = await query(
    `SELECT id FROM staff_users WHERE email = $1`,
    [email.toLowerCase()]
  )
  if (existing.length) {
    return res.status(409).json({ error: 'Email already registered' })
  }

  const passwordHash = await bcrypt.hash(password, 12)

  const rows = await query(
    `INSERT INTO staff_users (
       practice_id, email, password_hash, first_name, last_name, role, gmc_number
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, email, first_name, last_name, role, created_at`,
    [req.practiceId, email.toLowerCase(), passwordHash, first_name, last_name, role, gmc_number ?? null]
  )

  await auditLog({
    practiceId: req.practiceId,
    action: 'create',
    entityType: 'staff_users',
    entityId: rows[0].id,
    actorType: 'staff',
    actorStaffId: req.user.id,
    newValues: { email, role },
    req
  })

  res.status(201).json({ user: rows[0] })
})

// ─── Toggle duty GP ───────────────────────────────────────────────────────────
router.patch('/staff/:id/duty', async (req, res) => {
  const { id } = req.params
  const { is_duty_gp } = req.body

  if (typeof is_duty_gp !== 'boolean') {
    return res.status(400).json({ error: 'is_duty_gp must be a boolean' })
  }

  // If setting as duty, clear any existing duty GP first
  if (is_duty_gp) {
    await query(
      `UPDATE staff_users SET is_duty_gp = false WHERE practice_id = $1`,
      [req.practiceId]
    )
  }

  const rows = await query(
    `UPDATE staff_users SET is_duty_gp = $1
     WHERE id = $2 AND practice_id = $3
     RETURNING id, first_name, last_name, is_duty_gp`,
    [is_duty_gp, id, req.practiceId]
  )

  if (!rows.length) {
    return res.status(404).json({ error: 'Staff member not found' })
  }

  res.json({ user: rows[0] })
})

export default router
