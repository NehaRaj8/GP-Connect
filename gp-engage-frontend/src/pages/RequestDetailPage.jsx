// src/pages/RequestDetailPage.jsx
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { requestsApi, messagesApi } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { format } from 'date-fns'

const STATUS_OPTIONS = ['pending','triaged','in_progress','awaiting_patient','resolved','escalated','cancelled']

export default function RequestDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [request, setRequest] = useState(null)
  const [messages, setMessages] = useState([])
  const [triageResponses, setTriageResponses] = useState([])
  const [loading, setLoading] = useState(true)
  const [messageText, setMessageText] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState('')
  const [outcome, setOutcome] = useState('')
  const [status, setStatus] = useState('')
  const messagesEndRef = useRef(null)

  useEffect(() => { loadRequest() }, [id])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const loadRequest = async () => {
    try {
      const res = await requestsApi.getOne(id)
      setRequest(res.data.request)
      setMessages(res.data.messages)
      setTriageResponses(res.data.triageResponses)
      setNotes(res.data.request.clinical_notes || '')
      setOutcome(res.data.request.outcome || '')
      setStatus(res.data.request.status)
    } catch (err) {
      console.error('Load error', err)
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async () => {
    if (!messageText.trim()) return
    setSending(true)
    try {
      await messagesApi.sendMessage(id, messageText.trim(), isInternal)
      setMessageText('')
      await loadRequest()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const saveUpdate = async () => {
    setSaving(true)
    try {
      await requestsApi.updateStatus(id, {
        status,
        clinical_notes: notes,
        outcome
      })
      await loadRequest()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const acknowledgeAlert = async () => {
    try {
      await requestsApi.acknowledgeAlert(id)
      await loadRequest()
    } catch (err) {
      alert('Failed to acknowledge alert')
    }
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading...</div>
  if (!request) return <div style={{ padding: 40 }}>Request not found</div>

  return (
    <div>
      {/* Back nav */}
      <button className="btn btn-ghost" style={{ marginBottom: 16, fontSize: 13 }} onClick={() => navigate('/inbox')}>
        ← Back to inbox
      </button>

      {/* Alert banner */}
      {request.has_alert && !request.alert_acknowledged && (
        <div className="alert-strip alert-strip-error" style={{ marginBottom: 16, justifyContent: 'space-between' }}>
          <span>⚠ URGENT — {request.alert_reason}</span>
          <button className="btn btn-danger" style={{ padding: '4px 12px', fontSize: 12 }} onClick={acknowledgeAlert}>
            Acknowledge
          </button>
        </div>
      )}

      <div style={styles.grid}>
        {/* LEFT COLUMN */}
        <div style={styles.left}>

          {/* Patient card */}
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={styles.sectionLabel}>Patient</div>
            <div style={styles.patientName}>{request.patient_name}</div>
            <div style={styles.nhsNumber}>NHS {request.nhs_number}</div>
            {request.date_of_birth && (
              <div style={styles.meta}>DOB: {format(new Date(request.date_of_birth), 'dd MMM yyyy')}</div>
            )}
            {request.phone && <div style={styles.meta}>📞 {request.phone}</div>}
            {request.patient_email && <div style={styles.meta}>✉ {request.patient_email}</div>}
          </div>

          {/* Request detail */}
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={styles.sectionLabel}>Request</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <span className={`badge badge-${request.severity}`}>{request.severity}</span>
              <span className={`badge badge-${request.status}`}>{request.status.replace('_', ' ')}</span>
              <span className="badge badge-pending">{request.request_type.replace('_', ' ')}</span>
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>
              {request.presenting_complaint}
            </p>
            <div style={styles.meta}>
              Submitted: {format(new Date(request.submitted_at), 'dd MMM yyyy, HH:mm')}
            </div>
            {request.response_due_by && (
              <div style={{ ...styles.meta, color: 'var(--nhs-amber)' }}>
                Due by: {format(new Date(request.response_due_by), 'HH:mm')}
              </div>
            )}
          </div>

          {/* Triage responses */}
          {triageResponses.length > 0 && (
            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
              <div style={styles.sectionLabel}>Triage responses</div>
              {triageResponses.map((tr, i) => (
                <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < triageResponses.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 3 }}>{tr.question_text}</div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    {tr.answer_text || (tr.answer_boolean !== null ? (tr.answer_boolean ? 'Yes' : 'No') : '—')}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Clinical actions */}
          <div className="card" style={{ padding: 20 }}>
            <div style={styles.sectionLabel}>Clinical notes & outcome</div>

            <div style={{ marginBottom: 12 }}>
              <label>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label>Clinical notes (private — not visible to patient)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={4}
                placeholder="Add clinical notes..."
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label>Outcome / response to patient</label>
              <textarea
                value={outcome}
                onChange={e => setOutcome(e.target.value)}
                rows={3}
                placeholder="What action was taken..."
              />
            </div>

            <button
              className="btn btn-primary"
              onClick={saveUpdate}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save update'}
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN — Messaging */}
        <div style={styles.right}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={styles.msgHeader}>
              <span style={styles.sectionLabel}>Secure messages</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{messages.length} message{messages.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Messages list */}
            <div style={styles.msgList}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32, fontSize: 13 }}>
                  No messages yet
                </div>
              )}
              {messages.map(msg => (
                <MessageBubble key={msg.id} message={msg} currentUser={user} />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message composer */}
            <div style={styles.msgComposer}>
              <textarea
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                placeholder={isInternal ? 'Internal note (staff only)...' : 'Message to patient...'}
                rows={3}
                style={{ marginBottom: 8, background: isInternal ? 'var(--nhs-amber-light)' : 'white' }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && e.ctrlKey) sendMessage()
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 0, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isInternal}
                    onChange={e => setIsInternal(e.target.checked)}
                    style={{ width: 'auto' }}
                  />
                  <span style={{ fontSize: 12 }}>Internal note only</span>
                </label>
                <button
                  className="btn btn-primary"
                  onClick={sendMessage}
                  disabled={sending || !messageText.trim()}
                  style={{ fontSize: 13 }}
                >
                  {sending ? 'Sending...' : 'Send (Ctrl+Enter)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message, currentUser }) {
  const isStaff = message.sender_type === 'staff'
  const isInternal = message.is_internal

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isStaff ? 'flex-end' : 'flex-start',
      marginBottom: 12
    }}>
      <div style={{
        maxWidth: '80%',
        padding: '10px 14px',
        borderRadius: isStaff ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
        background: isInternal ? 'var(--nhs-amber-light)' :
                    isStaff ? 'var(--nhs-blue)' : 'var(--grey-100)',
        color: isStaff && !isInternal ? 'white' : 'var(--text)',
        fontSize: 14,
        lineHeight: 1.5
      }}>
        {isInternal && <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, opacity: 0.7 }}>INTERNAL NOTE</div>}
        {message.body}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, padding: '0 4px' }}>
        {message.sender_name} · {format(new Date(message.created_at), 'HH:mm')}
      </div>
    </div>
  )
}

const styles = {
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 380px',
    gap: 16,
    alignItems: 'start'
  },
  left: { display: 'flex', flexDirection: 'column' },
  right: { position: 'sticky', top: 20, height: 'calc(100vh - 80px)' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    marginBottom: 10
  },
  patientName: { fontSize: 18, fontWeight: 600, marginBottom: 2 },
  nhsNumber: { fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--nhs-blue)', marginBottom: 8 },
  meta: { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 },
  msgHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    borderBottom: '1px solid var(--border)'
  },
  msgList: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column'
  },
  msgComposer: {
    padding: '12px 16px',
    borderTop: '1px solid var(--border)'
  }
}
