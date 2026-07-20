import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../shared/hooks/useAuth'
import { buildTenantSlug, isTenantSchemaError, runWithTenantFallback } from '../lib/tenant'

export const AuthContext = createContext(null)

const ACTIVE_TENANT_KEY = '@yui_active_tenant'
const LOCAL_TENANTS_KEY = '@yui_local_tenants'
const SUPPORTED_BUSINESS_MODULES = ['petshop']

const DEFAULT_LOCAL_TENANTS = [
  { id: 'cliente-1', name: 'Cliente 1', slug: 'cliente-1' },
  { id: 'cliente-2', name: 'Cliente 2', slug: 'cliente-2' },
]

function readLocalTenants() {
  try {
    const raw = localStorage.getItem(LOCAL_TENANTS_KEY)
    if (!raw) return DEFAULT_LOCAL_TENANTS

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_LOCAL_TENANTS

    return parsed
      .map((tenant) => ({
        id: tenant?.id || '',
        name: tenant?.name || '',
        slug: tenant?.slug || buildTenantSlug(tenant?.name || ''),
      }))
      .filter((tenant) => tenant.id && tenant.name)
  } catch {
    return DEFAULT_LOCAL_TENANTS
  }
}

function writeLocalTenants(tenants) {
  try {
    localStorage.setItem(LOCAL_TENANTS_KEY, JSON.stringify(tenants))
  } catch {
    // ignore localStorage errors
  }
}

function readStoredActiveTenant() {
  try {
    return localStorage.getItem(ACTIVE_TENANT_KEY)
  } catch {
    return null
  }
}

function writeStoredActiveTenant(tenantId) {
  try {
    if (tenantId) localStorage.setItem(ACTIVE_TENANT_KEY, tenantId)
    else localStorage.removeItem(ACTIVE_TENANT_KEY)
  } catch {
    // ignore localStorage errors
  }
}

function pickActiveTenantId(tenants, profileTenantId = null) {
  if (!Array.isArray(tenants) || tenants.length === 0) return null
  const validIds = new Set(tenants.map((tenant) => tenant.id))
  const storedId = readStoredActiveTenant()
  const candidate = [profileTenantId, storedId, tenants[0]?.id].find((id) => id && validIds.has(id))
  return candidate || tenants[0]?.id || null
}

