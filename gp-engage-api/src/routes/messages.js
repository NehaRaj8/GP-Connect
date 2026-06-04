// src/routes/messages.js
// Secure two-way messaging between patients and practice staff.
//
//   POST /requests/:requestId/messages   — send a message
//   GET  /requests/:requestId/messages   — get messages for a request
//   PATCH /messages/:id/read             — mark as read

import { Router } from 'express'
import { query } from '../config/database.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { validate, schemas } from '../middleware/validate.js'
import { auditLog } from '../middleware/audit.js'

const router = Router({ mergeParams: true }) // mergeParams for :requestId
router.use(authenticate)

// ─── Send a message ───────────────────────────────────────────────────────────
router.post('/', validate(schemas.sendMessage), async (req, res) => {
  const { requestId } = req.params
  const { body, is_internal = false } = req.body
  const { type, id: userId } = req.user

  // Patients cannot send internal notes
  if (type === 'patient' && is_internal) {
    return res.status(403).json({ error: 'Patients cannot send internal notes' })
  }

  // Verify the request exists and belongs to this practice
  const requests = await query(
    `SELECT id, patient_id, status FROM consultation_requests
     WHERE id = $1 AND practice_id = $2`,
    [requestId, req.practiceId],
    req.practiceId
  )

  if (!requests.length) {
    return res.status(404).json({ error: 'Request not found' })
  }

  const request = requests[0]

  // Patients can only message on their own requests
  if (type === 'patient' && request.patient_id !== userId) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  // Don't allow messages on resolved/cancelled requests
  if (['resolved', 'cancelled'].includes(request.status) && type === 'patient') {
    return res.status(400).json({
      error: 'This request is closed. Please submit a new request.'
    })
  }

  const rows = await query(
    `INSERT INTO messages (
       request_id, sender_type, sender_patient_id, sender_staff_id,
       body, is_internal
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, body, sender_type, is_internal, created_at`,
    [
      requestId,
      type,
      type === 'patient' ? userId : null,
      type === 'staff' ? userId : null,
      body,
      is_internal
    ],
    req.practiceId
  )

  // If patient sends a message, update request status to prompt staff action
  if (type === 'patient' && request.status === 'awaiting_patient') {
    await query(
      `UPDATE consultation_requests SET status = 'in_progress' WHERE id = $1`,
      [requestId],
      req.practiceId
    )
  }

  await auditLog({
    practiceId: req.practiceId,
    action: 'create',
    entityType: 'messages',
    entityId: rows[0].id,
    actorType: type,
    actorPatientId: type === 'patient' ? userId : null,
    actorStaffId: type === 'staff' ? userId : null,
    req
  })

  res.status(201).json({ message: rows[0] })
})

// ─── Get messages for a request ───────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { requestId } = req.params
  const { type } = req.user

  const rows = await query(
    `SELECT m.id, m.body, m.sender_type, m.is_internal,
            m.read_by_patient_at, m.read_by_staff_at, m.created_at,
            COALESCE(
              p.first_name || ' ' || p.last_name,
              su.first_name || ' ' || su.last_name,
              'System'
            ) AS sender_name
     FROM messages m
     LEFT JOIN patients p ON p.id = m.sender_patient_id
     LEFT JOIN staff_users su ON su.id = m.sender_staff_id
     WHERE m.request_id = $1
       AND m.deleted_at IS NULL
       ${type === 'patient' ? 'AND m.is_internal = false' : ''}
     ORDER BY m.created_at ASC`,
    [requestId],
    req.practiceId
  )

  // Mark unread messages as read
  if (type === 'patient') {
    await query(
      `UPDATE messages SET read_by_patient_at = NOW()
       WHERE request_id = $1 AND read_by_patient_at IS NULL
         AND sender_type = 'staff'`,
      [requestId],
      req.practiceId
    )
  } else {
    await query(
      `UPDATE messages SET read_by_staff_at = NOW()
       WHERE request_id = $1 AND read_by_staff_at IS NULL
         AND sender_type = 'patient'`,
      [requestId],
      req.practiceId
    )
  }

  res.json({ messages: rows })
})

export default router
