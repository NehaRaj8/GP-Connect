// src/components/layout/Layout.jsx
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.jsx'

export default function Layout({ children }) {
  const { patient, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Top header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <Link to="/dashboard" style={styles.logo}>
            <div style={styles.nhsLogo}>NHS</div>
            <div>
              <div style={styles.practiceName}>Aberdeen Dyce Surgery</div>
              <div style={styles.practiceTag}>Online Consultation</div>
            </div>
          </Link>

          <nav style={styles.nav}>
            <Link
              to="/dashboard"
              style={{ ...styles.navLink, ...(location.pathname === '/dashboard' ? styles.navLinkActive : {}) }}
            >
              My requests
            </Link>
            <Link
              to="/new-request"
              style={{ ...styles.navLink, ...(location.pathname === '/new-request' ? styles.navLinkActive : {}) }}
            >
              New request
            </Link>
          </nav>

          <div style={styles.userArea}>
            <span style={styles.greeting}>
              {patient?.name?.split(' ')[0]}
            </span>
            <button className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 12px' }} onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Emergency banner */}
      <div style={styles.emergencyBanner}>
        🚨 If you have a medical emergency, call <strong>999</strong>. For urgent advice, call <strong>NHS 24 on 111</strong>.
      </div>

      {/* Page content */}
      <main style={styles.main}>
        {children}
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerInner}>
          <span>Aberdeen Dyce Surgery · Online Consultation Service</span>
          <span>All access is secure and audited · <a href="#" style={{ color: 'var(--nhs-blue)' }}>Privacy policy</a></span>
        </div>
      </footer>
    </div>
  )
}

const styles = {
  header: {
    background: 'white',
    borderBottom: '1px solid var(--border)',
    boxShadow: 'var(--shadow-sm)',
    position: 'sticky',
    top: 0,
    zIndex: 100
  },
  headerInner: {
    maxWidth: 900,
    margin: '0 auto',
    padding: '0 24px',
    height: 64,
    display: 'flex',
    alignItems: 'center',
    gap: 32
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    textDecoration: 'none',
    color: 'inherit'
  },
  nhsLogo: {
    background: 'var(--nhs-blue)',
    color: 'white',
    fontWeight: 700,
    fontSize: 16,
    padding: '4px 8px',
    letterSpacing: 1,
    borderRadius: 2,
    flexShrink: 0
  },
  practiceName: { fontSize: 14, fontWeight: 600, lineHeight: 1.2 },
  practiceTag: { fontSize: 11, color: 'var(--text-muted)' },
  nav: { display: 'flex', gap: 4, flex: 1 },
  navLink: {
    padding: '6px 14px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--grey-700)',
    textDecoration: 'none',
    transition: 'all 0.15s'
  },
  navLinkActive: {
    background: 'var(--nhs-blue-light)',
    color: 'var(--nhs-blue)'
  },
  userArea: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto'
  },
  greeting: { fontSize: 14, color: 'var(--text-muted)', fontWeight: 500 },
  emergencyBanner: {
    background: '#FFF3CD',
    borderBottom: '1px solid #FFD966',
    padding: '8px 24px',
    fontSize: 13,
    textAlign: 'center',
    color: '#664D03'
  },
  main: {
    maxWidth: 900,
    margin: '0 auto',
    padding: '32px 24px',
    minHeight: 'calc(100vh - 200px)'
  },
  footer: {
    borderTop: '1px solid var(--border)',
    background: 'white',
    padding: '16px 24px'
  },
  footerInner: {
    maxWidth: 900,
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    color: 'var(--text-muted)'
  }
}
