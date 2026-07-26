import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  classifyProduct,
  detectCatalogRequest,
} from '../server/lib/petbotCatalog.js'
import { mergeInterpretedPetbotServiceFacts } from '../server/lib/petbotAgent.js'

test('peso de antipulgas não transforma o pedido em ração', () => {
  assert.equal(detectCatalogRequest('quero Advocate para gato até 4 kg').type, 'antipulgas')
  assert.equal(detectCatalogRequest('quero Nexgard para cachorro de 8 kg').type, 'antipulgas')
})

test('xampu e bebedouro prevalecem sobre metadados antigos', () => {
  assert.equal(classifyProduct({
    name: 'Cloresten Xampu 200 ml',
    category: 'Higiene',
    bot_metadata: { product_type: 'food', package_kg: 0.2 },
  }).type, 'higiene')
  assert.equal(classifyProduct({
    name: 'Bebedouro Automático 2 Lts',
    category: 'Acessórios',
    bot_metadata: { product_type: 'food' },
  }).type, 'acessorio')
})

test('serviço exato do catálogo sobrevive a turnos genéricos', () => {
  const previousFacts = {
    service_type: 'catalog_f01abc',
    pet_name: 'Nina',
    species: 'dog',
    breed: 'Poodle',
    weight_kg: 7,
  }
  assert.equal(mergeInterpretedPetbotServiceFacts({
    previousFacts,
    interpretation: { service_type: 'tosa', service_date: '2026-08-01' },
  }).service_type, 'catalog_f01abc')
})

test('migration aceita espécies universais sem remover validação real', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260725003000_petbot_universal_service_species.sql', import.meta.url), 'utf8')
  assert.match(sql, /'all'.*'any'.*'todos'.*'todas'.*'qualquer'.*'pet'/s)
  assert.match(sql, /Servico nao corresponde a especie informada/)
  assert.match(sql, /grant execute[\s\S]*service_role/i)
})
