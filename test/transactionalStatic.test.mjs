import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('PDV ativo usa exclusivamente o checkout transacional', async () => {
  const source = await read('src/shared/hooks/useSales.js')
  const activeFlow = source.slice(source.indexOf('const createSale ='), source.indexOf('const issueSaleFiscal'))
  assert.match(activeFlow, /checkoutPetshop\(/)
  assert.doesNotMatch(activeFlow, /\.from\(['"]sales['"]\)\.insert/)
  assert.match(activeFlow, /crypto\.randomUUID\(\)/)
})

test('agenda cria reserva e consome beneficio na mesma RPC', async () => {
  const source = await read('src/shared/hooks/useAppointments.js')
  const createFlow = source.slice(source.indexOf('const create = useCallback'), source.indexOf('const update = useCallback'))
  assert.match(createFlow, /book_petshop_appointment_transaction/)
  assert.doesNotMatch(createFlow, /consumeSubscriptionBenefit/)
})

test('taxa MotoDog publica nao e enviada pelo navegador', async () => {
  const source = await read('src/public/pages/PublicBookingPage.jsx')
  assert.doesNotMatch(source, /p_motodog_fee/)
  assert.doesNotMatch(source, /Taxa MotoDog \(R\$\)/)
})

test('migracao protege estoque, idempotencia e conflito de agenda', async () => {
  const migration = await read('supabase/migrations/20260720002000_transactional_operations.sql')
  assert.match(migration, /create table if not exists public\.stock_movements/)
  assert.match(migration, /for update/)
  assert.match(migration, /sales_tenant_idempotency_unique/)
  assert.match(migration, /prevent_appointment_overlap/)
  assert.match(migration, /record_fiscal_queue_failure/)
})

test('reset de estoque preserva itens e vendas historicas', async () => {
  const source = await read('serverless/dashboardApi.ts')
  const resetFlow = source.slice(source.indexOf('async function handleResetStock'), source.indexOf('function normalizeLegacyString'))
  assert.doesNotMatch(resetFlow, /from\(['"]sale_items['"]\)[\s\S]*?\.delete\(/)
  assert.match(resetFlow, /stock_quantity:\s*0/)
})

test('deploy permanece dentro do limite de funcoes do Vercel Hobby', async () => {
  const apiFiles = await readdir(new URL('api/', root), { recursive: true })
  const serverlessFunctions = apiFiles.filter((path) => path.endsWith('.ts'))
  assert.ok(
    serverlessFunctions.length <= 12,
    `O deploy possui ${serverlessFunctions.length} funcoes serverless; o limite do Hobby e 12.`,
  )
})

test('historico de vendas desambigua o relacionamento com vendedor', async () => {
  const source = await read('src/shared/hooks/useSales.js')
  assert.match(source, /profiles!sales_profile_id_fkey\s*\(/)
  assert.doesNotMatch(source, /['"]profiles\s*\(/)
})
