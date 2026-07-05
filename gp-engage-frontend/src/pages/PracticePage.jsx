// src/pages/PracticePage.jsx
import { useState, useEffect } from 'react'
import { practiceApi } from '../services/api'

export default function PracticePage() {
  const [practice, setPractice] = useState(null)
  const [demand, setDemand] = useState(null)
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [medLimit, setMedLimit] = useState(50)
  const [adminLimit, setAdminLimit] = useState(100)
  const [enabled, setEnabled] = useState(true)
  const [overrideMsg, setOverrideMsg] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const [practiceRes, staffRes] = await Promise.all([
        practiceApi.get(),
        practiceApi.getStaff()
      ])
      const p = practiceRes.data.practice
      setPractice(p)
      setDemand(practiceRes.data.todayDemand)
      setMedLimit(p.medical_request_limit)
      setAdminLimit(p.admin_request_limit)
      setEnabled(p.requests_enabled)
      setOverrideMsg(p.override_message || '')
      setStaff(staffRes.data.staff)
    } catch (err) {
      console.error('Practice load error', err)
    } finally {
      setLoading(false)
    }
  }

  const saveDemand = async () => {
    setSaving(true)
    try {
      await practiceApi.updateDemand({
        medical_request_limit: medLimit,
        admin_request_limit: adminLimit,
        requests_enabled: enabled,
        override_message: overrideMsg
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const toggleDuty = async (staffId, currentDuty) => {
    try {
      await practiceApi.setDutyGp(staffId, !currentDuty)
      await loadData()
    } catch {}
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading...</div>

  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 24 }}>Practice Settings</h1>

      {/* Practice info */}
      {practice && (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={styles.sectionLabel}>Practice</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{practice.name}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            ODS: {practice.ods_code} · {practice.city} {practice.postcode}
          </div>
          <div style={{ marginTop: 8 }}>
            <span style={{
              display: 'inline-block',
              padding: '3px 10px',
              borderRadius: 100,
              fontSize: 12,
              fontWeight: 600,
              background: practice.requests_enabled ? 'var(--nhs-green-light)' : 'var(--nhs-red-light)',
              color: practice.requests_enabled ? 'var(--nhs-green)' : 'var(--nhs-red)'
            }}>
              {practice.requests_enabled ? '● Open for requests' : '● Closed for requests'}
            </span>
          </div>
        </div>
      )}

      {/* Demand management */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={styles.sectionLabel}>Demand management</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Control how many requests the practice accepts each day. Set to 0 for unlimited.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label>Medical requests per day</label>
            <input
              type="number"
              value={medLimit}
              onChange={e => setMedLimit(parseInt(e.target.value))}
              min={0} max={999}
            />
            {demand && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Today: {demand.find(d => d.request_type === 'medical')?.request_count || 0} used
              </div>
            )}
          </div>
          <div>
            <label>Admin requests per day</label>
            <input
              type="number"
              value={adminLimit}
              onChange={e => setAdminLimit(parseInt(e.target.value))}
              min={0} max={999}
            />
            {demand && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Today: {demand.find(d => d.request_type === 'admin')?.request_count || 0} used
              </div>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => setEnabled(e.target.checked)}
              style={{ width: 'auto' }}
            />
            <span>Practice is open for online requests</span>
          </label>
        </div>

        {!enabled && (
          <div style={{ marginBottom: 16 }}>
            <label>Message shown to patients when closed</label>
            <textarea
              value={overrideMsg}
              onChange={e => setOverrideMsg(e.target.value)}
              rows={2}
              placeholder="e.g. The practice is not accepting online requests today. Please call reception."
            />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-primary" onClick={saveDemand} disabled={saving}>
            {saving ? 'Saving...' : 'Save settings'}
          </button>
          {saved && <span style={{ fontSize: 13, color: 'var(--nhs-green)' }}>✓ Saved</span>}
        </div>
      </div>

      {/* Staff list */}
      <div className="card" style={{ padding: 20 }}>
        <div style={styles.sectionLabel}>Staff</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {staff.map(s => (
            <div key={s.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 0',
              borderBottom: '1px solid var(--border)'
            }}>
              <div style={{
                width: 36, height: 36,
                borderRadius: '50%',
                background: 'var(--nhs-blue)',
                color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 600, fontSize: 14, flexShrink: 0
              }}>
                {s.first_name[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{s.first_name} {s.last_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.email} · {s.role}</div>
              </div>
              {s.role === 'gp' && (
                <button
                  className={`btn ${s.is_duty_gp ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: 12, padding: '4px 12px' }}
                  onClick={() => toggleDuty(s.id, s.is_duty_gp)}
                >
                  {s.is_duty_gp ? '● Duty GP' : 'Set as duty GP'}
                </button>
              )}
              <span style={{
                padding: '2px 8px',
                borderRadius: 100,
                fontSize: 11,
                background: s.is_active ? 'var(--nhs-green-light)' : 'var(--grey-100)',
                color: s.is_active ? 'var(--nhs-green)' : 'var(--text-muted)'
              }}>
                {s.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const styles = {
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    marginBottom: 10
  }
}
