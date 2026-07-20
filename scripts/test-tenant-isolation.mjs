import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const required = [
  'TENANT_A_EMAIL', 'TENANT_A_PASSWORD', 'TENANT_A_ID',
  'TENANT_B_EMAIL', 'TENANT_B_PASSWORD', 'TENANT_B_ID',
]
const missing = required.filter((name) => !process.env[name])

if (!url || !anonKey || missing.length) {
  const message = `Teste de isolamento ignorado; faltam: ${[
    ...(!url ? ['SUPABASE_URL'] : []),
    ...(!anonKey ? ['SUPABASE_ANON_KEY'] : []),
    ...missing,
  ].join(', ')}`
  if (process.env.REQUIRE_TENANT_ISOLATION_TESTS === '1') throw new Error(message)
  console.log(message)
  process.exit(0)
}

async function authenticatedClient(email, password) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}

async function assertIsolation(client, ownTenantId, foreignTenantId, label) {
  for (const table of ['clients', 'products', 'appointments', 'sales', 'invoices', 'chat_sessions']) {
    const own = await client.from(table).select('id,tenant_id').eq('tenant_id', ownTenantId).limit(5)
    if (own.error) throw new Error(`${label}/${table}: ${own.error.message}`)
    if ((own.data || []).some((row) => row.tenant_id !== ownTenantId)) {
      throw new Error(`${label}/${table}: consulta propria retornou outro tenant`)
    }

    const foreign = await client.from(table).select('id').eq('tenant_id', foreignTenantId).limit(1)
    if (foreign.error) throw new Error(`${label}/${table}: ${foreign.error.message}`)
    if ((foreign.data || []).length) {
      throw new Error(`${label}/${table}: RLS permitiu leitura do tenant estrangeiro`)
    }
  }
}

const clientA = await authenticatedClient(process.env.TENANT_A_EMAIL, process.env.TENANT_A_PASSWORD)
const clientB = await authenticatedClient(process.env.TENANT_B_EMAIL, process.env.TENANT_B_PASSWORD)

await assertIsolation(clientA, process.env.TENANT_A_ID, process.env.TENANT_B_ID, 'tenant-a')
await assertIsolation(clientB, process.env.TENANT_B_ID, process.env.TENANT_A_ID, 'tenant-b')
console.log('Isolamento entre tenants validado com sucesso.')
