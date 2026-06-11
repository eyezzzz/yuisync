import { HttpError } from './http.js'
import { adminSupabase } from './supabase.js'

const MODULE_ROLE_MAP = {
  petshop: ['admin_pet', 'funcionario_pet'],
}
const DEFAULT_EMPLOYEE_MODULE = 'petshop'
const DEFAULT_EMPLOYEE_ROLE = 'funcionario_pet'

const STAFF_TYPES = ['funcionario', 'banho_tosa', 'veterinaria', 'motodog', 'vendedor_caixa', 'gerente']

const GLOBAL_ADMIN_PERMISSIONS = {
  petshop: 'admin_pet',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,128}$/
const MAX_FULL_NAME_LENGTH = 120
const TENANT_HINTS = ['tenant_id', 'active_tenant_id', 'profile_tenants', 'tenants']

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function sanitizeSupportedPermissions(permissions) {
  const nextPermissions = {}

  for (const [moduleId, roleId] of Object.entries(asObject(permissions))) {
    const allowedRoles = MODULE_ROLE_MAP[moduleId]
    if (!allowedRoles) continue
    if (!allowedRoles.includes(roleId)) {
      throw new HttpError(400, `Invalid role assignment for module "${moduleId}".`)
    }
    nextPermissions[moduleId] = roleId
  }

  return nextPermissions
}

function defaultEmployeePermissions() {
  return { [DEFAULT_EMPLOYEE_MODULE]: DEFAULT_EMPLOYEE_ROLE }
}

export function isTenantSchemaError(error) {
  const msg = String(error?.message || '').toLowerCase()
  if (!msg) return false
  return TENANT_HINTS.some((hint) => msg.includes(hint)) && (
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('column') ||
    msg.includes('relation')
  )
}

export function isStaffTypeSchemaError(error) {
  const msg = String(error?.message || '').toLowerCase()
  if (!msg) return false
  return msg.includes('staff_type') && (
    msg.includes('does not exist')
    || msg.includes('schema cache')
    || msg.includes('column')
  )
}

export function hasModuleAccess(profile, moduleId) {
  if (!profile?.active) return false
  if (profile.role === 'admin') return true
  return asArray(profile.allowed_modules).includes(moduleId)
}

export function isModuleAdmin(profile, moduleId) {
  if (!profile?.active) return false
  if (profile.role === 'admin') return true

  const roleId = asObject(profile.module_permissions)[moduleId]
  return typeof roleId === 'string' && roleId.startsWith('admin_')
}

export async function requireAuthenticatedProfile(accessToken) {
  const { data, error } = await adminSupabase.auth.getUser(accessToken)

  if (error || !data?.user) {
    throw new HttpError(401, 'Invalid or expired session.')
  }

  const { data: profile, error: profileError } = await adminSupabase
    .from('profiles')
    .select('id, full_name, email, role, active, allowed_modules, module_permissions, active_tenant_id')
    .eq('id', data.user.id)
    .maybeSingle()

  if (profileError || !profile) {
    throw new HttpError(403, 'Profile not found.')
  }

  if (!profile.active) {
    throw new HttpError(403, 'This account is inactive.')
  }

  return profile
}

