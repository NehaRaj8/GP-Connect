// src/pages/InboxPage.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestsApi } from '../services/api'
import { format } from 'date-fns'

const STATUS_FILTERS = ['all', 'pending', 'triaged', 'in_progress', 'awaiting_patient', 'resolved']
const SEVERITY_FILTERS = ['all', 'emergency', 'urgent', 'routine']

export default function InboxPage() {
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('all')
  const [severity, setSeverity] = useState('all')
  const [page, setPage] = useState(1)

  useEffect(() => {
    loadRequests()
  }, [status, severity, page])

  const loadRequests = async () => {
    setLoading(true)
    try {
      const params = { page, limit: 20 }
      if (status !== 'all') params.status = status
      if (severity !== 'all') params.severity = severity
      const res = await requestsApi.getAll(params)
      setRequests(res.data.requests)
      setPagination(res.data.pagination)
    } catch (err) {
      console.error('Inbox load error', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Patient Inbox</h1>
        <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={loadRequests}>
          ↻ Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <FilterGroup
          label="Status"
          options={STATUS_FILTERS}
          value={status}
          onChange={v => { setStatus(v); setPage(1) }}
        />
        <FilterGroup
          label="Severity"
          options={SEVERITY_FILTERS}
          value={severity}
          onChange={v => { setSeverity(v); setPage(1) }}
        />
        {pagination && (
          <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-muted)' }}>
            {pagination.total} request{pagination.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Request list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading...</div>
      ) : requests.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
          No requests match your filters
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {requests.map(req => (
            <RequestCard
              key={req.id}
              request={req}
              onClick={() => navigate(`/inbox/${req.id}`)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button
            className="btn btn-secondary"
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
          >
            ← Previous
          </button>
          <span style={{ padding: '8px 16px', fontSize: 14, color: 'var(--text-muted)' }}>
            Page {page} of {pagination.pages}
          </span>
          <button
            className="btn btn-secondary"
            disabled={page === pagination.pages}
            onClick={() => setPage(p => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

function RequestCard({ request, onClick }) {
  const isAlert = request.has_alert && !request.alert_acknowledged
  return (
    <div
      className="card"
      style={{
        padding: '14px 16px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        borderLeft: isAlert ? '4px solid var(--nhs-red)' : '4px solid transparent',
        transition: 'box-shadow 0.15s'
      }}
      onClick={onClick}
      onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'var(--shadow-sm)'}
    >
      {/* Alert indicator */}
      {isAlert && (
        <span style={{ color: 'var(--nhs-red)', fontSize: 18, flexShrink: 0 }}>⚠</span>
      )}

      {/* Patient info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{request.patient_name}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {request.nhs_number}
          </span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {request.presenting_complaint}
        </div>
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <span className={`badge badge-${request.severity}`}>{request.severity}</span>
          <span className={`badge badge-${request.status}`}>{request.status.replace('_', ' ')}</span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {format(new Date(request.submitted_at), 'dd MMM, HH:mm')}
        </span>
        {request.assigned_to_name && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>→ {request.assigned_to_name}</span>
        )}
      </div>
    </div>
  )
}

function FilterGroup({ label, options, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginRight: 4 }}>{label}:</span>
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          style={{
            padding: '3px 10px',
            borderRadius: '100px',
            border: '1px solid',
            borderColor: value === opt ? 'var(--nhs-blue)' : 'var(--border)',
            background: value === opt ? 'var(--nhs-blue)' : 'white',
            color: value === opt ? 'white' : 'var(--grey-700)',
            fontSize: '12px',
            cursor: 'pointer',
            fontWeight: value === opt ? 600 : 400,
            textTransform: 'capitalize'
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

const styles = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  title: { fontSize: 22, fontWeight: 600 }
}
