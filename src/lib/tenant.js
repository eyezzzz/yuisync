const TENANT_HINTS = ['tenant_id', 'active_tenant_id', 'profile_tenants', 'tenants']
const SCHEMA_HINTS = ['does not exist', 'schema cache', 'column', 'relation']

export function isTenantSchemaError(error) {
  const msg = String(error?.message || error || '').toLowerCase()
  if (!msg) return false
  return TENANT_HINTS.some((hint) => msg.includes(hint)) && SCHEMA_HINTS.some((hint) => msg.includes(hint))
}

export function applyTenantFilter(query, tenantId, includeTenant = true) {
  if (!includeTenant || !tenantId) return query
  return query.eq('tenant_id', tenantId)
}

export function buildTenantPayload(payload, tenantId, includeTenant = true) {
  if (!includeTenant || !tenantId) return payload
  return { ...payload, tenant_id: tenantId }
}

export async function runWithTenantFallback(tenantId, runner) {
  if (!tenantId) {
    return {
      data: null,
      error: new Error('Selecione uma empresa ativa antes de acessar dados operacionais.'),
    }
  }

  // Compatibilidade temporaria do nome: a operacao agora e sempre tenant-scoped.
  // Nunca repita a consulta sem tenant_id quando o schema estiver divergente.
  return runner(true)
}

export function buildTenantSlug(name) {
  return (name || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}
