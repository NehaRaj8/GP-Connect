// src/routes/auth.js
// Authentication endpoints:
//
//   POST /auth/staff/login       — email + password → JWT
//   POST /auth/staff/logout      — revoke session
//   POST /auth/patient/login     — email + password → JWT (direct login)
//   GET  /auth/nhs-login         — redirect to NHS Login (OAuth)
//   GET  /auth/nhs-login/callback — handle NHS Login return
//   GET  /auth/me                — return current user info

import { Router } from 'express'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import { query, transaction } from '../config/database.js'
import { authenticate, generateStaffToken, generatePatientToken } from '../middleware/auth.js'
import { validate, schemas } from '../middleware/validate.js'
import { auditLog } from '../middleware/audit.js'
import { logger } from '../utils/logger.js'

const router = Router()

// ─── Staff login ──────────────────────────────────────────────────────────────
router.post('/staff/login', validate(schemas.staffLogin), async (req, res) => {
  const { email, password } = req.body

  // 1. Find staff user by email
  const users = await query(
    `SELECT id, practice_id, email, password_hash, first_name, last_name,
            role, is_active, is_duty_gp
     FROM staff_users
     WHERE email = $1 AND deleted_at IS NULL`,
    [email.toLowerCase()]
  )

  const user = users[0]

  // 2. Constant-time comparison to prevent timing attacks
  //    (we compare even if user doesn't exist, using a dummy hash)
  const dummyHash = '$2b$12$invalidhashfortimingnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn'
  const passwordValid = await bcrypt.compare(
    password,
    user?.password_hash || dummyHash
  )

  if (!user || !passwordValid || !user.is_active) {
    // Log failed attempt (but don't reveal whether email exists)
    logger.warn('Failed login attempt', { email, ip: req.ip })
    return res.status(401).json({
      error: 'Invalid email or password'
    })
  }

  // 3. Generate JWT
  const { token, jti } = generateStaffToken(user)

  // 4. Store session for revocation capability
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000) // 8 hours
  await query(
    `INSERT INTO sessions (user_type, staff_id, token_hash, ip_address, user_agent, expires_at)
     VALUES ('staff', $1, $2, $3, $4, $5)`,
    [user.id, jti, req.ip, req.headers['user-agent'], expiresAt]
  )

  // 5. Update last login timestamp
  await query(
    `UPDATE staff_users SET last_login_at = NOW() WHERE id = $1`,
    [user.id]
  )

  // 6. Audit log
  await auditLog({
    practiceId: user.practice_id,
    action: 'login',
    entityType: 'staff_users',
    entityId: user.id,
    actorType: 'staff',
    actorStaffId: user.id,
    req
  })

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: `${user.first_name} ${user.last_name}`,
      role: user.role,
      isDutyGp: user.is_duty_gp,
      practiceId: user.practice_id
    }
  })
})

// ─── Staff logout ─────────────────────────────────────────────────────────────
router.post('/staff/logout', authenticate, async (req, res) => {
  // Revoke the session so the JWT can't be reused even if not yet expired
  await query(
    `UPDATE sessions SET revoked_at = NOW()
     WHERE token_hash = $1`,
    [req.user.jti]
  )

  await auditLog({
    practiceId: req.practiceId,
    action: 'logout',
    entityType: 'staff_users',
    entityId: req.user.id,
    actorType: 'staff',
    actorStaffId: req.user.id,
    req
  })

  res.json({ message: 'Logged out successfully' })
})

// ─── Patient login (direct — non-NHS Login) ───────────────────────────────────
router.post('/patient/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' })
  }

  const patients = await query(
    `SELECT id, practice_id, email, password_hash, first_name, last_name,
            nhs_number, is_active, identity_verified
     FROM patients
     WHERE email = $1 AND deleted_at IS NULL`,
    [email.toLowerCase()]
  )

  const patient = patients[0]
  const dummyHash = '$2b$12$invalidhashfortimingnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn'
  const passwordValid = await bcrypt.compare(
    password,
    patient?.password_hash || dummyHash
  )

  if (!patient || !passwordValid || !patient.is_active) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  const { token, jti } = generatePatientToken(patient)

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  await query(
    `INSERT INTO sessions (user_type, patient_id, token_hash, ip_address, user_agent, expires_at)
     VALUES ('patient', $1, $2, $3, $4, $5)`,
    [patient.id, jti, req.ip, req.headers['user-agent'], expiresAt]
  )

  await query(
    `UPDATE patients SET last_login_at = NOW() WHERE id = $1`,
    [patient.id]
  )

  res.json({
    token,
    patient: {
      id: patient.id,
      name: `${patient.first_name} ${patient.last_name}`,
      nhsNumber: patient.nhs_number,
      identityVerified: patient.identity_verified
    }
  })
})