function makeLocalTenant(name) {
  const base = buildTenantSlug(name) || `cliente-${Date.now()}`
  const uid = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.round(Math.random() * 1e6)}`

  return {
    id: `local-${uid}`,
    name,
    slug: base,
  }
}

function fallbackTenantModules(profile) {
  if (profile?.role === 'admin') {
    return ['petshop']
  }
  const allowed = Array.isArray(profile?.allowed_modules) ? profile.allowed_modules : []
  const cleaned = allowed.filter((moduleId) => (
    moduleId
    && moduleId !== 'system'
    && SUPPORTED_BUSINESS_MODULES.includes(moduleId)
  ))
  if (cleaned.length > 0) return [...new Set(cleaned)]
  return ['petshop']
}

export function AuthProvider({ children }) {
  const auth = useAuth()
  const location = useLocation()
  const [storeSettings, setStoreSettings] = useState({
    store_name: '',
    store_address: '',
    store_neighborhood: '',
    store_city: '',
    store_phone: '',
    printer_width: '32',
    module_id: null,
  })

  const [tenants, setTenants] = useState([])
  const [activeTenantId, setActiveTenantId] = useState(null)
  const [tenantLoading, setTenantLoading] = useState(false)
  const [tenantMode, setTenantMode] = useState('database')
  const [tenantError, setTenantError] = useState('')
  const [tenantEnabledModules, setTenantEnabledModules] = useState(['petshop'])

  const loadTenantScope = useCallback(async () => {
    if (!auth.session || !auth.profile?.id) {
      setTenants([])
      setActiveTenantId(null)
      setTenantMode('database')
      setTenantError('')
      return
    }

    setTenantLoading(true)
    setTenantError('')

    try {
      const { data, error } = await supabase
        .from('profile_tenants')
        .select('tenant_id, active, tenants(id, name, slug, active)')
        .eq('profile_id', auth.profile.id)
        .eq('active', true)

      if (error) {
        if (!isTenantSchemaError(error)) {
          throw error
        }

        const localTenants = readLocalTenants()
        setTenantMode('local')
        setTenants(localTenants)
        const fallbackTenant = pickActiveTenantId(localTenants, auth.profile?.active_tenant_id)
        setActiveTenantId(fallbackTenant)
        writeStoredActiveTenant(fallbackTenant)
        return
      }

      const mappedTenants = (data || [])
        .map((entry) => ({
          id: entry?.tenants?.id || entry?.tenant_id,
          name: entry?.tenants?.name || 'Cliente sem nome',
          slug: entry?.tenants?.slug || buildTenantSlug(entry?.tenants?.name || ''),
        }))
        .filter((tenant) => tenant.id)

      if (mappedTenants.length === 0) {
        const localTenants = readLocalTenants()
        setTenantMode('local')
        setTenants(localTenants)
        const fallbackTenant = pickActiveTenantId(localTenants, auth.profile?.active_tenant_id)
        setActiveTenantId(fallbackTenant)
        writeStoredActiveTenant(fallbackTenant)
        return
      }

      setTenantMode('database')
      setTenants(mappedTenants)
      const chosenTenantId = pickActiveTenantId(mappedTenants, auth.profile?.active_tenant_id)
      setActiveTenantId(chosenTenantId)
      writeStoredActiveTenant(chosenTenantId)
    } catch (error) {
      const localTenants = readLocalTenants()
      setTenantMode('local')
      setTenants(localTenants)
      const fallbackTenant = pickActiveTenantId(localTenants, auth.profile?.active_tenant_id)
      setActiveTenantId(fallbackTenant)
      writeStoredActiveTenant(fallbackTenant)
      setTenantError(error instanceof Error ? error.message : 'Nao foi possivel carregar as instancias.')
    } finally {
      setTenantLoading(false)
    }
  }, [auth.session, auth.profile?.id, auth.profile?.active_tenant_id])

  useEffect(() => {
    loadTenantScope()
  }, [loadTenantScope])

  const switchTenant = useCallback(async (tenantId) => {
    if (!tenantId) return

    setActiveTenantId(tenantId)
    writeStoredActiveTenant(tenantId)

    if (tenantMode !== 'database' || !auth.profile?.id) return

    const { error } = await supabase
      .from('profiles')
      .update({
        active_tenant_id: tenantId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', auth.profile.id)

    if (error && !isTenantSchemaError(error)) {
      throw error
    }
  }, [auth.profile?.id, tenantMode])

  const createTenant = useCallback(async (name) => {
    const cleanName = (name || '').toString().trim()
    if (!cleanName) {
      throw new Error('Informe um nome para a instancia.')
    }

    if (tenantMode === 'database' && auth.profile?.id) {
      const baseSlug = buildTenantSlug(cleanName) || `cliente-${Date.now()}`
      let slug = baseSlug
      let createdTenant = null

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { data, error } = await supabase
          .from('tenants')
          .insert({
            name: cleanName,
            slug,
            active: true,
          })
          .select('id, name, slug')
          .single()

        if (!error) {
          createdTenant = data
          break
        }

        if (isTenantSchemaError(error)) {
          break
        }

        const msg = String(error.message || '').toLowerCase()
        if (msg.includes('duplicate') || msg.includes('unique')) {
          slug = `${baseSlug}-${Math.floor(Math.random() * 9999)}`
          continue
        }

        throw error
      }

      if (createdTenant) {
        const { error: linkError } = await supabase
          .from('profile_tenants')
          .upsert({
            profile_id: auth.profile.id,
            tenant_id: createdTenant.id,
            role: 'owner',
            active: true,
          }, { onConflict: 'profile_id,tenant_id' })

        if (linkError && !isTenantSchemaError(linkError)) {
          throw linkError
        }

        await loadTenantScope()
        await switchTenant(createdTenant.id)
        return createdTenant
      }
    }

    const localTenants = readLocalTenants()
    const nextTenant = makeLocalTenant(cleanName)
    const updatedTenants = [nextTenant, ...localTenants]
    writeLocalTenants(updatedTenants)
    setTenantMode('local')
    setTenants(updatedTenants)
    await switchTenant(nextTenant.id)
    return nextTenant
  }, [tenantMode, auth.profile?.id, loadTenantScope, switchTenant])

  const loadTenantEnabledModules = useCallback(async () => {
    if (!auth.session || !auth.profile) {
      setTenantEnabledModules(['petshop'])
      return
    }

    if (!activeTenantId || tenantMode !== 'database') {
      setTenantEnabledModules(fallbackTenantModules(auth.profile))
      return
    }

    try {
      const moduleSet = new Set()

      const settingsResponse = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
        let query = supabase
          .from('settings')
          .select('module_id')

        if (includeTenant && activeTenantId) {
          query = query.eq('tenant_id', activeTenantId)
        }

        return query
      })

      if (settingsResponse.error && !isTenantSchemaError(settingsResponse.error)) {
        throw settingsResponse.error
      }

      for (const row of settingsResponse.data || []) {
        const moduleId = String(row?.module_id || '')
        if (SUPPORTED_BUSINESS_MODULES.includes(moduleId)) moduleSet.add(moduleId)
      }

      const membersResponse = await supabase
        .from('profile_tenants')
        .select('profile_id, profiles(role, module_permissions)')
        .eq('tenant_id', activeTenantId)
        .eq('active', true)

      if (membersResponse.error && !isTenantSchemaError(membersResponse.error)) {
        throw membersResponse.error
      }

      for (const membership of membersResponse.data || []) {
        const memberProfile = membership?.profiles
        if (!memberProfile || memberProfile.role === 'admin') continue
        const permissions = memberProfile.module_permissions || {}
        for (const moduleId of Object.keys(permissions)) {
          if (SUPPORTED_BUSINESS_MODULES.includes(moduleId)) moduleSet.add(moduleId)
        }
      }

      if (moduleSet.size === 0) {
        fallbackTenantModules(auth.profile).forEach((moduleId) => moduleSet.add(moduleId))
      }

      setTenantEnabledModules(Array.from(moduleSet))
    } catch (error) {
      console.warn('Falha ao carregar modulos habilitados por instancia, usando fallback:', error)
      setTenantEnabledModules(fallbackTenantModules(auth.profile))
    }
  }, [auth.session, auth.profile, activeTenantId, tenantMode])

  useEffect(() => {
    loadTenantEnabledModules()
  }, [loadTenantEnabledModules])

  useEffect(() => {
    if (auth.session && auth.profile && activeTenantId) {
      const parts = location.pathname.split('/').filter(Boolean)
      const routeModuleId = parts[0] || null

      const isAdmin = auth.profile.role === 'admin'
      const allowed = auth.profile.allowed_modules || []
      const hasPerm = isAdmin || allowed.includes(routeModuleId)

      if (routeModuleId && hasPerm) {
        loadSettings(routeModuleId)
      } else {
        setStoreSettings({ store_name: 'Carregando...', module_id: null })
      }
    } else if (!auth.session || !auth.profile) {
      setStoreSettings({ store_name: '', module_id: null })
    } else {
      setStoreSettings({ store_name: 'Carregando...', module_id: null })
    }
  }, [auth.session, auth.profile, location.pathname, activeTenantId])

  async function loadSettings(moduleId) {
    if (!moduleId && !auth.session) return

    try {
      const response = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
        let query = supabase.from('settings').select('*')

        if (moduleId) query = query.eq('module_id', moduleId)
        else query = query.limit(1)

        if (includeTenant && activeTenantId) {
          query = query.eq('tenant_id', activeTenantId)
        }

        return query
      })

      if (response.error) throw response.error

      const data = response.data || []
      if (data.length > 0) {
        setStoreSettings(data[0])
      } else {
        const moduleFallbackName = {
          petshop: 'PetShop CRM',
        }
        setStoreSettings({
          store_name: moduleFallbackName[moduleId] || 'YUI Sync',
          module_id: moduleId,
          printer_width: '32',
        })
      }
    } catch (error) {
      console.log('Using default module settings')
    }
  }

  const value = useMemo(() => ({
    ...auth,
    storeSettings,
    refreshSettings: loadSettings,
    lastModuleId: localStorage.getItem('@app_module'),
    tenants,
    activeTenantId,
    tenantLoading,
    tenantMode,
    tenantError,
    switchTenant,
    createTenant,
    refreshTenants: loadTenantScope,
    tenantEnabledModules,
    refreshTenantModules: loadTenantEnabledModules,
  }), [auth, storeSettings, tenants, activeTenantId, tenantLoading, tenantMode, tenantError, switchTenant, createTenant, loadTenantScope, tenantEnabledModules, loadTenantEnabledModules])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuthCtx = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuthCtx must be used within an AuthProvider')
  }
  return context
}
