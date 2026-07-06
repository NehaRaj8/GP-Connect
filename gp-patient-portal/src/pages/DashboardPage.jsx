// src/pages/DashboardPage.jsx
import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { requestsApi } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { format, isToday, isYesterday } from 'date-fns'

export default function DashboardPage() {
  const { patient } = useAuth()
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadRequests() }, [])

  const loadRequests = async () => {
    try {
      const res = await requestsApi.getMine()
      setRequests(res.data.requests)
    } catch (err) {
      console.error('Dashboard error', err)
    } finally {
      setLoading(false)
    }
  }

  const active = requests.filter(r => !['resolved', 'cancelled'].includes(r.status))
  const past   = requests.filter(r => ['resolved', 'cancelled'].includes(r.status))

  return (
    <div>
      {/* Welcome */}
      <div style={styles.welcomeBar}>
        <div>
          <h1 style={styles.welcomeTitle}>
            Good {getTimeOfDay()}, {patient?.name?.split(' ')[0]}
          </h1>
          <p style={styles.welcomeSub}>
            Aberdeen Dyce Surgery · Online Consultation Service
          </p>
        </div>
        <Link to="/new-request" className="btn btn-primary btn-lg">
          + New request
        </Link>
      </div>

      {/* Active requests */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>
          Active requests
          {active.length > 0 && <span style={styles.count}>{active.length}</span>}
        </h2>

        {loading ? (
          <LoadingCards />
        ) : active.length === 0 ? (
          <div className="card" style={styles.emptyState}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
            <div style={styles.emptyTitle}>No active requests</div>
            <div style={styles.emptySub}>Submit a new request and your practice will respond the same working day</div>
            <Link to="/new-request" className="btn btn-primary" style={{ marginTop: 16 }}>
              Submit a request
            </Link>
          </div>
        ) : (
          <div style={styles.cardGrid}>
            {active.map(req => (
              <RequestCard key={req.id} request={req} onClick={() => navigate(`/requests/${req.id}`)} />
            ))}
          </div>
        )}
      </section>

      {/* Past requests */}
      {past.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Past requests</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {past.map(req => (
              <PastRequestRow key={req.id} request={req} onClick={() => navigate(`/requests/${req.id}`)} />
            ))}
          </div>
        </section>
      )}

      {/* Info cards */}
      <section style={styles.section}>
        <div style={styles.infoGrid}>
          <div className="card" style={styles.infoCard}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⏰</div>
            <h3 style={styles.infoTitle}>Response times</h3>
            <p style={styles.infoText}>
              We aim to respond to all requests the same working day.
              Urgent requests are reviewed immediately by the duty GP.
            </p>
          </div>
          <div className="card" style={styles.infoCard}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🔒</div>
            <h3 style={styles.infoTitle}>Your privacy</h3>
            <p style={styles.infoText}>
              All messages are encrypted and stored securely.
              Only your GP practice can see your requests.
            </p>
          </div>
          <div className="card" style={styles.infoCard}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📞</div>
            <h3 style={styles.infoTitle}>Need to call us?</h3>
            <p style={styles.infoText}>
              Reception: <strong>01224 000000</strong><br />
              Mon–Fri 8am–6pm<br />
              For emergencies call 999
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

function RequestCard({ request, onClick }) {
  const statusConfig = {
    pending:          { label: 'Submitted', icon: '📋', color: 'var(--grey-600)', bg: 'var(--grey-100)' },
    triaged:          { label: 'Being reviewed', icon: '👁', color: 'var(--nhs-blue)', bg: 'var(--nhs-blue-light)' },
    in_progress:      { label: 'In progress', icon: '⚙', color: '#7A5500', bg: '#FFF8E6' },
    awaiting_patient: { label: 'Your response needed', icon: '💬', color: 'var(--nhs-blue)', bg: 'var(--nhs-blue-light)' },
  }

  const config = statusConfig[request.status] || statusConfig.pending
  const needsResponse = request.status === 'awaiting_patient'

  return (
    <div
      className="card"
      style={{
        ...styles.requestCard,
        borderTop: needsResponse ? '4px solid var(--nhs-blue)' : '4px solid var(--grey-200)',
        cursor: 'pointer'
      }}
      onClick={onClick}
    >
      {needsResponse && (
        <div style={styles.responseNeeded}>
          💬 Your practice has replied — tap to view and respond
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <span style={{ ...styles.statusBadge, color: config.color, background: config.bg }}>
          {config.icon} {config.label}
        </span>
        <span style={styles.cardDate}>
          {formatDate(request.submitted_at)}
        </span>
      </div>

      <div style={styles.requestType}>
        {formatRequestType(request.request_type)}
      </div>

      <p style={styles.complaint}>
        {request.presenting_complaint?.slice(0, 120)}
        {request.presenting_complaint?.length > 120 ? '...' : ''}
      </p>

      <div style={styles.cardFooter}>
        <span className={`badge badge-${request.severity}`}>{request.severity}</span>
        <span style={styles.viewLink}>View details →</span>
      </div>
    </div>
  )
}

function PastRequestRow({ request, onClick }) {
  return (
    <div
      className="card"
      style={{ padding: '14px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16 }}
      onClick={onClick}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: 14 }}>{formatRequestType(request.request_type)}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          {formatDate(request.submitted_at)}
        </div>
      </div>
      <span className={`badge badge-${request.status}`}>
        {request.status === 'resolved' ? '✓ Resolved' : 'Cancelled'}
      </span>
      <span style={{ fontSize: 13, color: 'var(--nhs-blue)' }}>View →</span>
    </div>
  )
}

function LoadingCards() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[1,2].map(i => (
        <div key={i} className="card" style={{ padding: 24, opacity: 0.4 }}>
          <div style={{ height: 16, background: 'var(--grey-200)', borderRadius: 4, width: '60%', marginBottom: 10 }} />
          <div style={{ height: 12, background: 'var(--grey-200)', borderRadius: 4, width: '80%' }} />
        </div>
      ))}
    </div>
  )
}

