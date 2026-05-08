import { createClient } from '@supabase/supabase-js'
import { serverEnv } from './env.js'

const baseOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
}

export const adminSupabase = createClient(
  serverEnv.supabaseUrl,
  serverEnv.supabaseServiceRoleKey,
  baseOptions
)

export function createUserSupabase(accessToken) {
  return createClient(serverEnv.supabaseUrl, serverEnv.supabaseAnonKey, {
    ...baseOptions,
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })
}
