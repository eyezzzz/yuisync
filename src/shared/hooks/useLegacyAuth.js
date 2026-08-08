import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export function useAuth() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)

      // TOKEN_REFRESHED happens when the tab regains focus or after a while in
      // the background. The profile did not change, so avoid reloading the
      // entire tenant scope and flashing the application loading screen.
      if (nextSession && event !== 'TOKEN_REFRESHED') fetchProfile(nextSession.user.id)
      else {
        if (!nextSession) {
          setProfile(null)
          setLoading(false)
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (error) throw error
      if (!data) {
        await supabase.auth.signOut()
        throw new Error('Perfil da dashboard nao encontrado para este acesso.')
      }

      if (!data.active) {
        await supabase.auth.signOut()
        throw new Error('Seu acesso está desativado.')
      }

      setProfile(data)
    } catch (e) {
      console.error('Erro ao carregar perfil:', e.message)
    } finally {
      setLoading(false)
    }
  }

  const signIn = async (email, password) => {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const result = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })

    if (result.error || !result.data.session?.user?.id) {
      return result
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('active')
      .eq('id', result.data.session.user.id)
      .maybeSingle()

    if (error) {
      await supabase.auth.signOut()
      return { data: { user: null, session: null }, error }
    }

    if (!profile) {
      await supabase.auth.signOut()
      return {
        data: { user: null, session: null },
        error: new Error('Conta autenticada, mas sem perfil na dashboard. Recrie ou repare este acesso no painel de usuarios.'),
      }
    }

    if (!profile.active) {
      await supabase.auth.signOut()
      return {
        data: { user: null, session: null },
        error: new Error('Seu acesso está desativado. Procure um administrador.'),
      }
    }

    return result
  }

  const signOut = () => supabase.auth.signOut()

  return { session, profile, loading, signIn, signOut }
}
