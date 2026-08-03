import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('MotoDog fora de Muriaé custa 30 reais e é tratado como transporte', async () => {
  const { DEFAULT_TRANSPORT_OPTIONS, transportFeeForMode } = await import('../src/modules/petshop/pages/agendaOperationalCore.js')
  const { appointmentTransportLabel, isMotodogTransportMode } = await import('../src/modules/petshop/lib/appointmentOperational.js')
  const option = DEFAULT_TRANSPORT_OPTIONS.find((item) => item.id === 'buscar_e_levar_fora_muriae')

  assert.ok(option)
  assert.equal(option.fee, 30)
  assert.equal(transportFeeForMode(DEFAULT_TRANSPORT_OPTIONS, option.id), 30)
  assert.equal(isMotodogTransportMode(option.id), true)
  assert.match(appointmentTransportLabel(option.id), /fora de Muriaé/)
})

test('catálogo manual possui abas e grava diretamente em petshop_services', async () => {
  const page = await read('src/modules/petshop/pages/ServicosPage.jsx')
  const hook = await read('src/modules/petshop/hooks/usePetshopAdvanced.js')
  const modules = await read('src/config/modules.jsx')
  const migration = await read('supabase/migrations/20260803101500_petshop_manual_services_and_outside_motodog.sql')

  assert.match(page, /Banho\/Tosa/)
  assert.match(page, /Veterinária/)
  assert.match(page, /Motoboy/)
  assert.match(page, /Novo serviço/)
  assert.match(page, /savePetshopService/)
  assert.match(hook, /'motoboy'/)
  assert.match(modules, /servicos: ServicosPage/)
  assert.match(migration, /insert into public\.petshop_services/)
  assert.match(migration, /motodog_buscar_levar_fora_muriae/)
})

test('instruções não ocupam o card ativo e continuam na impressão', async () => {
  const agenda = await read('src/modules/petshop/pages/AgendaPage.jsx')
  const resolved = await read('src/modules/petshop/pages/AgendaResolvedPage.jsx')

  assert.doesNotMatch(agenda, /yuisync-card-instructions/)
  assert.doesNotMatch(agenda, /<strong>Instruções:<\/strong>/)
  assert.match(agenda, /row\('Obs\.', appt\.notes/)
  assert.match(resolved, /line\('Obs\.', appointment\.notes/)
  assert.match(resolved, /appointment\.notes \? `<div class="appointment-line">Obs\.:/)
})
