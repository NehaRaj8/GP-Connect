// src/routes/requests.js
// Consultation request endpoints — the core workflow of the platform.
//
// Patient routes:
//   POST   /requests                    — submit a new request
//   GET    /requests/mine               — patient's own requests
//   GET    /requests/:id                — single request detail
//   DELETE /requests/:id                — patient cancels a request
//
// Staff routes:
//   GET    /requests                    — inbox (all practice requests)
//   GET    /requests/alerts             — urgent/alerted requests only
//   PATCH  /requests/:id/status         — update status, assign, add notes
//   PATCH  /requests/:id/assign         — assign to a clinician
//   PATCH  /requests/:id/acknowledge-alert — duty GP acknowledges alert

import { Router } from 'express'
import { query, transaction } from '../config/database.js'
import { authenticate, requireRole, requirePatient } from '../middleware/auth.js'
import { validate, schemas } from '../middleware/validate.js'
import { auditLog, staffAudit } from '../middleware/audit.js'
import { checkDemandLimits } from '../services/demand.js'
import { triggerAlertNotification } from '../services/notifications.js'
import { logger } from '../utils/logger.js'
import { z } from 'zod'

const router = Router()

// All routes require authentication
router.use(authenticate)

// ─── PATIENT: Submit new request ──────────────────────────────────────────────
router.post('/', validate(schemas.createRequest), async (req, res) => {
  const { request_type, presenting_complaint, triage_responses } = req.body
  const patientId = req.user.id
  const practiceId = req.practiceId

  // 1. Check demand limits — are we at capacity?
  const atCapacity = await checkDemandLimits(practiceId, request_type)
  if (atCapacity) {
    return res.status(503).json({
      error: 'Practice at capacity',
      message: atCapacity.message || 'The practice cannot accept new requests right now. Please try again later or call reception.'
    })
  }

  // 2. Run triage — score severity and check for alert conditions
  const { severity, hasAlert, alertReason } = scoreTriage(triage_responses || [])

  // 3. Create request and triage responses in one transaction
  const request = await transaction(async (client) => {
    // Insert the consultation request
    const requests = await client.query(
      `INSERT INTO consultation_requests (
         practice_id, patient_id, request_type, status, severity,
         presenting_complaint, has_alert, alert_reason, response_due_by
       ) VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,
         NOW() + INTERVAL '8 hours'
       ) RETURNING *`,
      [
        practiceId,
        patientId,
        request_type,
        severity,
        presenting_complaint,
        hasAlert,
        alertReason
      ]
    )
    const newRequest = requests.rows[0]

    // Insert triage responses
    if (triage_responses?.length) {
      for (const [i, tr] of triage_responses.entries()) {
        await client.query(
          `INSERT INTO triage_responses (
             request_id, question_code, question_text,
             answer_text, answer_boolean, sequence_order
           ) VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            newRequest.id,
            tr.question_code,
            tr.question_text,
            tr.answer_text ?? null,
            tr.answer_boolean ?? null,
            i
          ]
        )
      }
    }

    // Increment demand counter
    await client.query(
      `INSERT INTO demand_log (practice_id, log_date, request_type, request_count, limit_at_time)
       VALUES ($1, CURRENT_DATE, $2, 1, (
         SELECT CASE WHEN $2::text = 'medical' THEN medical_request_limit
                     ELSE admin_request_limit END
         FROM practices WHERE id = $1
       ))
       ON CONFLICT (practice_id, log_date, request_type)
       DO UPDATE SET request_count = demand_log.request_count + 1`,
      [practiceId, request_type]
    )

    return newRequest
  }, practiceId)

  // 4. If alert, notify duty GP immediately
  if (hasAlert) {
    await triggerAlertNotification(practiceId, request)
  }

  // 5. Audit
  await auditLog({
    practiceId,
    action: 'create',
    entityType: 'consultation_requests',
    entityId: request.id,
    actorType: 'patient',
    actorPatientId: patientId,
    newValues: { request_type, severity, hasAlert },
    req
  })

  res.status(201).json({
    request: {
      id: request.id,
      status: request.status,
      severity: request.severity,
      submittedAt: request.submitted_at,
      responseDueBy: request.response_due_by,
      hasAlert: request.has_alert
    },
    message: hasAlert
      ? 'Your request has been flagged as urgent. The duty GP has been notified.'
      : 'Your request has been submitted. You will receive a response within the same working day.'
  })
})

// ─── PATIENT: My requests ─────────────────────────────────────────────────────
router.get('/mine', async (req, res) => {
  const rows = await query(
    `SELECT id, request_type, status, severity, presenting_complaint,
            submitted_at, resolved_at, outcome, has_alert
     FROM consultation_requests
     WHERE patient_id = $1
       AND practice_id = $2
     ORDER BY submitted_at DESC
     LIMIT 50`,
    [req.user.id, req.practiceId],
    req.practiceId
  )

  res.json({ requests: rows })
})

// ─── STAFF: Request inbox ─────────────────────────────────────────────────────
router.get('/', requireRole('gp', 'nurse', 'advanced_practitioner', 'receptionist', 'practice_manager', 'admin'), async (req, res) => {
  const { status, severity, assigned_to, page = 1, limit = 20 } = req.query
  const offset = (page - 1) * limit

  let whereConditions = ['r.practice_id = $1']
  const params = [req.practiceId]
  let paramCount = 1

  if (status) {
    paramCount++
    whereConditions.push(`r.status = $${paramCount}`)
    params.push(status)
  }
  if (severity) {
    paramCount++
    whereConditions.push(`r.severity = $${paramCount}`)
    params.push(severity)
  }
  if (assigned_to) {
    paramCount++
    whereConditions.push(`r.assigned_to = $${paramCount}`)
    params.push(assigned_to)
  }

  const where = whereConditions.join(' AND ')

  const rows = await query(
    `SELECT
       r.id, r.request_type, r.status, r.severity,
       r.presenting_complaint, r.has_alert, r.alert_acknowledged,
       r.submitted_at, r.response_due_by, r.triaged_at, r.resolved_at,
       r.assigned_to,
       p.first_name || ' ' || p.last_name AS patient_name,
       p.nhs_number, p.date_of_birth,
       p.phone, p.email AS patient_email,
       su.first_name || ' ' || su.last_name AS assigned_to_name
     FROM consultation_requests r
     JOIN patients p ON p.id = r.patient_id
     LEFT JOIN staff_users su ON su.id = r.assigned_to
     WHERE ${where}
     ORDER BY
       r.has_alert DESC,          -- alerts always first
       r.severity DESC,           -- then by severity
       r.submitted_at ASC         -- then oldest first (FIFO)
     LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
    [...params, limit, offset],
    req.practiceId
  )

  // Total count for pagination
  const countRows = await query(
    `SELECT COUNT(*) as total FROM consultation_requests r WHERE ${where}`,
    params,
    req.practiceId
  )

  await auditLog({
    practiceId: req.practiceId,
    action: 'read',
    entityType: 'consultation_requests',
    actorType: 'staff',
    actorStaffId: req.user.id,
    req
  })

  res.json({
    requests: rows,
    pagination: {
      total: parseInt(countRows[0].total),
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(countRows[0].total / limit)
    }
  })
})

// ─── STAFF: Alert inbox ───────────────────────────────────────────────────────
router.get('/alerts', requireRole('gp', 'nurse', 'advanced_practitioner', 'practice_manager'), async (req, res) => {
  const rows = await query(
    `SELECT r.id, r.request_type, r.severity, r.alert_reason,
            r.presenting_complaint, r.submitted_at,
            p.first_name || ' ' || p.last_name AS patient_name,
            p.nhs_number, p.date_of_birth, p.phone
     FROM consultation_requests r
     JOIN patients p ON p.id = r.patient_id
     WHERE r.practice_id = $1
       AND r.has_alert = true
       AND r.alert_acknowledged = false
       AND r.status NOT IN ('resolved','cancelled')
     ORDER BY r.submitted_at ASC`,
    [req.practiceId],
    req.practiceId
  )

  res.json({ alerts: rows, count: rows.length })
})

// ─── SHARED: Single request detail ───────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const { id } = req.params
  const { type } = req.user

  const rows = await query(
    `SELECT
       r.*,
       p.first_name || ' ' || p.last_name AS patient_name,
       p.nhs_number, p.date_of_birth, p.phone, p.email AS patient_email,
       su.first_name || ' ' || su.last_name AS assigned_to_name
     FROM consultation_requests r
     JOIN patients p ON p.id = r.patient_id
     LEFT JOIN staff_users su ON su.id = r.assigned_to
     WHERE r.id = $1 AND r.practice_id = $2`,
    [id, req.practiceId],
    req.practiceId
  )

  if (!rows.length) {
    return res.status(404).json({ error: 'Request not found' })
  }

  const request = rows[0]

  // Patients can only view their own requests
  if (type === 'patient' && request.patient_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  // Get triage responses
  const triageResponses = await query(
    `SELECT question_code, question_text, answer_text, answer_boolean, sequence_order
     FROM triage_responses WHERE request_id = $1 ORDER BY sequence_order`,
    [id],
    req.practiceId
  )

  // Get messages (staff see internal notes, patients don't)
  const messages = await query(
    `SELECT m.id, m.body, m.sender_type, m.is_internal, m.created_at,
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
    [id],
    req.practiceId
  )

  await auditLog({
    practiceId: req.practiceId,
    action: 'read',
    entityType: 'consultation_requests',
    entityId: id,
    actorType: type,
    actorPatientId: type === 'patient' ? req.user.id : null,
    actorStaffId: type === 'staff' ? req.user.id : null,
    req
  })

  // Staff see clinical notes; patients don't
  if (type === 'patient') {
    delete request.clinical_notes
  }

  res.json({ request, triageResponses, messages })
})

// ─── STAFF: Update request status ────────────────────────────────────────────
router.patch('/:id/status',
  requireRole('gp', 'nurse', 'advanced_practitioner', 'receptionist', 'practice_manager'),
  validate(schemas.updateRequestStatus),
  staffAudit('update', 'consultation_requests'),
  async (req, res) => {
    const { id } = req.params
    const { status, summary, clinical_notes, outcome, assigned_to } = req.body

    const updates = []
    const params = []
    let i = 1

    if (status) { updates.push(`status = $${i++}`); params.push(status) }
    if (summary !== undefined) { updates.push(`summary = $${i++}`); params.push(summary) }
    if (clinical_notes !== undefined) { updates.push(`clinical_notes = $${i++}`); params.push(clinical_notes) }
    if (outcome !== undefined) { updates.push(`outcome = $${i++}`); params.push(outcome) }
    if (assigned_to !== undefined) { updates.push(`assigned_to = $${i++}`); params.push(assigned_to) }

    // Set timestamps
    if (status === 'triaged') { updates.push(`triaged_at = NOW()`) }
    if (status === 'resolved') { updates.push(`resolved_at = NOW()`) }

    if (!updates.length) {
      return res.status(400).json({ error: 'No fields to update' })
    }

    params.push(id, req.practiceId)

    const rows = await query(
      `UPDATE consultation_requests
       SET ${updates.join(', ')}
       WHERE id = $${i++} AND practice_id = $${i}
       RETURNING id, status, severity, assigned_to, updated_at`,
      params,
      req.practiceId
    )

    if (!rows.length) {
      return res.status(404).json({ error: 'Request not found' })
    }

    res.json({ request: rows[0] })
  }
)

// ─── STAFF: Acknowledge alert ─────────────────────────────────────────────────
router.patch('/:id/acknowledge-alert',
  requireRole('gp', 'nurse', 'advanced_practitioner'),
  async (req, res) => {
    const { id } = req.params

    const rows = await query(
      `UPDATE consultation_requests
       SET alert_acknowledged = true,
           alert_acknowledged_by = $1,
           alert_acknowledged_at = NOW()
       WHERE id = $2 AND practice_id = $3
       RETURNING id, alert_acknowledged_at`,
      [req.user.id, id, req.practiceId],
      req.practiceId
    )

    if (!rows.length) {
      return res.status(404).json({ error: 'Request not found' })
    }

    await auditLog({
      practiceId: req.practiceId,
      action: 'update',
      entityType: 'consultation_requests',
      entityId: id,
      actorType: 'staff',
      actorStaffId: req.user.id,
      newValues: { alert_acknowledged: true },
      req
    })

    res.json({ acknowledged: true, at: rows[0].alert_acknowledged_at })
  }
)

// ─── Triage scoring engine ────────────────────────────────────────────────────
// Simple rule-based scoring. Expand with your clinical question library.
function scoreTriage(responses) {
  const ALERT_KEYWORDS = [
    'chest pain', 'difficulty breathing', 'shortness of breath',
    'cannot breathe', 'unconscious', 'fitting', 'stroke', 'severe bleeding',
    'suicidal', 'self harm', 'overdose', 'allergic reaction', 'anaphylaxis'
  ]

  let hasAlert = false
  let alertReason = null
  let severity = 'routine'

  for (const response of responses) {
    // Check for alert trigger on boolean questions
    if (response.answer_boolean === true && response.question_code?.includes('ALERT')) {
      hasAlert = true
      alertReason = response.question_text
      severity = 'emergency'
      break
    }

    // Check free text for alert keywords
    const text = (response.answer_text || '').toLowerCase()
    const matched = ALERT_KEYWORDS.find(kw => text.includes(kw))
    if (matched) {
      hasAlert = true
      alertReason = `Keyword detected: "${matched}"`
      severity = 'urgent'
    }
  }

  // Escalate if any urgent keyword found
  if (!hasAlert && responses.some(r =>
    ['urgent', 'worsening', 'severe', 'extreme'].some(kw =>
      (r.answer_text || '').toLowerCase().includes(kw)
    )
  )) {
    severity = 'urgent'
  }

  return { severity, hasAlert, alertReason }
}

export default router