export function normalizeManagedEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function normalizeManagedPassword(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeManagedStaffType(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return STAFF_TYPES.includes(normalized) ? normalized : 'funcionario'
}

export function validateManagedEmail(email) {
  if (!EMAIL_RE.test(email)) {
    throw new HttpError(400, 'Enter a valid email address.')
  }
}

export function validateManagedPassword(password) {
  if (!PASSWORD_RE.test(normalizeManagedPassword(password))) {
    throw new HttpError(400, 'Temporary password must have at least 12 characters, with uppercase, lowercase and number.')
  }
}

export function normalizeUserPayload(payload, requester, scopeModuleId, existingProfile = null) {
  const fullName = typeof payload.full_name === 'string' ? payload.full_name.trim() : ''
  const role = payload.role === 'admin' ? 'admin' : 'employee'
  const permissions = asObject(payload.permissions)
  const staffType = normalizeManagedStaffType(payload.staffType || payload.staff_type || existingProfile?.staff_type)

  if (!fullName) {
    throw new HttpError(400, 'Full name is required.')
  }

  if (fullName.length > MAX_FULL_NAME_LENGTH) {
    throw new HttpError(400, 'Full name is too long.')
  }

  if (role === 'admin') {
    if (requester.role !== 'admin') {
      throw new HttpError(403, 'Only global admins can create or update global admins.')
    }

    return {
      full_name: fullName,
      role: 'admin',
      allowed_modules: Object.keys(GLOBAL_ADMIN_PERMISSIONS),
      module_permissions: { ...GLOBAL_ADMIN_PERMISSIONS },
      staff_type: 'funcionario',
    }
  }

  if (requester.role === 'admin') {
    let nextPermissions = sanitizeSupportedPermissions(permissions)
    if (Object.keys(nextPermissions).length === 0 && existingProfile) {
      nextPermissions = sanitizeSupportedPermissions(existingProfile.module_permissions)
    }

    if (Object.keys(nextPermissions).length === 0) {
      nextPermissions = defaultEmployeePermissions()
    }

    return {
      full_name: fullName,
      role: 'employee',
      allowed_modules: Object.keys(nextPermissions),
      module_permissions: nextPermissions,
      staff_type: staffType,
    }
  }

  if (!scopeModuleId || !isModuleAdmin(requester, scopeModuleId)) {
    throw new HttpError(403, 'You do not have permission to manage users in this module.')
  }

  const allowedRoles = MODULE_ROLE_MAP[scopeModuleId] || []
  const requestedRoleId = permissions[scopeModuleId]

  if (!allowedRoles.includes(requestedRoleId)) {
    throw new HttpError(400, 'Select a valid role for this module.')
  }

  const existingPermissions = asObject(existingProfile?.module_permissions)
  const nextPermissions = {
    ...existingPermissions,
    [scopeModuleId]: requestedRoleId,
  }

  return {
    full_name: fullName,
    role: 'employee',
    allowed_modules: Object.keys(nextPermissions),
    module_permissions: nextPermissions,
    staff_type: staffType,
  }
}

async function loadManageableProfilesBase() {
  const selectWithStaffType = 'id, full_name, email, role, active, allowed_modules, module_permissions, active_tenant_id, created_at, staff_type'
  let response = await adminSupabase
    .from('profiles')
    .select(selectWithStaffType)
    .order('created_at', { ascending: false })

  if (response.error && isStaffTypeSchemaError(response.error)) {
    response = await adminSupabase
      .from('profiles')
      .select('id, full_name, email, role, active, allowed_modules, module_permissions, active_tenant_id, created_at')
      .order('created_at', { ascending: false })
  }

  if (response.error) {
    throw new HttpError(500, 'Unable to load users.')
  }

  return (response.data || []).map((profile) => ({
    ...profile,
    staff_type: profile?.staff_type || 'funcionario',
  }))
}

export async function listManageableProfiles(requester, scopeModuleId, tenantId = null) {
  if (requester.role !== 'admin' && (!scopeModuleId || !isModuleAdmin(requester, scopeModuleId))) {
    throw new HttpError(403, 'You do not have permission to view this user list.')
  }

  const data = await loadManageableProfilesBase()

  const scopedProfiles = requester.role === 'admin'
    ? data
    : data.filter((profile) => {
      if (profile.role === 'admin') return false
      return asArray(profile.allowed_modules).includes(scopeModuleId)
    })

  if (scopedProfiles.length === 0) return []

  const profileIds = scopedProfiles.map((profile) => profile.id)
  const { data: tenantLinks, error: tenantLinksError } = await adminSupabase
    .from('profile_tenants')
    .select('profile_id, tenant_id, tenants(name, slug)')
    .in('profile_id', profileIds)
    .eq('active', true)

  if (tenantLinksError && !isTenantSchemaError(tenantLinksError)) {
    throw new HttpError(500, 'Unable to load tenant access.')
  }

  const byProfileId = new Map()
  for (const row of tenantLinks || []) {
    const current = byProfileId.get(row.profile_id) || []
    current.push({
      id: row.tenant_id,
      name: row.tenants?.name || null,
      slug: row.tenants?.slug || null,
    })
    byProfileId.set(row.profile_id, current)
  }

  const enrichedProfiles = scopedProfiles.map((profile) => {
    const tenants = byProfileId.get(profile.id) || []
    return {
      ...profile,
      tenant_ids: tenants.map((tenant) => tenant.id),
      tenants,
    }
  })

  if (tenantId) {
    return enrichedProfiles.filter((profile) => (profile.tenant_ids || []).includes(tenantId))
  }

  if (requester.role === 'admin') {
    return enrichedProfiles
  }

  if (!scopeModuleId) {
    return enrichedProfiles
  }

  const requesterTenantIds = new Set(
    (enrichedProfiles.find((profile) => profile.id === requester.id)?.tenant_ids || [])
  )

  if (requesterTenantIds.size === 0 && requester.active_tenant_id) {
    requesterTenantIds.add(requester.active_tenant_id)
  }

  if (requesterTenantIds.size === 0) {
    return enrichedProfiles
  }

  return enrichedProfiles.filter((profile) => {
    if (profile.role === 'admin') return false
    return (profile.tenant_ids || []).some((tenantId) => requesterTenantIds.has(tenantId))
  })
}
