// src/services/api.js
// All API calls go through this module.
// Automatically attaches the JWT token to every request.
// Redirects to login if token is expired or revoked.

import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
})

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gp_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle auth errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('gp_token')
      localStorage.removeItem('gp_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// ── Auth ──────────────────────────────────────────────────
export const authApi = {
  login: (email, password) =>
    api.post('/auth/staff/login', { email, password }),
  logout: () =>
    api.post('/auth/staff/logout'),
  me: () =>
    api.get('/auth/me')
}

// ── Requests ──────────────────────────────────────────────
export const requestsApi = {
  getAll: (params) =>
    api.get('/requests', { params }),
  getAlerts: () =>
    api.get('/requests/alerts'),
  getOne: (id) =>
    api.get(`/requests/${id}`),
  updateStatus: (id, data) =>
    api.patch(`/requests/${id}/status`, data),
  acknowledgeAlert: (id) =>
    api.patch(`/requests/${id}/acknowledge-alert`)
}

// ── Messages ──────────────────────────────────────────────
export const messagesApi = {
  getMessages: (requestId) =>
    api.get(`/requests/${requestId}/messages`),
  sendMessage: (requestId, body, isInternal = false) =>
    api.post(`/requests/${requestId}/messages`, { body, is_internal: isInternal })
}

// ── Practice ──────────────────────────────────────────────
export const practiceApi = {
  get: () =>
    api.get('/practice'),
  getDemand: () =>
    api.get('/practice/demand/today'),
  updateDemand: (data) =>
    api.patch('/practice/demand', data),
  getStaff: () =>
    api.get('/practice/staff'),
  createStaff: (data) =>
    api.post('/practice/staff', data),
  setDutyGp: (id, isDuty) =>
    api.patch(`/practice/staff/${id}/duty`, { is_duty_gp: isDuty })
}

export default api
