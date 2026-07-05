// src/components/layout/Layout.jsx
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

const NAV = [
  { to: '/dashboard',      icon: '⊞', label: 'Dashboard' },
  { to: '/inbox',          icon: '📋', label: 'Inbox' },
  { to: '/alerts',         icon: '⚠',  label: 'Alerts' },
  { to: '/questionnaires', icon: '🔧', label: 'Questionnaires' },
  { to: '/practice',       icon: '⚙',  label: 'Practice' },
]

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div style={styles.shell}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        {/* NHS logo */}
        <div style={styles.logoArea}>
          <div style={styles.nhsLogo}>NHS</div>
          <div>
            <div style={styles.appName}>GP Connect</div>
            <div style={styles.appSub}>Staff Portal</div>
          </div>
        </div>

        {/* Nav links */}
        <nav style={styles.nav}>
          {NAV.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                ...styles.navItem,
                ...(isActive ? styles.navItemActive : {})
              })}
            >
              <span style={styles.navIcon}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User info + logout */}
        <div style={styles.userArea}>
          <div style={styles.userInfo}>
            <div style={styles.avatar}>
              {user?.name?.charAt(0) || 'G'}
            </div>
            <div>
              <div style={styles.userName}>{user?.name}</div>
              <div style={styles.userRole}>{user?.role?.toUpperCase()}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'center', fontSize: '13px', marginTop: 8 }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={styles.main}>
        {children}
      </main>
    </div>
  )
}

const styles = {
  shell: {
    display: 'flex',
    minHeight: '100vh',
  },
  sidebar: {
    width: '220px',
    background: 'white',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    top: 0, left: 0, bottom: 0,
    zIndex: 100
  },
  logoArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '20px 16px',
    borderBottom: '1px solid var(--border)'
  },
  nhsLogo: {
    background: 'var(--nhs-blue)',
    color: 'white',
    fontWeight: '700',
    fontSize: '14px',
    padding: '3px 7px',
    letterSpacing: '1px',
    borderRadius: '2px',
    flexShrink: 0
  },
  appName: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text)',
    lineHeight: 1.2
  },
  appSub: {
    fontSize: '11px',
    color: 'var(--text-muted)'
  },
  nav: {
    flex: 1,
    padding: '12px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '9px 12px',
    borderRadius: 'var(--radius-sm)',
    fontSize: '14px',
    color: 'var(--grey-700)',
    textDecoration: 'none',
    fontWeight: '500',
    transition: 'all 0.1s'
  },
  navItemActive: {
    background: 'var(--nhs-blue-light)',
    color: 'var(--nhs-blue)',
  },
  navIcon: {
    fontSize: '16px',
    width: '20px',
    textAlign: 'center'
  },
  userArea: {
    padding: '12px',
    borderTop: '1px solid var(--border)'
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 4px'
  },
  avatar: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    background: 'var(--nhs-blue)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '600',
    fontSize: '14px',
    flexShrink: 0
  },
  userName: {
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--text)'
  },
  userRole: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    letterSpacing: '0.5px'
  },
  main: {
    marginLeft: '220px',
    flex: 1,
    padding: '28px',
    minHeight: '100vh'
  }
}
