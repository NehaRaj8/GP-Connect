// src/services/demand.js
// Checks whether a practice has capacity to accept a new request.
// Called before every new consultation_request is created.

import { query } from '../config/database.js'

// Returns null if capacity available, or an object with a message if at capacity
export async function checkDemandLimits(practiceId, requestType) {
  const practices = await query(
    `SELECT requests_enabled, override_message,
            medical_request_limit, admin_request_limit
     FROM practices WHERE id = $1`,
    [practiceId]
  )

  const practice = practices[0]
  if (!practice) return null

  // Hard disable — practice has turned off all requests
  if (!practice.requests_enabled) {
    return {
      message: practice.override_message ||
        'This practice is not accepting online requests at the moment. Please call reception.'
    }
  }

  // Check type-specific limit (0 = unlimited)
  const isMedical = requestType === 'medical' ||
    requestType === 'video_consult' ||
    requestType === 'callback_request'

  const limit = isMedical
    ? practice.medical_request_limit
    : practice.admin_request_limit

  if (limit === 0) return null // 0 means unlimited

  // Get today's count
  const counts = await query(
    `SELECT COALESCE(SUM(request_count), 0) as total
     FROM demand_log
     WHERE practice_id = $1
       AND log_date = CURRENT_DATE
       AND request_type = ANY($2)`,
    [
      practiceId,
      isMedical
        ? ['medical', 'video_consult', 'callback_request']
        : ['admin', 'prescription_repeat', 'test_result', 'referral']
    ]
  )

  const currentCount = parseInt(counts[0].total)

  if (currentCount >= limit) {
    return {
      message: isMedical
        ? `The practice has reached its daily limit for medical requests (${limit}). Please call reception for urgent matters.`
        : `The practice has reached its daily limit for admin requests (${limit}). Please try again tomorrow.`
    }
  }

  return null // capacity available
}
