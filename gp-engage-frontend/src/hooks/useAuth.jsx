// src/hooks/useAuth.jsx
// Auth context — provides login state and user info to all components.

import { createContext, useContext, useState, useEffect } from 'react'
import { authApi } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('gp_user')
    return saved ? JSON.parse(saved) : null
  })
  const [loading, setLoading] = useState(false)

  const login = async (email, password) => {
    setLoading(true)
    try {
      const res = await authApi.login(email, password)
      const { token, user } = res.data
      localStorage.setItem('gp_token', token)
      localStorage.setItem('gp_user', JSON.stringify(user))
      setUser(user)
      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: err.response?.data?.error || 'Login failed'
      }
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    try { await authApi.logout() } catch {}
    localStorage.removeItem('gp_token')
    localStorage.removeItem('gp_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
