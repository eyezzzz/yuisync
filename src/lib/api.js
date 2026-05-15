import { supabase } from './supabase'

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error('Sua sessão expirou. Faça login novamente.')
  }

  return session.access_token
}

async function apiRequest(path, options = {}) {
  const token = await getAccessToken()
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.error || 'Erro ao processar a solicitação.')
  }

  return payload
}

export function requestChatReply(sessionId, message, options = {}) {
  return apiRequest('/chat/respond', {
    method: 'POST',
    body: JSON.stringify({ sessionId, message, ...options }),
  })
}

export function sendHumanChatMessage(sessionId, message) {
  return apiRequest('/chat/human-message', {
    method: 'POST',
    body: JSON.stringify({ sessionId, message }),
  })
}

export async function listManagedUsers(moduleId, options = {}) {
  const params = new URLSearchParams()
  if (moduleId) params.set('module_id', moduleId)
  if (options.tenantId) params.set('tenant_id', options.tenantId)
  const query = params.size ? `?${params.toString()}` : ''
  const { profiles } = await apiRequest(`/admin/users${query}`, { method: 'GET' })
  return profiles || []
}

export function createManagedUser(payload) {
  return apiRequest('/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateManagedUser(userId, payload) {
  return apiRequest(`/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function updateManagedUserStatus(userId, active) {
  return apiRequest(`/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  })
}

export function issueFiscalForSale(saleId) {
  return apiRequest(`/fiscal/sales/${saleId}/issue`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function resetChatHistory({ moduleId, tenantId }) {
  return apiRequest('/admin/maintenance/reset-chat', {
    method: 'POST',
    body: JSON.stringify({
      moduleId,
      tenantId,
      confirm: 'RESET_CHAT_HISTORY',
    }),
  })
}

export function resetStock({ moduleId, tenantId }) {
  return apiRequest('/admin/maintenance/reset-stock', {
    method: 'POST',
    body: JSON.stringify({
      moduleId,
      tenantId,
      confirm: 'RESET_STOCK',
    }),
  })
}

export function importLegacyRows({ kind, rows, moduleId, tenantId }) {
  return apiRequest('/admin/maintenance/legacy-import', {
    method: 'POST',
    body: JSON.stringify({
      kind,
      rows,
      moduleId,
      tenantId,
    }),
  })
}

export function searchProductImages({ name, barcode, category, brand, moduleId, tenantId, limit = 8 }) {
  return apiRequest('/products/image-suggestions', {
    method: 'POST',
    body: JSON.stringify({
      name,
      barcode,
      category,
      brand,
      moduleId,
      tenantId,
      limit,
    }),
  })
}
