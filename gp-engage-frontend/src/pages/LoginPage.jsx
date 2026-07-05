// src/pages/LoginPage.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const { login, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const result = await login(email, password)
    if (result.success) {
      navigate('/dashboard')
    } else {
      setError(result.error)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>

        {/* NHS Logo strip */}
        <div style={styles.nhsStrip}>
          <div style={styles.nhsLogo}>NHS</div>
          <span style={styles.nhsLabel}>GP Connect — Staff Portal</span>
        </div>

        <div style={styles.card}>
          <h1 style={styles.heading}>Sign in</h1>
          <p style={styles.sub}>Aberdeen Dyce Surgery</p>

          {error && (
            <div className="alert-strip alert-strip-error" style={{ marginBottom: 20 }}>
              ⚠ {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={styles.field}>
              <label>Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="doctor@aberdeendyce.com"
                required
                autoFocus
              />
            </div>

            <div style={styles.field}>
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '10px', marginTop: 8 }}
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p style={styles.footer}>
            Having trouble signing in? Contact your practice manager.
          </p>
        </div>

        <p style={styles.disclaimer}>
          This system is for authorised NHS staff only. All access is logged and audited.
        </p>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px'
  },
  container: {
    width: '100%',
    maxWidth: '420px'
  },
  nhsStrip: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '24px'
  },
  nhsLogo: {
    background: 'var(--nhs-blue)',
    color: 'white',
    fontWeight: '700',
    fontSize: '18px',
    padding: '4px 10px',
    letterSpacing: '1px',
    borderRadius: '2px'
  },
  nhsLabel: {
    color: 'var(--grey-700)',
    fontSize: '14px',
    fontWeight: '500'
  },
  card: {
    background: 'white',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '32px',
    boxShadow: 'var(--shadow)'
  },
  heading: {
    fontSize: '24px',
    fontWeight: '600',
    color: 'var(--text)',
    marginBottom: '4px'
  },
  sub: {
    fontSize: '14px',
    color: 'var(--text-muted)',
    marginBottom: '24px'
  },
  field: {
    marginBottom: '16px'
  },
  footer: {
    marginTop: '20px',
    fontSize: '12px',
    color: 'var(--text-muted)',
    textAlign: 'center'
  },
  disclaimer: {
    marginTop: '16px',
    fontSize: '11px',
    color: 'var(--text-light)',
    textAlign: 'center',
    lineHeight: '1.5'
  }
}
