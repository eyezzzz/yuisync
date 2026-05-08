import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const SUPABASE_URL = requireEnv('SUPABASE_URL')
export const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
export const OPENAI_API_KEY = requireEnv('OPENAI_API_KEY')

let cachedClient: SupabaseClient | null = null

export function getAdminSupabase(): SupabaseClient {
  if (cachedClient) return cachedClient

  cachedClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return cachedClient
}
