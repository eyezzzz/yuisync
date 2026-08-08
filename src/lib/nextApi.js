import { supabase } from './supabase'

const baseUrl = String(import.meta.env.VITE_NEXT_API_URL || '').replace(/\/$/, '')
const nextAuthEnabled = String(import.meta.env.VITE_NEXT_AUTH_ENABLED || '').toLowerCase() === 'true'

export const nextFeature = (domain, operation = 'read') => {
  const key = `VITE_NEXT_${String(domain).toUpperCase()}_${String(operation).toUpperCase()}`
  return String(import.meta.env[key] || '').toLowerCase() === 'true'
}

export const nextDomainEnabled = (domain) => nextFeature(domain, 'read') && nextFeature(domain, 'write')

async function legacyAccessToken() {
  if (nextAuthEnabled) return null
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token || null
}

async function request(path, { method = 'GET', tenantId, moduleId, body, idempotencyKey, headers = {} } = {}) {
  if (!baseUrl) throw new Error('VITE_NEXT_API_URL não configurada.')
  const authToken = await legacyAccessToken()
  const finalHeaders = { accept: 'application/json', ...headers }
  if (body !== undefined) finalHeaders['content-type'] = 'application/json'
  if (tenantId) finalHeaders['x-tenant-id'] = tenantId
  if (moduleId) finalHeaders['x-module-id'] = moduleId
  if (idempotencyKey) finalHeaders['x-idempotency-key'] = idempotencyKey
  if (authToken) finalHeaders.authorization = `Bearer ${authToken}`
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    credentials: 'include',
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Edge API retornou ${response.status}.`)
    error.code = payload?.error?.code || 'EDGE_API_ERROR'
    error.status = response.status
    error.details = payload?.error?.details
    throw error
  }
  return payload?.data ?? payload
}

const scope = (tenantId, moduleId) => ({ tenantId, moduleId })
const idem = () => crypto.randomUUID()
const query = (filters = {}) => new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== '')).toString()
const withQuery = (path, filters = {}) => {
  const suffix = query(filters)
  return suffix ? `${path}?${suffix}` : path
}

export const nextApi = {
  request,
  session: () => request('/v1/session'),
  auth: {
    signIn: (email, password) => request('/api/auth/sign-in/email', { method: 'POST', body: { email, password } }),
    signUp: (name, email, password) => request('/api/auth/sign-up/email', { method: 'POST', body: { name, email, password } }),
    signOut: () => request('/api/auth/sign-out', { method: 'POST', body: {} }),
    session: () => request('/api/auth/get-session'),
  },
  clients: {
    list: (tenantId, moduleId, filters = {}) => request(withQuery('/v1/clients', filters), scope(tenantId, moduleId)),
    get: (tenantId, moduleId, id) => request(`/v1/clients/${id}`, scope(tenantId, moduleId)),
    create: (tenantId, moduleId, body) => request('/v1/clients', { ...scope(tenantId, moduleId), method: 'POST', body }),
    update: (tenantId, moduleId, id, body) => request(`/v1/clients/${id}`, { ...scope(tenantId, moduleId), method: 'PATCH', body }),
    remove: (tenantId, moduleId, id) => request(`/v1/clients/${id}`, { ...scope(tenantId, moduleId), method: 'DELETE' }),
  },
  products: {
    list: (tenantId, moduleId, filters = {}) => request(withQuery('/v1/products', filters), scope(tenantId, moduleId)),
    get: (tenantId, moduleId, id) => request(`/v1/products/${id}`, scope(tenantId, moduleId)),
    create: (tenantId, moduleId, body) => request('/v1/products', { ...scope(tenantId, moduleId), method: 'POST', body }),
    update: (tenantId, moduleId, id, body, idempotencyKey) => request(`/v1/products/${id}`, { ...scope(tenantId, moduleId), method: 'PATCH', body, idempotencyKey }),
    remove: (tenantId, moduleId, id) => request(`/v1/products/${id}`, { ...scope(tenantId, moduleId), method: 'DELETE' }),
  },
  services: {
    list: (tenantId, moduleId, filters = {}) => request(withQuery('/v1/services', filters), scope(tenantId, moduleId)),
    get: (tenantId, moduleId, id) => request(`/v1/services/${id}`, scope(tenantId, moduleId)),
    create: (tenantId, moduleId, body) => request('/v1/services', { ...scope(tenantId, moduleId), method: 'POST', body }),
    update: (tenantId, moduleId, id, body) => request(`/v1/services/${id}`, { ...scope(tenantId, moduleId), method: 'PATCH', body }),
    remove: (tenantId, moduleId, id) => request(`/v1/services/${id}`, { ...scope(tenantId, moduleId), method: 'DELETE' }),
  },
  appointments: {
    list: (tenantId, moduleId, filters = {}) => request(withQuery('/v1/appointments', filters), scope(tenantId, moduleId)),
    get: (tenantId, moduleId, id) => request(`/v1/appointments/${id}`, scope(tenantId, moduleId)),
    create: (tenantId, moduleId, body, idempotencyKey = idem()) => request('/v1/appointments', { ...scope(tenantId, moduleId), method: 'POST', body, idempotencyKey }),
    update: (tenantId, moduleId, id, body) => request(`/v1/appointments/${id}`, { ...scope(tenantId, moduleId), method: 'PATCH', body }),
    remove: (tenantId, moduleId, id) => request(`/v1/appointments/${id}`, { ...scope(tenantId, moduleId), method: 'DELETE' }),
  },
  sales: {
    list: (tenantId, moduleId, filters = {}) => request(withQuery('/v1/sales', filters), scope(tenantId, moduleId)),
    get: (tenantId, moduleId, id) => request(`/v1/sales/${id}`, scope(tenantId, moduleId)),
    create: (tenantId, moduleId, body, idempotencyKey = idem()) => request('/v1/sales', { ...scope(tenantId, moduleId), method: 'POST', body, idempotencyKey }),
  },
  settings: {
    get: (tenantId, moduleId) => request('/v1/settings', scope(tenantId, moduleId)),
    update: (tenantId, moduleId, body) => request('/v1/settings', { ...scope(tenantId, moduleId), method: 'PATCH', body }),
  },
}
