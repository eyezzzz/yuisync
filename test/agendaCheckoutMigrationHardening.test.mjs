import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('checkout reconcilia pacote antes da venda e preserva a constraint de produto', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260729172000_petshop_checkout_package_reconciliation.sql', import.meta.url), 'utf8')
  const reconciliationCall = sql.indexOf('perform public.reconcile_petshop_completed_appointment_package(v_appointment_id);')
  const saleInsert = sql.indexOf('insert into public.sales (')

  assert.ok(reconciliationCall >= 0)
  assert.ok(saleInsert > reconciliationCall)
  assert.match(sql, /grant execute on function public\.reconcile_petshop_completed_appointment_package\(uuid\) to authenticated, service_role/)
  assert.match(sql, /if v_product_id is not null then[\s\S]*insert into public\.sale_items/)
  assert.doesNotMatch(sql, /insert into public\.sale_items[\s\S]{0,500}product_id[\s\S]{0,500}\bnull\b/)
})
