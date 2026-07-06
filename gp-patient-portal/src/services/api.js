// src/services/api.js
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('patient_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('patient_token')
      localStorage.removeItem('patient_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const authApi = {
  login:    (email, password) => api.post('/auth/patient/login', { email, password }),
  logout:   ()               => api.post('/auth/patient/logout'),
  register: (data)           => api.post('/auth/patient/register', data),
}

export const requestsApi = {
  submit:  (data) => api.post('/requests', data),
  getMine: ()     => api.get('/requests/mine'),
  getOne:  (id)   => api.get(`/requests/${id}`),
  cancel:  (id)   => api.patch(`/requests/${id}/status`, { status: 'cancelled' }),
}

export const messagesApi = {
  getMessages:  (requestId)              => api.get(`/requests/${requestId}/messages`),
  sendMessage:  (requestId, body)        => api.post(`/requests/${requestId}/messages`, { body }),
}

export default api
