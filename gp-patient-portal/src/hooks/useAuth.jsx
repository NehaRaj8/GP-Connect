// src/hooks/useAuth.jsx
import { createContext, useContext, useState } from 'react'
import { authApi } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [patient, setPatient] = useState(() => {
    const saved = localStorage.getItem('patient_user')
    return saved ? JSON.parse(saved) : null
  })
  const [loading, setLoading] = useState(false)

  const login = async (email, password) => {
    setLoading(true)
    try {
      const res = await authApi.login(email, password)
      const { token, patient } = res.data
      localStorage.setItem('patient_token', token)
      localStorage.setItem('patient_user', JSON.stringify(patient))
      setPatient(patient)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Login failed' }
    } finally {
      setLoading(false)
    }
  }

  const register = async (data) => {
    setLoading(true)
    try {
      const res = await authApi.register(data)
      const { token, patient } = res.data
      localStorage.setItem('patient_token', token)
      localStorage.setItem('patient_user', JSON.stringify(patient))
      setPatient(patient)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Registration failed' }
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem('patient_token')
    localStorage.removeItem('patient_user')
    setPatient(null)
  }

  return (
    <AuthContext.Provider value={{ patient, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
