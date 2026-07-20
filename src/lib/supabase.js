import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY

function isPrivateSupabaseKey(key) {
  if (String(key || '').startsWith('sb_secret_')) return true
  try {
    const payload = JSON.parse(atob(String(key || '').split('.')[1] || ''))
    return payload?.role === 'service_role'
  } catch {
    return false
  }
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('[Supabase] Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY antes de iniciar a aplicacao.')
}

if (isPrivateSupabaseKey(SUPABASE_KEY)) {
  throw new Error('[Supabase] Chave privada detectada no frontend. Use somente a anon/publishable key.')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
})

// ── Helpers de data (timezone São Paulo) ─────────────────────────────────────
// Retorna data local formatada: YYYY-MM-DD
export const getLocalISO = (date = new Date()) => {
  const d = new Date(date)
  const z = d.getTimezoneOffset() * 60 * 1000
  const local = new Date(d.getTime() - z)
  return local.toISOString().split('T')[0]
}

export const todayISO = () => getLocalISO()

// Offset do timezone local (ex: -03:00)
export const getTimezoneOffset = () => {
  const offset = new Date().getTimezoneOffset()
  const absOffset = Math.abs(offset)
  const hours = String(Math.floor(absOffset / 60)).padStart(2, '0')
  const minutes = String(absOffset % 60).padStart(2, '0')
  return (offset <= 0 ? '+' : '-') + hours + ':' + minutes
}

export const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' })
}

export const fmtDateTime = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'
  })
}

export const fmtTime = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
}

export const fmtCurrency = (v) =>
  new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(v ?? 0)
