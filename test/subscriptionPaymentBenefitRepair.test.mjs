import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

const migrationPath = 'supabase/migrations/20260803203000_repair_petshop_subscription_benefit_api.sql'

test('migration de reparo reinstala a assinatura exata usada no checkout', async () => {
  const sql = await read(migrationPath)

  const columnIndex = sql.indexOf('add column if not exists services_reserved')
  const functionIndex = sql.indexOf('create or replace function public.consume_petshop_subscription_benefit')

  assert.ok(columnIndex >= 0, 'services_reserved precisa existir antes da API de benefícios')
  assert.ok(functionIndex > columnIndex, 'a coluna deve ser reparada antes da função de consumo')
  assert.match(sql, /create or replace function public\.consume_petshop_subscription_benefit\(\s*p_subscription_id uuid,\s*p_tenant_id uuid,\s*p_candidates text\[\]/)
  assert.match(sql, /public\.change_petshop_subscription_benefit\([\s\S]*'consume'/)
  assert.match(sql, /grant execute on function public\.consume_petshop_subscription_benefit\(uuid, uuid, text\[\]\)/)
  assert.match(sql, /to_regprocedure\('public\.consume_petshop_subscription_benefit\(uuid,uuid,text\[\]\)'\)/)
})

test('reparo mantém reserva, consumo e liberação na mesma API transacional', async () => {
  const sql = await read(migrationPath)

  assert.match(sql, /v_action not in \('reserve', 'consume', 'release'\)/)
  assert.match(sql, /v_used \+ v_reserved >= v_limit/)
  assert.match(sql, /elsif v_action = 'consume'/)
  assert.match(sql, /if v_reserved > 0 then\s*v_reserved := v_reserved - 1;/)
  assert.match(sql, /create or replace function public\.release_petshop_subscription_benefit/)
})

test('todas as formas de pagamento continuam usando o mesmo checkout atômico', async () => {
  const panel = await read('src/modules/petshop/pages/PackageActivationReliablePanel.jsx')

  for (const method of ['dinheiro', 'debito', 'credito', 'pix']) {
    assert.match(panel, new RegExp(`value: '${method}'`))
  }
  assert.match(panel, /supabase\.rpc\('checkout_petshop_subscription_transaction'/)
})
