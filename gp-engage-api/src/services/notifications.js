// src/services/notifications.js
// Sends SMS and email notifications to patients and staff.
// Uses Twilio for SMS and Nodemailer for email.
// In production, replace with NHS Notify: https://www.notifications.service.gov.uk

import nodemailer from 'nodemailer'
import { query } from '../config/database.js'
import { logger } from '../utils/logger.js'

// ─── Email transport ──────────────────────────────────────────────────────────
const emailTransport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

// ─── SMS via Twilio ───────────────────────────────────────────────────────────
async function sendSMS(to, body) {
  if (!process.env.TWILIO_ACCOUNT_SID) {
    logger.warn('Twilio not configured — SMS not sent', { to, body })
    return null
  }

  // Dynamic import to avoid crashes if Twilio not installed
  const twilio = (await import('twilio')).default
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

  return client.messages.create({
    from: process.env.TWILIO_FROM_NUMBER,
    to,
    body
  })
}

// ─── Core notification sender ─────────────────────────────────────────────────
async function sendNotification({
  practiceId,
  patientId = null,
  staffId = null,
  requestId = null,
  appointmentId = null,
  channel,
  templateCode,
  subject = null,
  body,
  recipientAddress
}) {
  // Record in DB first (so we have a trail even if send fails)
  const rows = await query(
    `INSERT INTO notifications (
       practice_id, patient_id, staff_id, request_id, appointment_id,
       channel, status, template_code, subject, body, recipient_address, provider
     ) VALUES ($1,$2,$3,$4,$5,$6,'queued',$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      practiceId, patientId, staffId, requestId, appointmentId,
      channel, templateCode, subject, body, recipientAddress,
      channel === 'sms' ? 'twilio' : 'smtp'
    ]
  )

  const notificationId = rows[0].id

  try {
    let providerMessageId = null

    if (channel === 'email') {
      const info = await emailTransport.sendMail({
        from: process.env.EMAIL_FROM || 'noreply@practice.nhs.uk',
        to: recipientAddress,
        subject: subject || 'Message from your GP practice',
        text: body,
        html: emailHtml(subject, body)
      })
      providerMessageId = info.messageId
    }

    if (channel === 'sms') {
      const msg = await sendSMS(recipientAddress, body)
      providerMessageId = msg?.sid
    }

    // Mark as sent
    await query(
      `UPDATE notifications
       SET status = 'sent', sent_at = NOW(), provider_message_id = $1
       WHERE id = $2`,
      [providerMessageId, notificationId]
    )

    logger.info('Notification sent', { channel, templateCode, notificationId })
    return { success: true, notificationId }

  } catch (err) {
    // Mark as failed
    await query(
      `UPDATE notifications
       SET status = 'failed', failed_at = NOW(), failure_reason = $1
       WHERE id = $2`,
      [err.message, notificationId]
    )
    logger.error('Notification failed', { channel, error: err.message })
    return { success: false, error: err.message }
  }
}

// ─── Template functions ───────────────────────────────────────────────────────

export async function notifyRequestReceived(practiceId, patient, requestId) {
  const promises = []

  if (patient.email && patient.opt_in_email !== false) {
    promises.push(sendNotification({
      practiceId,
      patientId: patient.id,
      requestId,
      channel: 'email',
      templateCode: 'REQUEST_RECEIVED',
      subject: 'We have received your request',
      body: `Dear ${patient.first_name},\n\nThank you for contacting the practice. We have received your request and will respond within the same working day.\n\nIf your condition worsens or you feel this is an emergency, please call 999.\n\nKind regards,\nYour GP Practice`,
      recipientAddress: patient.email
    }))
  }

  if (patient.phone && patient.opt_in_sms) {
    promises.push(sendNotification({
      practiceId,
      patientId: patient.id,
      requestId,
      channel: 'sms',
      templateCode: 'REQUEST_RECEIVED_SMS',
      body: `Your GP practice has received your request. We will respond today. If urgent, call 999.`,
      recipientAddress: patient.phone
    }))
  }

  await Promise.allSettled(promises)
}

export async function triggerAlertNotification(practiceId, request) {
  // Find duty GP or practice manager
  const staff = await query(
    `SELECT first_name, last_name, notification_email, notification_phone
     FROM staff_users
     WHERE practice_id = $1
       AND (is_duty_gp = true OR role = 'practice_manager')
       AND is_active = true
       AND notify_on_urgent = true
     LIMIT 3`,
    [practiceId]
  )

  const promises = staff.map(s => {
    const promises = []
    if (s.notification_email) {
      promises.push(sendNotification({
        practiceId,
        staffId: null,
        requestId: request.id,
        channel: 'email',
        templateCode: 'ALERT_URGENT',
        subject: `⚠️ URGENT REQUEST — Action Required`,
        body: `An urgent consultation request has been flagged.\n\nAlert reason: ${request.alert_reason}\n\nPlease review immediately in the GP Engage dashboard.`,
        recipientAddress: s.notification_email
      }))
    }
    if (s.notification_phone) {
      promises.push(sendNotification({
        practiceId,
        requestId: request.id,
        channel: 'sms',
        templateCode: 'ALERT_URGENT_SMS',
        body: `URGENT: New flagged patient request. Reason: ${request.alert_reason?.substring(0, 80)}. Check dashboard immediately.`,
        recipientAddress: s.notification_phone
      }))
    }
    return Promise.allSettled(promises)
  })

  await Promise.allSettled(promises)
}

export async function notifyRequestResolved(practiceId, patient, request) {
  if (!patient.email) return

  await sendNotification({
    practiceId,
    patientId: patient.id,
    requestId: request.id,
    channel: 'email',
    templateCode: 'REQUEST_RESOLVED',
    subject: 'Update on your request from the practice',
    body: `Dear ${patient.first_name},\n\nYour request has been reviewed by the practice.\n\n${request.outcome || 'Please log in to view the full response.'}\n\nKind regards,\nYour GP Practice`,
    recipientAddress: patient.email
  })
}

// ─── Simple plain-text to HTML wrapper ───────────────────────────────────────
function emailHtml(subject, body) {
  return `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-top: 4px solid #005EB8; padding-top: 20px;">
    <h2 style="color: #005EB8;">${subject || 'Message from your GP Practice'}</h2>
    <p style="line-height: 1.6; white-space: pre-wrap;">${body}</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
    <p style="font-size: 12px; color: #666;">
      This is an automated message from your GP practice's secure messaging system.
      Do not reply to this email. Log in to your patient portal to send a message.
    </p>
  </div>
</body>
</html>`
}
