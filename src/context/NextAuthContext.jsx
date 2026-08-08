import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { nextApi } from '../lib/nextApi'
import { useNextAuth } from '../shared/hooks/useNextAuth'
import { AuthContext } from './LegacyAuthContext'

const ACTIVE_TENANT_KEY = '@yui_active_tenant'

function readActiveTenant() {
  try { return localStorage.getItem(ACTIVE_TENANT_KEY) } catch { return null }
}
function writeActiveTenant(value) {
  try { if (value) localStorage.setItem(ACTIVE_TENANT_KEY, value); else localStorage.removeItem(ACTIVE_TENANT_KEY) } catch {}
}

export function NextAuthProvider({ children }) {
  const auth = useNextAuth()
  const location = useLocation()
  const [activeTenantId, setActiveTenantId] = useState(null)
  const [storeSettings, setStoreSettings] = useState({ store_name: '', module_id: null })
  const [tenantError, setTenantError] = useState('')

  const tenants = useMemo(() => {
    const byId = new Map()
    for (const membership of auth.memberships || []) {
      if (!membership?.tenantId) continue
      if (!byId.has(membership.tenantId)) byId.set(membership.tenantId, { id: membership.tenantId, name: membership.tenantName || membership.tenantId, slug: membership.tenantId })
    }
    return [...byId.values()]
  }, [auth.memberships])

  useEffect(() => {
    if (!auth.session?.user?.id) { setActiveTenantId(null); writeActiveTenant(null); return }
    const valid = new Set(tenants.map((tenant) => tenant.id))
    const stored = readActiveTenant()
    const next = stored && valid.has(stored) ? stored : tenants[0]?.id || null
    setActiveTenantId(next)
    writeActiveTenant(next)
  }, [auth.session?.user?.id, tenants])

  const activeMemberships = useMemo(() => (auth.memberships || []).filter((entry) => entry.tenantId === activeTenantId), [auth.memberships, activeTenantId])
  const tenantEnabledModules = useMemo(() => [...new Set(activeMemberships.map((entry) => entry.moduleId).filter(Boolean))], [activeMemberships])
  const profile = useMemo(() => {
    if (!auth.profile) return null
    const role = activeMemberships.some((entry) => entry.role === 'admin') ? 'admin' : activeMemberships[0]?.role || auth.profile.role || 'employee'
    return {
      ...auth.profile,
      role,
      allowed_modules: tenantEnabledModules,
      module_permissions: Object.fromEntries(activeMemberships.map((entry) => [entry.moduleId, entry.permissions || []])),
      active_tenant_id: activeTenantId,
    }
  }, [auth.profile, activeMemberships, tenantEnabledModules, activeTenantId])

  const switchTenant = useCallback(async (tenantId) => {
    if (!tenants.some((tenant) => tenant.id === tenantId)) throw new Error('Instância não disponível para este usuário.')
    setActiveTenantId(tenantId)
    writeActiveTenant(tenantId)
  }, [tenants])

  const loadSettings = useCallback(async (moduleId) => {
    if (!activeTenantId || !moduleId || !tenantEnabledModules.includes(moduleId)) {
      setStoreSettings({ store_name: 'YUI Sync', module_id: moduleId || null })
      return
    }
    try {
      const data = await nextApi.settings.get(activeTenantId, moduleId)
      setStoreSettings(data || { store_name: 'YUI Sync', module_id: moduleId })
      setTenantError('')
    } catch (error) {
      setTenantError(error?.message || 'Não foi possível carregar as configurações.')
      setStoreSettings({ store_name: 'YUI Sync', module_id: moduleId })
    }
  }, [activeTenantId, tenantEnabledModules])

  useEffect(() => {
    const routeModuleId = location.pathname.split('/').filter(Boolean)[0] || null
    if (auth.session?.user?.id && routeModuleId) loadSettings(routeModuleId)
    else if (!auth.session?.user?.id) setStoreSettings({ store_name: '', module_id: null })
  }, [auth.session?.user?.id, location.pathname, loadSettings])

  const createTenant = useCallback(async () => {
    throw new Error('Criação de instância ainda não está habilitada no Edge API.')
  }, [])

  const updateStoreSettings = useCallback((patch) => {
    setStoreSettings((current) => ({ ...current, ...(typeof patch === 'function' ? patch(current) : patch || {}) }))
  }, [])

  const value = useMemo(() => ({
    ...auth,
    profile,
    storeSettings,
    updateStoreSettings,
    refreshSettings: loadSettings,
    lastModuleId: localStorage.getItem('@app_module'),
    tenants,
    activeTenantId,
    tenantLoading: auth.loading,
    tenantMode: 'edge',
    tenantError,
    switchTenant,
    createTenant,
    refreshTenants: auth.refresh,
    tenantEnabledModules,
    refreshTenantModules: auth.refresh,
  }), [auth, profile, storeSettings, updateStoreSettings, loadSettings, tenants, activeTenantId, tenantError, switchTenant, createTenant, tenantEnabledModules])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
