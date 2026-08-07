import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  serviceFitsPetWeight,
  serviceWeightRange,
  serviceWeightRangeLabel,
} from '../src/modules/petshop/lib/appointmentServices.js'

test('filtra serviços de banho por porte inferido no nome', () => {
  const small = { name: 'Banho pet porte pequeno', group_type: 'banho_tosa' }
  const medium = { name: 'Banho pet porte médio', group_type: 'banho_tosa' }

  assert.equal(serviceFitsPetWeight(small, 7), true)
  assert.equal(serviceFitsPetWeight(medium, 7), false)
  assert.equal(serviceFitsPetWeight(small, 14), false)
  assert.equal(serviceFitsPetWeight(medium, 14), true)
})

test('respeita a virada de porte em 10 kg', () => {
  const small = { name: 'Banho porte pequeno', group_type: 'banho_tosa' }
  const medium = { name: 'Banho porte médio', group_type: 'banho_tosa' }

  assert.equal(serviceFitsPetWeight(small, 9.9), true)
  assert.equal(serviceFitsPetWeight(medium, 9.9), false)
  assert.equal(serviceFitsPetWeight(small, 10), false)
  assert.equal(serviceFitsPetWeight(medium, 10), true)
})

test('serviços adicionais sem faixa continuam disponíveis para qualquer peso', () => {
  const hygienic = { name: 'Tosa higiênica com detalhes', group_type: 'banho_tosa' }
  const brushing = { name: 'Escovação', group_type: 'banho_tosa' }

  assert.equal(serviceWeightRange(hygienic), null)
  assert.equal(serviceFitsPetWeight(hygienic, 7), true)
  assert.equal(serviceFitsPetWeight(brushing, 32), true)
})

test('faixa configurada explicitamente tem prioridade sobre o nome', () => {
  const service = {
    name: 'Banho porte médio',
    group_type: 'banho_tosa',
    min_weight_kg: 4,
    max_weight_kg: 9,
  }

  assert.deepEqual(serviceWeightRange(service), {
    min: 4,
    max: 9,
    minExclusive: false,
    source: 'configured',
  })
  assert.equal(serviceFitsPetWeight(service, 7), true)
  assert.equal(serviceFitsPetWeight(service, 12), false)
  assert.equal(serviceWeightRangeLabel(service), '4 a 9 kg')
})

test('reconhece faixas de peso escritas diretamente no nome', () => {
  const range = { name: 'Banho 6 a 12 kg', group_type: 'banho_tosa' }
  const max = { name: 'Banho até 10 kg', group_type: 'banho_tosa' }
  const over = { name: 'Banho acima de 20 kg', group_type: 'banho_tosa' }

  assert.equal(serviceFitsPetWeight(range, 8), true)
  assert.equal(serviceFitsPetWeight(range, 14), false)
  assert.equal(serviceFitsPetWeight(max, 8), true)
  assert.equal(serviceFitsPetWeight(max, 11), false)
  assert.equal(serviceFitsPetWeight(over, 20), false)
  assert.equal(serviceFitsPetWeight(over, 21), true)
})

test('pet sem peso cadastrado não bloqueia o catálogo', () => {
  const medium = { name: 'Banho porte médio', group_type: 'banho_tosa' }
  assert.equal(serviceFitsPetWeight(medium, null), true)
  assert.equal(serviceFitsPetWeight(medium, ''), true)
})

test('migration mantém proteção também para gravações diretas no banco', () => {
  const migration = fs.readFileSync(
    new URL('../supabase/migrations/20260807120500_petshop_service_weight_ranges.sql', import.meta.url),
    'utf8',
  )
  assert.match(migration, /min_weight_kg numeric\(7,2\)/)
  assert.match(migration, /max_weight_kg numeric\(7,2\)/)
  assert.match(migration, /validate_petshop_appointment_service_weight/)
  assert.match(migration, /before insert or update\s+on public\.appointments/)
})
