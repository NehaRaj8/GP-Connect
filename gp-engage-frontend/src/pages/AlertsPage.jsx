// src/pages/AlertsPage.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestsApi } from '../services/api'
import { format } from 'date-fns'

export default function AlertsPage() {
  const navigate = useNavigate()
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAlerts() }, [])

  const loadAlerts = async () => {
    try {
      const res = await requestsApi.getAlerts()
      setAlerts(res.data.alerts)
    } finally {
      setLoading(false)
    }
  }

  const acknowledge = async (id, e) => {
    e.stopPropagation()
    try {
      await requestsApi.acknowledgeAlert(id)
      await loadAlerts()
    } catch {}
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Urgent Alerts</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            Requests flagged as requiring immediate clinical attention
          </p>
        </div>
        <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={loadAlerts}>↻ Refresh</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading...</div>
      ) : alerts.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No unacknowledged alerts</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>All urgent requests have been reviewed</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {alerts.map(alert => (
            <div
              key={alert.id}
              className="card"
              style={{ padding: '16px 20px', borderLeft: '4px solid var(--nhs-red)', cursor: 'pointer' }}
              onClick={() => navigate(`/inbox/${alert.id}`)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 16 }}>⚠</span>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{alert.patient_name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                      NHS {alert.nhs_number}
                    </span>
                    <span className={`badge badge-${alert.severity}`}>{alert.severity}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--nhs-red)', fontWeight: 500, marginBottom: 6 }}>
                    {alert.alert_reason}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
                    {alert.presenting_complaint}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {alert.phone && `📞 ${alert.phone} · `}
                    Submitted {format(new Date(alert.submitted_at), 'HH:mm')}
                  </div>
                </div>
                <button
                  className="btn btn-danger"
                  style={{ fontSize: 12, padding: '6px 14px', flexShrink: 0, marginLeft: 16 }}
                  onClick={(e) => acknowledge(alert.id, e)}
                >
                  Acknowledge
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
