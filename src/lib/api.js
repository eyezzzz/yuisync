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
    const error = new Error(payload.error?.message || payload.error || 'Erro ao processar a solicitação.')
    error.status = response.status
    error.code = payload.error?.code || payload.code || ''
    throw error
  }

  return payload
}

export function checkoutPetshop(payload) {
  return apiRequest('/petshop/checkout', {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then((response) => response.data)
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

export function preparePetbotDiagnosticSuite({ tenantId }) {
  return apiRequest('/admin/petbot-e2e', {
    method: 'POST',
    body: JSON.stringify({
      tenantId,
      action: 'plan',
      confirm: 'PREPARE_PETBOT_DIAGNOSTIC_50',
    }),
  })
}

export function runPetbotDiagnosticCase({ tenantId, scenarioId, suiteId }) {
  return apiRequest('/admin/petbot-e2e', {
    method: 'POST',
    body: JSON.stringify({
      tenantId,
      scenarioId,
      suiteId,
      action: 'run_case',
      confirm: 'RUN_PETBOT_DIAGNOSTIC_CASE',
    }),
  })
}

// Mantido para chamadas antigas. O painel novo usa a suíte em casos individuais.
export function runPetbotLiveE2E({ tenantId }) {
  return preparePetbotDiagnosticSuite({ tenantId })
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
