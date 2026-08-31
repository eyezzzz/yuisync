import { supabase } from './supabase'

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Sua sessão expirou. Faça login novamente.')
  }
  return session.access_token
}

async function request(path, options = {}) {
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
    throw new Error(payload.error || 'Unable to load Meta business assets.')
  }
  return payload
}

export function getMetaBusinessReview({ tenantId, moduleId = 'petshop', businessId = '' }) {
  const params = new URLSearchParams({
    tenant_id: tenantId,
    module_id: moduleId,
  })
  if (businessId) params.set('business_id', businessId)
  return request(`/meta-business-review?${params.toString()}`, { method: 'GET' })
}

export function verifyMetaBusinessReviewAdAccount({ tenantId, moduleId = 'petshop', businessId, adAccountId }) {
  return request('/meta-business-review', {
    method: 'POST',
    body: JSON.stringify({
      tenantId,
      moduleId,
      businessId,
      adAccountId,
    }),
  })
}
