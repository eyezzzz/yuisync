import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  defaultServiceCommissionRate,
  serviceFitsPetSpecies,
  serviceSpeciesTarget,
} from '../src/modules/petshop/lib/appointmentServices.js'
import {
  appointmentCommissionLines,
  hydrateLegacyCommissionAppointments,
} from '../src/modules/petshop/lib/teamCommissionSummary.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('serviços de gato e cachorro respeitam a espécie cadastrada do pet', () => {
  const catBath = { name: 'Banho Gato', species_target: 'cat' }
  const dogBath = { name: 'Banho Pet Porte Pequeno', species_target: 'dog' }
  const generic = { name: 'Hidratação' }

  assert.equal(serviceFitsPetSpecies(catBath, 'cat'), true)
  assert.equal(serviceFitsPetSpecies(catBath, 'dog'), false)
  assert.equal(serviceFitsPetSpecies(dogBath, 'dog'), true)
  assert.equal(serviceFitsPetSpecies(dogBath, 'cat'), false)
  assert.equal(serviceFitsPetSpecies(generic, 'cat'), true)
  assert.equal(serviceFitsPetSpecies(generic, 'dog'), true)
})

test('espécie pode ser inferida de nomes antigos sem sobrescrever serviço genérico', () => {
  assert.equal(serviceSpeciesTarget({ name: 'Banho para gato' }), 'cat')
  assert.equal(serviceSpeciesTarget({ name: 'Banho canino' }), 'dog')
  assert.equal(serviceSpeciesTarget({ name: 'Banho Pet Porte Médio' }), 'dog')
  assert.equal(serviceSpeciesTarget({ name: 'Escovação' }), null)
})

test('padrão é 10 por cento para qualquer tosa e 5 por cento para os demais serviços', () => {
  assert.equal(defaultServiceCommissionRate({ name: 'Tosa máquina' }), 10)
  assert.equal(defaultServiceCommissionRate({ name: 'Tosa tesoura' }), 10)
  assert.equal(defaultServiceCommissionRate({ name: 'Tosa higiênica' }), 10)
  assert.equal(defaultServiceCommissionRate({ name: 'Banho com tosa higiênica' }), 10)
  assert.equal(defaultServiceCommissionRate({ name: 'Banho' }), 5)
  assert.equal(defaultServiceCommissionRate({ name: 'Escovação' }), 5)
  assert.equal(defaultServiceCommissionRate({ name: 'Hidratação' }), 5)
})

test('tosa higiênica permanece em Outros e usa a comissão configurada do serviço', () => {
  const appointment = {
    id: 'hygienic-grooming',
    service_group: 'banho_tosa',
    service_items: [{
      code: 'tosa_higienica',
      name: 'Tosa higiênica',
      group_type: 'banho_tosa',
      unit_price: 50,
    }],
  }
  const [hydrated] = hydrateLegacyCommissionAppointments([appointment], [{
    code: 'tosa_higienica',
    name: 'Tosa higiênica',
    group_type: 'banho_tosa',
    default_price: 50,
    commission_type: 'percentage',
    commission_rate: 10,
  }])
  const [line] = appointmentCommissionLines(hydrated)

  assert.equal(line.category, 'other')
  assert.equal(line.rate, 0.10)
  assert.equal(line.commission_rate, 10)
  assert.equal(line.commission, 5)
})

test('taxa personalizada da aba Serviços prevalece sobre o padrão 10/5', () => {
  const appointment = {
    id: 'custom-rate',
    service_group: 'banho_tosa',
    service_items: [{
      code: 'tosa_especial',
      name: 'Tosa especial',
      group_type: 'banho_tosa',
      unit_price: 100,
    }],
  }
  const [hydrated] = hydrateLegacyCommissionAppointments([appointment], [{
    code: 'tosa_especial',
    name: 'Tosa especial',
    group_type: 'banho_tosa',
    default_price: 100,
    commission_type: 'percentage',
    commission_rate: 12.5,
  }])
  const [line] = appointmentCommissionLines(hydrated)

  assert.equal(line.rate, 0.125)
  assert.equal(line.commission, 12.5)
})

test('Agenda aplica espécie e peso ao mesmo catálogo de serviços', async () => {
  const agenda = await read('src/modules/petshop/pages/AgendaPage.jsx')
  assert.match(agenda, /serviceFitsPetSpecies/)
  assert.match(agenda, /serviceFitsPetWeight/)
  assert.match(agenda, /species_target/)
  assert.match(agenda, /Filtros do pet/)
})

test('aba Serviços centraliza espécie, peso e comissão', async () => {
  const page = await read('src/modules/petshop/pages/ServicosPage.jsx')
  assert.match(page, /Espécie atendida/)
  assert.match(page, /Peso mínimo \(kg\)/)
  assert.match(page, /Comissão \(%\)/)
  assert.match(page, /qualquer tosa = 10%; demais serviços = 5%/)
})

test('migration protege elegibilidade e usa comissão do catálogo no fechamento', async () => {
  const migration = await read('supabase/migrations/20260807155000_petshop_species_and_catalog_commission_rules.sql')
  assert.match(migration, /add column if not exists species_target text/)
  assert.match(migration, /default_petshop_service_commission_rate/)
  assert.match(migration, /validate_petshop_appointment_service_eligibility/)
  assert.match(migration, /catalog\.commission_rate/)
  assert.match(migration, /rated\.commission_percent \/ 100/)
})