function formatDate(dateStr) {
  const date = new Date(dateStr)
  if (isToday(date)) return `Today at ${format(date, 'HH:mm')}`
  if (isYesterday(date)) return `Yesterday at ${format(date, 'HH:mm')}`
  return format(date, 'dd MMM yyyy')
}

function formatRequestType(type) {
  const map = {
    medical: 'Medical advice',
    admin: 'Admin request',
    prescription_repeat: 'Repeat prescription',
    test_result: 'Test result query',
    referral: 'Referral request',
    video_consult: 'Video consultation',
    callback_request: 'GP callback request'
  }
  return map[type] || type
}

function getTimeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

const styles = {
  welcomeBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 },
  welcomeTitle: { fontSize: 26, fontWeight: 700, marginBottom: 4 },
  welcomeSub: { fontSize: 14, color: 'var(--text-muted)' },
  section: { marginBottom: 36 },
  sectionTitle: { fontSize: 17, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 },
  count: { background: 'var(--nhs-blue)', color: 'white', borderRadius: '100px', padding: '1px 8px', fontSize: 12, fontWeight: 700 },
  cardGrid: { display: 'flex', flexDirection: 'column', gap: 12 },
  requestCard: { padding: 20 },
  responseNeeded: { background: 'var(--nhs-blue-light)', color: 'var(--nhs-blue)', fontSize: 13, fontWeight: 500, padding: '8px 12px', borderRadius: 6, marginBottom: 12 },
  statusBadge: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 100, fontSize: 12, fontWeight: 600 },
  cardDate: { fontSize: 12, color: 'var(--text-muted)' },
  requestType: { fontWeight: 700, fontSize: 15, marginBottom: 6 },
  complaint: { fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 },
  cardFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  viewLink: { fontSize: 13, color: 'var(--nhs-blue)', fontWeight: 500 },
  emptyState: { padding: 40, textAlign: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: 600, marginBottom: 6 },
  emptySub: { fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 340, margin: '0 auto' },
  infoGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 },
  infoCard: { padding: 20 },
  infoTitle: { fontWeight: 600, fontSize: 15, marginBottom: 8 },
  infoText: { fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }
}
