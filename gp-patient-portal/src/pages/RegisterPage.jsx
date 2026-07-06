// src/pages/RegisterPage.jsx
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

export default function RegisterPage() {
  const { loading } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    first_name: '', last_name: '', date_of_birth: '',
    nhs_number: '', email: '', phone: '',
    password: '', confirm_password: ''
  })

  const update = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirm_password) {
      setError('Passwords do not match')
      return
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    try {
      const res = await fetch('/api/auth/patient/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: form.first_name,
          last_name: form.last_name,
          date_of_birth: form.date_of_birth,
          nhs_number: form.nhs_number.replace(/\s/g, ''),
          email: form.email,
          phone: form.phone,
          password: form.password,
          practice_id: import.meta.env.VITE_PRACTICE_ID
        })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Registration failed')
        return
      }

      localStorage.setItem('patient_token', data.token)
      localStorage.setItem('patient_user', JSON.stringify(data.patient))
      navigate('/dashboard')

    } catch (err) {
      setError('Something went wrong. Please try again.')
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>

        {/* NHS header */}
        <div style={styles.nhsHeader}>
          <div style={styles.nhsLogo}>NHS</div>
          <div>
            <div style={styles.practiceName}>Aberdeen Dyce Surgery</div>
            <div style={styles.practiceTag}>Online Consultation</div>
          </div>
        </div>

        {/* Progress */}
        <div className="step-indicator" style={{ marginBottom: 24 }}>
          {['Your details', 'Contact info', 'Set password'].map((label, i) => (
            <div key={i} className="step">
              <div className={`step-circle step-circle-${i + 1 < step ? 'done' : i + 1 === step ? 'active' : 'pending'}`}>
                {i + 1 < step ? '✓' : i + 1}
              </div>
              <span className={`step-label ${i + 1 === step ? 'step-label-active' : ''}`}>{label}</span>
              {i < 2 && <div className={`step-line ${i + 1 < step ? 'step-line-done' : ''}`} />}
            </div>
          ))}
        </div>

        <div className="card" style={styles.card}>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 20 }}>⚠ {error}</div>
          )}

          <form onSubmit={step === 3 ? handleSubmit : (e) => { e.preventDefault(); setStep(s => s + 1) }}>

            {/* Step 1 — Personal details */}
            {step === 1 && (
              <>
                <h2 style={styles.stepTitle}>Your personal details</h2>
                <p style={styles.stepSub}>We need these to match your NHS record</p>

                <div style={styles.row}>
                  <div style={styles.field}>
                    <label>First name</label>
                    <input value={form.first_name} onChange={e => update('first_name', e.target.value)} placeholder="Jane" required autoFocus />
                  </div>
                  <div style={styles.field}>
                    <label>Last name</label>
                    <input value={form.last_name} onChange={e => update('last_name', e.target.value)} placeholder="Smith" required />
                  </div>
                </div>

                <div style={styles.field}>
                  <label>Date of birth</label>
                  <input type="date" value={form.date_of_birth} onChange={e => update('date_of_birth', e.target.value)} required />
                </div>

                <div style={styles.field}>
                  <label>NHS number</label>
                  <input
                    value={form.nhs_number}
                    onChange={e => update('nhs_number', e.target.value)}
                    placeholder="485 777 3456"
                    maxLength={12}
                  />
                  <div style={styles.hint}>Your 10-digit NHS number is on your NHS app, medical letters, or prescription</div>
                </div>
              </>
            )}

            {/* Step 2 — Contact */}
            {step === 2 && (
              <>
                <h2 style={styles.stepTitle}>Contact information</h2>
                <p style={styles.stepSub}>How we will send you updates about your requests</p>

                <div style={styles.field}>
                  <label>Email address</label>
                  <input type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="jane@example.com" required autoFocus />
                </div>

                <div style={styles.field}>
                  <label>Mobile number (optional)</label>
                  <input type="tel" value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="+44 7700 900123" />
                  <div style={styles.hint}>We'll send SMS alerts if you opt in</div>
                </div>

                <div className="alert alert-info">
                  ℹ We will never share your contact details with third parties.
                  Messages from the practice are sent securely through this system.
                </div>
              </>
            )}

            {/* Step 3 — Password */}
            {step === 3 && (
              <>
                <h2 style={styles.stepTitle}>Create your password</h2>
                <p style={styles.stepSub}>Choose a strong password to keep your account secure</p>

                <div style={styles.field}>
                  <label>Password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => update('password', e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    autoFocus
                    minLength={8}
                  />
                </div>

                <div style={styles.field}>
                  <label>Confirm password</label>
                  <input
                    type="password"
                    value={form.confirm_password}
                    onChange={e => update('confirm_password', e.target.value)}
                    placeholder="Repeat your password"
                    required
                  />
                </div>

                <div className="alert alert-info" style={{ marginBottom: 16 }}>
                  🔒 Your data is encrypted and stored securely. This service complies with NHS data security standards.
                </div>
              </>
            )}

            {/* Navigation */}
            <div style={styles.navButtons}>
              {step > 1 && (
                <button type="button" className="btn btn-ghost" onClick={() => setStep(s => s - 1)}>
                  ← Back
                </button>
              )}
              <button
                type="submit"
                className="btn btn-primary"
                style={{ marginLeft: 'auto' }}
                disabled={loading}
              >
                {step === 3
                  ? (loading ? 'Creating account...' : 'Create account')
                  : 'Continue →'}
              </button>
            </div>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14, color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--nhs-blue)', fontWeight: 600 }}>Sign in</Link>
        </p>
      </div>
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  container: { width: '100%', maxWidth: 500 },
  nhsHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 },
  nhsLogo: { background: 'var(--nhs-blue)', color: 'white', fontWeight: 700, fontSize: 18, padding: '4px 10px', letterSpacing: 1, borderRadius: 2 },
  practiceName: { fontSize: 15, fontWeight: 600 },
  practiceTag: { fontSize: 12, color: 'var(--text-muted)' },
  card: { padding: 32 },
  stepTitle: { fontSize: 20, fontWeight: 700, marginBottom: 6 },
  stepSub: { fontSize: 14, color: 'var(--text-muted)', marginBottom: 24 },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  field: { marginBottom: 16 },
  hint: { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 },
  navButtons: { display: 'flex', alignItems: 'center', marginTop: 8 }
}
