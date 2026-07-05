// src/pages/DashboardPage.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { practiceApi, requestsApi } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { format } from 'date-fns'

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [demand, setDemand] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [recentRequests, setRecentRequests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    try {
      const [demandRes, alertsRes, requestsRes] = await Promise.all([
        practiceApi.getDemand(),
        requestsApi.getAlerts(),
        requestsApi.getAll({ limit: 5, status: 'pending' })
      ])
      setDemand(demandRes.data)
      setAlerts(alertsRes.data.alerts)
      setRecentRequests(requestsRes.data.requests)
    } catch (err) {
      console.error('Dashboard load error', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <LoadingScreen />

  const today = format(new Date(), 'EEEE d MMMM yyyy')

  return (
    <div>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.greeting}>Good {getTimeOfDay()}, {user?.name?.split(' ')[0]}</h1>
          <p style={styles.date}>{today}</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => navigate('/inbox')}
        >
          📋 Open Inbox
        </button>
      </div>

      {/* Alert banner */}
      {alerts.length > 0 && (
        <div
          className="alert-strip alert-strip-error"
          style={{ marginBottom: 24, cursor: 'pointer', justifyContent: 'space-between' }}
          onClick={() => navigate('/alerts')}
        >
          <span>⚠ {alerts.length} urgent request{alerts.length > 1 ? 's' : ''} require immediate attention</span>
          <span style={{ fontWeight: 600 }}>View alerts →</span>
        </div>
      )}

      {/* Demand stats */}
      {demand && (
        <div style={styles.statsGrid}>
          <StatCard
            label="Medical requests today"
            value={demand.medical?.count ?? 0}
            max={demand.medical?.limit}
            percent={demand.medical?.percentUsed}
            color="var(--nhs-blue)"
          />
          <StatCard
            label="Admin requests today"
            value={demand.admin?.count ?? 0}
            max={demand.admin?.limit}
            percent={demand.admin?.percentUsed}
            color="var(--nhs-green)"
          />
          <StatCard
            label="Unacknowledged alerts"
            value={alerts.length}
            color="var(--nhs-red)"
            alert={alerts.length > 0}
          />
          <StatCard
            label="Practice status"
            value={demand.requestsEnabled ? 'Open' : 'Closed'}
            color={demand.requestsEnabled ? 'var(--nhs-green)' : 'var(--nhs-red)'}
          />
        </div>
      )}

      {/* Recent requests */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Pending requests</h2>
          <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => navigate('/inbox')}>
            View all →
          </button>
        </div>

        {recentRequests.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
            ✓ No pending requests
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentRequests.map(req => (
              <RequestRow
                key={req.id}
                request={req}
                onClick={() => navigate(`/inbox/${req.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, max, percent, color, alert }) {
  return (
    <div className="card" style={{ padding: 20, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 28, fontWeight: 700, color, marginBottom: 4 }}>
        {value}{max ? <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)' }}>/{max}</span> : ''}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</div>
      {percent !== undefined && (
        <div style={{ marginTop: 10 }}>
          <div style={{ height: 4, background: 'var(--grey-200)', borderRadius: 2 }}>
            <div style={{
              height: '100%',
              width: `${Math.min(percent, 100)}%`,
              background: percent > 80 ? 'var(--nhs-red)' : color,
              borderRadius: 2,
              transition: 'width 0.3s'
            }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{percent}% used</div>
        </div>
      )}
    </div>
  )
}

function RequestRow({ request, onClick }) {
  return (
    <div
      className="card"
      style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16 }}
      onClick={onClick}
    >
      {request.has_alert && <span style={{ color: 'var(--nhs-red)', fontSize: 16 }}>⚠</span>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 14 }}>{request.patient_name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {request.presenting_complaint}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <span className={`badge badge-${request.severity}`}>{request.severity}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {format(new Date(request.submitted_at), 'HH:mm')}
        </span>
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⟳</div>
        Loading dashboard...
      </div>
    </div>
  )
}

function getTimeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

const styles = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24
  },
  greeting: { fontSize: 22, fontWeight: 600 },
  date: { fontSize: 13, color: 'var(--text-muted)', marginTop: 2 },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 16,
    marginBottom: 28
  },
  section: { marginTop: 8 },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  sectionTitle: { fontSize: 16, fontWeight: 600 }
}
