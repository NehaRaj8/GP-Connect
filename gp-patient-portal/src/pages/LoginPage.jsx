// src/pages/LoginPage.jsx
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

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

        {/* NHS header */}
        <div style={styles.nhsHeader}>
          <div style={styles.nhsLogo}>NHS</div>
          <div>
            <div style={styles.practiceName}>Aberdeen Dyce Surgery</div>
            <div style={styles.practiceTag}>Online Consultation</div>
          </div>
        </div>

        <div className="card" style={styles.card}>
          <h1 style={styles.title}>Sign in to your account</h1>
          <p style={styles.sub}>Access your consultation requests and messages</p>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 20 }}>
              ⚠ {error}
            </div>
          )}

          <div className="alert alert-info" style={{ marginBottom: 20 }}>
            ℹ Use the email address and password you registered with.
          </div>

          <form onSubmit={handleSubmit}>
            <div style={styles.field}>
              <label>Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
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
              className="btn btn-primary btn-full"
              style={{ marginTop: 8 }}
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div style={styles.divider}>
            <span>or</span>
          </div>

          <button
            className="btn btn-secondary btn-full"
            style={{ marginBottom: 20 }}
            onClick={() => window.location.href = '/api/auth/nhs-login'}
          >
            <span style={styles.nhsSmall}>NHS</span>
            Sign in with NHS Login
          </button>

          <p style={styles.registerLink}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: 'var(--nhs-blue)', fontWeight: 600 }}>
              Register here
            </Link>
          </p>
        </div>

        <div className="alert alert-warning" style={{ marginTop: 16 }}>
          🚨 If you have an emergency, call <strong>999</strong>. This service is not for emergencies.
        </div>

        <p style={styles.backLink}>
          <Link to="/" style={{ color: 'var(--nhs-blue)' }}>← Back to home</Link>
        </p>
      </div>
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  container: { width: '100%', maxWidth: 440 },
  nhsHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 },
  nhsLogo: { background: 'var(--nhs-blue)', color: 'white', fontWeight: 700, fontSize: 18, padding: '4px 10px', letterSpacing: 1, borderRadius: 2 },
  practiceName: { fontSize: 15, fontWeight: 600 },
  practiceTag: { fontSize: 12, color: 'var(--text-muted)' },
  card: { padding: 32 },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 6 },
  sub: { fontSize: 14, color: 'var(--text-muted)', marginBottom: 24 },
  field: { marginBottom: 16 },
  divider: { textAlign: 'center', margin: '20px 0', color: 'var(--text-muted)', fontSize: 13, position: 'relative' },
  nhsSmall: { background: 'var(--nhs-blue)', color: 'white', fontSize: 11, fontWeight: 700, padding: '1px 5px', borderRadius: 2, letterSpacing: 1 },
  registerLink: { textAlign: 'center', fontSize: 14, color: 'var(--text-muted)' },
  backLink: { textAlign: 'center', marginTop: 16, fontSize: 14 }
}
