import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20260812130000_petshop_standard_weight_bands.sql', import.meta.url),
  'utf8',
)

test('faixas padrão usam três casas decimais sem sobreposição', () => {
  assert.match(migration, /numeric\(8,3\)/)
  assert.match(migration, /min_weight_kg = 0\.000[\s\S]*max_weight_kg = 10\.099/)
  assert.match(migration, /min_weight_kg = 10\.100[\s\S]*max_weight_kg = 22\.100/)
  assert.match(migration, /min_weight_kg = 22\.101[\s\S]*max_weight_kg = 40\.000/)
})

test('novos serviços por porte recebem a mesma faixa automaticamente', () => {
  assert.match(migration, /apply_petshop_standard_service_weight_band/)
  assert.match(migration, /porte pequen/)
  assert.match(migration, /porte medi/)
  assert.match(migration, /porte grande/)
  assert.match(migration, /before insert or update of name, code, group_type, min_weight_kg, max_weight_kg/)
})

test('faixa manual continua tendo prioridade', () => {
  assert.match(migration, /new\.min_weight_kg is not null[\s\S]*new\.max_weight_kg is not null/)
})
