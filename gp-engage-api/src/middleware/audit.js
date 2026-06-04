// src/middleware/audit.js
// NHS DSP Toolkit requires a full, immutable audit trail of all access
// to patient data. This module provides:
//
//   auditLog(action, entityType, entityId, extra)
//     — call this inside any controller that reads or writes patient data
//
//   autoAudit(action, entityType)
//     — middleware that logs automatically after the route completes

import { query } from '../config/database.js'
import { logger } from '../utils/logger.js'

// ─── Core audit writer ────────────────────────────────────────────────────────
// Called directly from controllers for full control over what is logged.
// audit_log rows are never updated or deleted — append only.

export async function auditLog({
  practiceId,
  action,
  entityType,
  entityId = null,
  actorType,
  actorPatientId = null,
  actorStaffId = null,
  oldValues = null,
  newValues = null,
  req = null
}) {
  try {
    await query(
      `INSERT INTO audit_log (
        practice_id, action, entity_type, entity_id,
        actor_type, actor_patient_id, actor_staff_id,
        old_values, new_values,
        ip_address, user_agent
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        practiceId,
        action,
        entityType,
        entityId,
        actorType,
        actorPatientId,
        actorStaffId,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        req?.ip ?? null,
        req?.headers?.['user-agent'] ?? null
      ]
    )
  } catch (err) {
    // Audit failures are logged but never allowed to break the main request
    logger.error('Audit log write failed', {
      error: err.message,
      action,
      entityType,
      entityId
    })
  }
}

// ─── Convenience wrapper for staff actions ────────────────────────────────────
export function staffAudit(action, entityType) {
  return async (req, res, next) => {
    // Store original json method so we can intercept the response
    const originalJson = res.json.bind(res)

    res.json = function (data) {
      // After response is sent, write audit log
      const entityId = req.params?.id || data?.id || null
      auditLog({
        practiceId: req.practiceId,
        action,
        entityType,
        entityId,
        actorType: 'staff',
        actorStaffId: req.user?.id,
        req
      })
      return originalJson(data)
    }

    next()
  }
}
