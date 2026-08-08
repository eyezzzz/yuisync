import { useCallback, useEffect, useState } from 'react'
import { nextApi } from '../../lib/nextApi'

export function useNextAuth() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [memberships, setMemberships] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await nextApi.session()
      const user = data?.user || null
      const nextMemberships = data?.memberships || []
      setSession(user ? { user } : null)
      setMemberships(nextMemberships)
      const primary = nextMemberships[0] || null
      const modulePermissions = Object.fromEntries(nextMemberships.map((entry) => [entry.moduleId, entry.permissions || []]))
      setProfile(user ? {
        id: user.id,
        email: user.email,
        full_name: user.name || user.email,
        active: true,
        role: primary?.role || 'employee',
        allowed_modules: [...new Set(nextMemberships.map((entry) => entry.moduleId).filter(Boolean))],
        module_permissions: modulePermissions,
      } : null)
    } catch (error) {
      if (error?.status === 401) {
        setSession(null); setProfile(null); setMemberships([])
      } else {
        console.error('Erro ao carregar sessão Next:', error)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const signIn = async (email, password) => {
    try {
      const data = await nextApi.auth.signIn(String(email || '').trim().toLowerCase(), password)
      await refresh()
      return { data, error: null }
    } catch (error) {
      return { data: { user: null, session: null }, error }
    }
  }
  const signOut = async () => { try { await nextApi.auth.signOut() } finally { setSession(null); setProfile(null); setMemberships([]) } }

  return { session, profile, memberships, loading, signIn, signOut, refresh }
}
