// src/middleware/auth.js
// Two middleware functions used on every protected route:
//
//   authenticate  — verifies the JWT and attaches user to req
//   requireRole   — checks the user has a permitted role (e.g. 'gp', 'admin')
//
// Every request carries: req.user (decoded token), req.practiceId (for RLS)

import jwt from 'jsonwebtoken'
import { query } from '../config/database.js'
import { logger } from '../utils/logger.js'

// ─── JWT verification ─────────────────────────────────────────────────────────
export async function authenticate(req, res, next) {
  try {
    // 1. Extract token from Authorization header
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorised',
        message: 'No token provided'
      })
    }

    const token = authHeader.split(' ')[1]

    // 2. Verify signature and expiry
    let decoded
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET)
    } catch (err) {
      return res.status(401).json({
        error: 'Unauthorised',
        message: err.name === 'TokenExpiredError'
          ? 'Session expired — please log in again'
          : 'Invalid token'
      })
    }

    // 3. Check session hasn't been revoked (e.g. after staff logout)
    //    We store a hash of the JWT id (jti) in the sessions table
    if (decoded.jti) {
      const sessions = await query(
        `SELECT id FROM sessions
         WHERE token_hash = $1
           AND expires_at > NOW()
           AND revoked_at IS NULL`,
        [decoded.jti]
      )
      if (sessions.length === 0) {
        return res.status(401).json({
          error: 'Unauthorised',
          message: 'Session has been revoked'
        })
      }
    }

    // 4. Attach decoded user to request — available in all downstream handlers
    req.user = decoded
    req.practiceId = decoded.practiceId  // used by database.js for RLS

    next()
  } catch (err) {
    logger.error('Auth middleware error', { error: err.message })
    res.status(500).json({ error: 'Authentication error' })
  }
}

// ─── Role guard ───────────────────────────────────────────────────────────────
// Usage: router.get('/admin-only', authenticate, requireRole('gp', 'practice_manager'), handler)
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorised' })
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `This action requires one of: ${roles.join(', ')}`
      })
    }
    next()
  }
}

// ─── Patient-only guard ───────────────────────────────────────────────────────
export function requirePatient(req, res, next) {
  if (req.user?.type !== 'patient') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Patient access only'
    })
  }
  next()
}

// ─── Token generators (used in auth routes) ───────────────────────────────────
import crypto from 'crypto'

export function generateStaffToken(staffUser) {
  const jti = crypto.randomUUID() // unique token id for revocation
  return {
    token: jwt.sign(
      {
        jti,
        type: 'staff',
        id: staffUser.id,
        practiceId: staffUser.practice_id,
        role: staffUser.role,
        email: staffUser.email,
        name: `${staffUser.first_name} ${staffUser.last_name}`
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    ),
    jti
  }
}

export function generatePatientToken(patient) {
  const jti = crypto.randomUUID()
  return {
    token: jwt.sign(
      {
        jti,
        type: 'patient',
        id: patient.id,
        practiceId: patient.practice_id,
        nhsNumber: patient.nhs_number,
        name: `${patient.first_name} ${patient.last_name}`
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_PATIENT_EXPIRES_IN || '24h' }
    ),
    jti
  }
}
