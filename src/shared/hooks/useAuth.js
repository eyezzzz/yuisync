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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)

      if (nextSession) fetchProfile(nextSession.user.id)
      else {
        setProfile(null)
        setLoading(false)
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
        .single()

      if (error) throw error

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
    const result = await supabase.auth.signInWithPassword({ email, password })

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

    if (!profile?.active) {
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
