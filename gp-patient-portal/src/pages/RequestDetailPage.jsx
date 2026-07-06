// src/pages/RequestDetailPage.jsx
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { requestsApi, messagesApi } from '../services/api.js'
import { format, isToday } from 'date-fns'

export default function RequestDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [request, setRequest] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef(null)

  useEffect(() => { loadRequest() }, [id])
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadRequest = async () => {
    try {
      const res = await requestsApi.getOne(id)
      setRequest(res.data.request)
      setMessages(res.data.messages)
    } catch {
      setError('Could not load this request.')
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async () => {
    if (!messageText.trim()) return
    setSending(true)
    try {
      await messagesApi.sendMessage(id, messageText.trim())
      setMessageText('')
      await loadRequest()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
      Loading your request...
    </div>
  )

  if (!request) return (
    <div className="alert alert-error">Could not load this request.</div>
  )

  const isClosed = ['resolved', 'cancelled'].includes(request.status)

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>

      {/* Back */}
      <button className="btn btn-ghost" style={{ marginBottom: 20, fontSize: 14 }} onClick={() => navigate('/dashboard')}>
        ← Back to my requests
      </button>

      {/* Request header */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={styles.requestHeader}>
          <div>
            <h1 style={styles.requestTitle}>{formatRequestType(request.request_type)}</h1>
            <div style={styles.requestMeta}>
              Submitted {format(new Date(request.submitted_at), 'dd MMMM yyyy \'at\' HH:mm')}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <StatusBadge status={request.status} />
            <span className={`badge badge-${request.severity}`}>{request.severity}</span>
          </div>
        </div>

        <div style={styles.complaintBox}>
          <div style={styles.complaintLabel}>Your description</div>
          <p style={styles.complaintText}>{request.presenting_complaint}</p>
        </div>

        {request.outcome && (
          <div style={styles.outcomeBox}>
            <div style={styles.outcomeLabel}>✓ Practice response</div>
            <p style={styles.outcomeText}>{request.outcome}</p>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={styles.msgHeader}>
          <h2 style={styles.msgTitle}>Messages</h2>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {messages.length} message{messages.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div style={styles.msgList}>
          {messages.length === 0 && (
            <div style={styles.noMessages}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>No messages yet</div>
              <div style={{ fontSize: 13 }}>
                The practice will reply here once they have reviewed your request
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            const isPatient = msg.sender_type === 'patient'
            const showDate = i === 0 || !isSameDay(messages[i-1].created_at, msg.created_at)
            return (
              <div key={msg.id}>
                {showDate && (
                  <div style={styles.dateDivider}>
                    {isToday(new Date(msg.created_at)) ? 'Today' : format(new Date(msg.created_at), 'dd MMMM yyyy')}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: isPatient ? 'flex-end' : 'flex-start', marginBottom: 16 }}>
                  <div style={{
                    maxWidth: '80%',
                    padding: '12px 16px',
                    borderRadius: isPatient ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: isPatient ? 'var(--nhs-blue)' : 'var(--grey-100)',
                    color: isPatient ? 'white' : 'var(--text)',
                    fontSize: 15,
                    lineHeight: 1.5
                  }}>
                    {msg.body}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, padding: '0 4px' }}>
                    {isPatient ? 'You' : `${msg.sender_name} · Aberdeen Dyce Surgery`} · {format(new Date(msg.created_at), 'HH:mm')}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Message composer */}
        {!isClosed ? (
          <div style={styles.composer}>
            {error && <div className="alert alert-error" style={{ marginBottom: 10, fontSize: 13 }}>⚠ {error}</div>}
            <textarea
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
              placeholder="Write a message to your practice..."
              rows={3}
              style={{ marginBottom: 10, resize: 'vertical' }}
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) sendMessage() }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Press Ctrl+Enter to send
              </span>
              <button
                className="btn btn-primary"
                onClick={sendMessage}
                disabled={sending || !messageText.trim()}
              >
                {sending ? 'Sending...' : 'Send message'}
              </button>
            </div>
          </div>
        ) : (
          <div style={styles.closedNotice}>
            This request is {request.status}. You cannot send new messages.
            <button className="btn btn-secondary" style={{ marginTop: 12, fontSize: 13 }} onClick={() => navigate('/new-request')}>
              Submit a new request
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const config = {
    pending:          { label: '📋 Submitted', color: 'var(--grey-700)', bg: 'var(--grey-100)' },
    triaged:          { label: '👁 Being reviewed', color: 'var(--nhs-blue)', bg: 'var(--nhs-blue-light)' },
    in_progress:      { label: '⚙ In progress', color: '#7A5500', bg: '#FFF8E6' },
    awaiting_patient: { label: '💬 Reply needed', color: 'var(--nhs-blue)', bg: 'var(--nhs-blue-light)' },
    resolved:         { label: '✓ Resolved', color: 'var(--nhs-green)', bg: 'var(--nhs-green-light)' },
    cancelled:        { label: 'Cancelled', color: 'var(--grey-600)', bg: 'var(--grey-100)' }
  }
  const c = config[status] || config.pending
  return (
    <span style={{ padding: '4px 12px', borderRadius: 100, fontSize: 12, fontWeight: 600, color: c.color, background: c.bg }}>
      {c.label}
    </span>
  )
}

function formatRequestType(type) {
  const map = {
    medical: 'Medical advice', admin: 'Admin request',
    prescription_repeat: 'Repeat prescription', test_result: 'Test result query',
    referral: 'Referral request', video_consult: 'Video consultation',
    callback_request: 'GP callback request'
  }
  return map[type] || type
}

function isSameDay(a, b) {
  const da = new Date(a), db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

const styles = {
  requestHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  requestTitle: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  requestMeta: { fontSize: 13, color: 'var(--text-muted)' },
  complaintBox: { background: 'var(--grey-50)', borderRadius: 8, padding: 16, marginTop: 8 },
  complaintLabel: { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  complaintText: { fontSize: 14, lineHeight: 1.7, color: 'var(--text)' },
  outcomeBox: { background: 'var(--nhs-green-light)', borderRadius: 8, padding: 16, marginTop: 12, borderLeft: '4px solid var(--nhs-green)' },
  outcomeLabel: { fontSize: 12, fontWeight: 700, color: 'var(--nhs-green)', marginBottom: 6 },
  outcomeText: { fontSize: 14, lineHeight: 1.7 },
  msgHeader: { padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  msgTitle: { fontSize: 16, fontWeight: 600 },
  msgList: { padding: '20px', minHeight: 200, maxHeight: 480, overflowY: 'auto' },
  noMessages: { textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' },
  dateDivider: { textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, margin: '12px 0', position: 'relative' },
  composer: { padding: 16, borderTop: '1px solid var(--border)' },
  closedNotice: { padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center' }
}
