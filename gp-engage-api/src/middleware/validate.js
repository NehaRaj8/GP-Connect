// src/middleware/validate.js
// Zod schema validation middleware.
// Validates req.body, req.params, and req.query against a Zod schema.
// Returns a clean 422 with field-level errors if validation fails.
//
// USAGE:
//   import { validate } from '../middleware/validate.js'
//   import { z } from 'zod'
//
//   const schema = z.object({
//     body: z.object({ email: z.string().email() })
//   })
//   router.post('/login', validate(schema), handler)

import { z } from 'zod'

export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query
    })

    if (!result.success) {
      const errors = result.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message
      }))

      return res.status(422).json({
        error: 'Validation failed',
        errors
      })
    }

    // Replace req.body/params/query with the parsed (sanitised) versions
    req.body = result.data.body ?? req.body
    req.params = result.data.params ?? req.params
    req.query = result.data.query ?? req.query

    next()
  }
}

// ─── Shared schemas used across multiple routes ───────────────────────────────

export const schemas = {
  // UUID path parameter
  uuidParam: z.object({
    params: z.object({
      id: z.string().uuid('Invalid ID format')
    })
  }),

  // Pagination query
  pagination: z.object({
    query: z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20)
    })
  }),

  // Staff login
  staffLogin: z.object({
    body: z.object({
      email: z.string().email('Invalid email address'),
      password: z.string().min(8, 'Password must be at least 8 characters')
    })
  }),

  // New consultation request
  createRequest: z.object({
    body: z.object({
      request_type: z.enum([
        'medical', 'admin', 'prescription_repeat',
        'test_result', 'referral', 'video_consult', 'callback_request'
      ]),
      presenting_complaint: z.string()
        .min(10, 'Please describe your symptoms in more detail')
        .max(2000),
      triage_responses: z.array(z.object({
        question_code: z.string(),
        question_text: z.string(),
        answer_text: z.string().optional(),
        answer_boolean: z.boolean().optional()
      })).optional()
    })
  }),

  // Update request status (staff)
  updateRequestStatus: z.object({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      status: z.enum([
        'pending', 'triaged', 'in_progress',
        'awaiting_patient', 'resolved', 'escalated', 'cancelled'
      ]),
      summary: z.string().max(5000).optional(),
      clinical_notes: z.string().max(10000).optional(),
      outcome: z.string().max(2000).optional(),
      assigned_to: z.string().uuid().optional()
    })
  }),

  // Send a message
  sendMessage: z.object({
    params: z.object({ requestId: z.string().uuid() }),
    body: z.object({
      body: z.string().min(1).max(5000),
      is_internal: z.boolean().default(false)
    })
  }),

  // Demand management
  updateDemandLimits: z.object({
    body: z.object({
      medical_request_limit: z.number().int().min(0).max(999),
      admin_request_limit: z.number().int().min(0).max(999),
      requests_enabled: z.boolean(),
      override_message: z.string().max(500).optional()
    })
  })
}
