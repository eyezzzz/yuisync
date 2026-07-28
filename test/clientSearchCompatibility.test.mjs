import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { matchesSearchTerms, searchTerms } from '../src/shared/lib/searchMatch.js'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('busca encontra primeiro nome e ultimo sobrenome com nomes intermediarios', () => {
  assert.equal(
    matchesSearchTerms('marcos carvalho', ['Marcos Antonio Pereira de Carvalho']),
    true,
  )
  assert.equal(
    matchesSearchTerms('carvalho marcos', ['Marcos Antonio Pereira de Carvalho']),
    true,
  )
  assert.equal(
    matchesSearchTerms('márcos carválho', ['MARCOS ANTONIO PEREIRA DE CARVALHO']),
    true,
  )
  assert.deepEqual(searchTerms('  Marcos   Carvalho  '), ['marcos', 'carvalho'])
})

test('busca exige que todos os termos informados estejam no cadastro', () => {
  assert.equal(matchesSearchTerms('marcos carvalho', ['Marcos Pereira Silva']), false)
  assert.equal(matchesSearchTerms('marcos thor', ['Marcos Pereira Carvalho', 'Thor']), true)
})

test('agenda consulta cada termo separadamente no backend', async () => {
  const clientsHook = await read('src/shared/hooks/useClients.js')

  assert.match(clientsHook, /searchTerms\(sanitizeSearch\(term\)\)/)
  assert.match(clientsHook, /terms\.reduce/)
  assert.match(clientsHook, /name\.ilike\.\%\$\{currentTerm\}\%/)
})

test('aba clientes usa correspondencia por todos os termos', async () => {
  const clientsPage = await read('src/modules/petshop/pages/PetsPage.jsx')

  assert.match(clientsPage, /matchesSearchTerms\(search/)
  assert.match(clientsPage, /pet\.owner_name/)
  assert.match(clientsPage, /pet\.pet_name/)
})

test('seletor de servico fecha e perde foco depois da escolha', async () => {
  const integratedAgenda = await read('src/modules/petshop/pages/AgendaIntegratedPage.jsx')

  assert.match(integratedAgenda, /Servicos encontrados/)
  assert.match(integratedAgenda, /Buscar servico para adicionar/)
  assert.match(integratedAgenda, /\.blur\(\)/)
  assert.match(integratedAgenda, /new MouseEvent\('mousedown'/)
})

test('migration nao usa o grupo banho_tosa para classificar banho individual', async () => {
  const migration = await read('supabase/migrations/20260728005000_petshop_plan_service_key_fix.sql')

  assert.match(migration, /concat_ws\(' ', p_name, p_code\)/)
  assert.doesNotMatch(migration, /concat_ws\(' ', p_name, p_code, p_group\)/)
  assert.match(migration, /BANHO PET PORTE PEQUENO 0 a 10kg todas as pelagens/)
  assert.match(migration, /<> 'banho'/)
})
