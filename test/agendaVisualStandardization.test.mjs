import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const agendaPath = new URL('../src/modules/petshop/pages/AgendaIntegratedPage.jsx', import.meta.url)
const migrationPath = new URL('../supabase/migrations/20260731132000_petshop_uppercase_text_standard.sql', import.meta.url)

const read = (url) => readFile(url, 'utf8')

test('cards da agenda usam hierarquia tipografica fixa sem encolher para 8px', async () => {
  const source = await read(agendaPath)

  assert.match(source, /\.yuisync-card-time\s*\{[\s\S]*font-size:\s*11px !important/)
  assert.match(source, /\.yuisync-card-pet\s*\{[\s\S]*font-size:\s*12px !important/)
  assert.match(source, /\.yuisync-card-tutor\s*\{[\s\S]*font-size:\s*10px !important/)
  assert.match(source, /\.yuisync-card-service\s*\{[\s\S]*font-size:\s*10px !important/)
  assert.doesNotMatch(source, /font-size:\s*8px !important/)
})

test('cards de tosa recebem contraste azul sem colorir grupo generico', async () => {
  const source = await read(agendaPath)

  assert.match(source, /data-yuisync-card-kind='grooming'/)
  assert.match(source, /#1e3a8a/)
  assert.match(source, /#172554/)
  assert.match(source, /\['banho\/tosa', 'banho_tosa', 'banho tosa'\]/)
  assert.match(source, /serviceText\.includes\('tosa'\) && !genericGroup/)
})

test('intervalo de 11 as 13 fica recolhivel e abre quando estiver em uso', async () => {
  const source = await read(agendaPath)

  assert.match(source, /LUNCH_START_MINUTES = 11 \* 60/)
  assert.match(source, /LUNCH_END_MINUTES = 13 \* 60/)
  assert.match(source, /LUNCH_COLLAPSED_HEIGHT = 32/)
  assert.match(source, /11:00–13:00 recolhido/)
  assert.match(source, /const collapsed = !lunchInUse/)
  assert.match(source, /11:00–13:00 em uso/)
})

test('migracao corrige dados antigos e mantem padrao em novas gravacoes', async () => {
  const sql = await read(migrationPath)

  assert.match(sql, /update public\.clients/i)
  assert.match(sql, /to_regclass\('public\.pets'\)/i)
  assert.match(sql, /to_regclass\('public\.appointments'\)/i)
  assert.match(sql, /before insert or update on public\.clients/i)
  assert.match(sql, /clients_petshop_uppercase_text/i)
  assert.match(sql, /appointments_petshop_uppercase_text/i)
  assert.match(sql, /array\['name', 'label', 'service_name'\]/i)
  assert.doesNotMatch(sql, /upper\(email\)/i)
  assert.doesNotMatch(sql, /upper\(phone\)/i)
})