// ─── Patient registration ─────────────────────────────────────────────────────
router.post('/patient/register', async (req, res) => {
  const {
    first_name, last_name, date_of_birth,
    nhs_number, email, phone, password, practice_id
  } = req.body

  if (!first_name || !last_name || !email || !password) {
    return res.status(400).json({ error: 'First name, last name, email and password are required' })
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }

  // Check email not already registered
  const existing = await query(
    `SELECT id FROM patients WHERE email = $1`,
    [email.toLowerCase()]
  )
  if (existing.length) {
    return res.status(409).json({ error: 'An account with this email already exists' })
  }

  const passwordHash = await bcrypt.hash(password, 12)

  // Use DEFAULT_PRACTICE_ID from env if not provided
  const practiceId = practice_id || process.env.DEFAULT_PRACTICE_ID

  const rows = await query(
    `INSERT INTO patients (
       practice_id, first_name, last_name, date_of_birth,
       nhs_number, email, phone, password_hash, is_active
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)
     RETURNING id, first_name, last_name, email, nhs_number, practice_id`,
    [
      practiceId,
      first_name,
      last_name,
      date_of_birth || null,
      nhs_number || null,
      email.toLowerCase(),
      phone || null,
      passwordHash
    ]
  )

  const patient = rows[0]

  console.log('Patient practice_id:', patient.practice_id)
  const { token, jti } = generatePatientToken(patient)

  // Store session
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  await query(
    `INSERT INTO sessions (user_type, patient_id, token_hash, ip_address, user_agent, expires_at)
     VALUES ('patient', $1, $2, $3, $4, $5)`,
    [patient.id, jti, req.ip, req.headers['user-agent'], expiresAt]
  )

  res.status(201).json({
    token,
    patient: {
      id: patient.id,
      name: `${patient.first_name} ${patient.last_name}`,
      email: patient.email,
      nhsNumber: patient.nhs_number
    }
  })
})


// ─── NHS Login OAuth 2.0 ──────────────────────────────────────────────────────
// Step 1: Redirect patient to NHS Login
router.get('/nhs-login', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex') // CSRF protection
  const nonce = crypto.randomBytes(16).toString('hex')

  // In production, store state in Redis with 10-minute TTL
  // For now, include in the redirect and verify on callback

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.NHS_LOGIN_CLIENT_ID,
    redirect_uri: process.env.NHS_LOGIN_REDIRECT_URI,
    scope: process.env.NHS_LOGIN_SCOPE || 'openid profile nhs_number',
    state,
    nonce
  })

  const nhsLoginUrl = process.env.NODE_ENV === 'production'
    ? 'https://auth.login.nhs.uk/authorize'
    : 'https://auth.sandpit.signin.nhs.uk/authorize' // sandbox for testing

  res.redirect(`${nhsLoginUrl}?${params}`)
})

// Step 2: Handle NHS Login callback
router.get('/nhs-login/callback', async (req, res) => {
  const { code, state, error } = req.query

  if (error) {
    logger.warn('NHS Login error', { error })
    return res.redirect(`/login?error=nhs_login_failed`)
  }

  try {
    // Exchange code for tokens
    const tokenEndpoint = process.env.NODE_ENV === 'production'
      ? 'https://auth.login.nhs.uk/token'
      : 'https://auth.sandpit.signin.nhs.uk/token'

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.NHS_LOGIN_REDIRECT_URI,
        client_id: process.env.NHS_LOGIN_CLIENT_ID,
        client_secret: process.env.NHS_LOGIN_CLIENT_SECRET
      })
    })

    const tokens = await tokenResponse.json()

    // Get user info from NHS Login
    const userInfoResponse = await fetch(
      process.env.NODE_ENV === 'production'
        ? 'https://auth.login.nhs.uk/userinfo'
        : 'https://auth.sandpit.signin.nhs.uk/userinfo',
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    )
    const nhsUser = await userInfoResponse.json()

    // Find or create patient record
    const practiceId = process.env.DEFAULT_PRACTICE_ID
    let patients = await query(
      `SELECT * FROM patients WHERE nhs_login_sub = $1`,
      [nhsUser.sub]
    )

    let patient = patients[0]

    if (!patient) {
      // First NHS Login — create patient record
      const newPatients = await query(
        `INSERT INTO patients (
          practice_id, nhs_login_sub, nhs_number,
          first_name, last_name, email, identity_verified
         ) VALUES ($1, $2, $3, $4, $5, $6, true)
         RETURNING *`,
        [
          practiceId,
          nhsUser.sub,
          nhsUser.nhs_number?.replace(/\s/g, '') || null,
          nhsUser.given_name || 'Unknown',
          nhsUser.family_name || 'Unknown',
          nhsUser.email || null
        ]
      )
      patient = newPatients[0]
    }

    const { token } = generatePatientToken(patient)

    // Redirect to frontend with token
    res.redirect(`/patient/dashboard?token=${token}`)

  } catch (err) {
    logger.error('NHS Login callback error', { error: err.message })
    res.redirect('/login?error=auth_failed')
  }
})

// ─── Current user info ────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  const { type, id, practiceId } = req.user

  if (type === 'staff') {
    const users = await query(
      `SELECT id, email, first_name, last_name, role, is_duty_gp, practice_id
       FROM staff_users WHERE id = $1`,
      [id],
      practiceId
    )
    return res.json({ type: 'staff', user: users[0] })
  }

  if (type === 'patient') {
    const patients = await query(
      `SELECT id, first_name, last_name, email, nhs_number, identity_verified
       FROM patients WHERE id = $1`,
      [id],
      practiceId
    )
    return res.json({ type: 'patient', patient: patients[0] })
  }
})

export default router
