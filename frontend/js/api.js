// js/api.js — All API calls to RevTrack backend
// Auto-detect: works whether opened via localhost:5000 or any other host
const API_BASE = window.location.origin + '/api';

const api = {
  // ── Token management ──────────────────────────────────────────────────
  getToken: () => localStorage.getItem('rt_token'),
  setToken: (t) => localStorage.setItem('rt_token', t),
  clearToken: () => localStorage.removeItem('rt_token'),

  // ── Core fetch wrapper ────────────────────────────────────────────────
  async req(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = api.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${API_BASE}${path}`, opts);
    const data = await res.json();

    if (res.status === 401) {
      api.clearToken();
      window.location.reload();
      return;
    }
    if (!data.success) throw new Error(data.message || 'Request failed');
    return data;
  },

  get:    (path)        => api.req('GET',    path),
  post:   (path, body)  => api.req('POST',   path, body),
  patch:  (path, body)  => api.req('PATCH',  path, body),
  delete: (path)        => api.req('DELETE', path),

  // ── Auth ──────────────────────────────────────────────────────────────
  login:    (email, password)       => api.post('/auth/login',    { email, password }),
  register: (body)                  => api.post('/auth/register', body),
  me:       ()                      => api.get('/auth/me'),
  updateProfile: (body)             => api.patch('/auth/profile', body),

  // ── Vehicles ──────────────────────────────────────────────────────────
  getVehicles:   ()     => api.get('/vehicles'),
  addVehicle:    (body) => api.post('/vehicles', body),
  getVehicle:    (id)   => api.get(`/vehicles/${id}`),
  updateVehicle: (id, body) => api.patch(`/vehicles/${id}`, body),
  deleteVehicle: (id)   => api.delete(`/vehicles/${id}`),
  getHealth:     (id)   => api.get(`/vehicles/${id}/health`),
  resyncVehicle: (id)   => api.post(`/vehicles/${id}/resync`),

  // ── Services ──────────────────────────────────────────────────────────
  getServices:   (vehicleId) => api.get(`/services${vehicleId ? '?vehicle_id=' + vehicleId : ''}`),
  logService:    (body)      => api.post('/services', body),
  deleteService: (id)        => api.delete(`/services/${id}`),
  getUpcoming:   ()          => api.get('/services/upcoming'),

  // ── Notifications ─────────────────────────────────────────────────────
  getNotifications: (type) => api.get(`/notifications${type ? '?type=' + type : ''}`),
  getNotifStats:    ()     => api.get('/notifications/stats'),

  // ── Catalogue ─────────────────────────────────────────────────────────
  getCatalogue: (type, fuel) => api.get(`/catalogue?type=${type}&fuel_type=${fuel || 'any'}`),
};
