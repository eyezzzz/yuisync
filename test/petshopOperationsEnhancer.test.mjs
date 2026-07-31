import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { formatCepInput, lookupBrazilianCep, normalizeCep } from '../src/modules/petshop/lib/cepLookup.js'

test('normaliza e formata CEP brasileiro', () => {
  assert.equal(normalizeCep('12.345-678'), '12345678')
  assert.equal(formatCepInput('12345678'), '12345-678')
})

test('consulta CEP e devolve endereco em caixa alta', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        cep: '01001-000',
        logradouro: 'Praca da Se',
        bairro: 'Se',
        localidade: 'Sao Paulo',
        uf: 'SP',
        complemento: 'lado impar',
      }
    },
  })

  try {
    const result = await lookupBrazilianCep('01001000')
    assert.deepEqual(result, {
      zip_code: '01001-000',
      owner_address: 'PRACA DA SE',
      owner_neighborhood: 'SE',
      owner_city: 'SAO PAULO - SP',
      address_complement: 'LADO IMPAR',
    })
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('agenda restaura somente estilos que ela mesma aplicou', async () => {
  const source = await readFile(new URL('../src/modules/petshop/pages/AgendaIntegratedPage.jsx', import.meta.url), 'utf8')
  assert.match(source, /const managedStyles = new WeakMap\(\)/)
  assert.match(source, /element\.style\[property\] === values\.applied/)
  assert.match(source, /resetLunchColumn\(labelColumn\)[\s\S]*resetLunchColumn\(contentColumn\)/)
  assert.match(source, /lunchPreference = collapsed \? 'expanded' : 'collapsed'/)
})

test('densidade preserva pet tutor servico valor e MotoDog', async () => {
  const source = await readFile(new URL('../src/modules/petshop/pages/AgendaIntegratedPage.jsx', import.meta.url), 'utf8')
  assert.match(source, /count <= 2[\s\S]*count === 3[\s\S]*count === 4/)
  assert.match(source, /data-yuisync-motodog='false'/)
  assert.doesNotMatch(source, /\[data-yuisync-density='micro'\] \.yuisync-card-tutor\s*\{\s*display: none/)
  assert.match(source, /PACOTE · R\$ 0,00/)
  assert.match(source, /data-yuisync-card-kind='package'/)
})

test('CEP cadastro rapido e impressao 80 mm ficam isolados no aprimorador', async () => {
  const [enhancer, router] = await Promise.all([
    readFile(new URL('../src/modules/petshop/components/PetshopOperationsEnhancer.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/router/AppRouter.jsx', import.meta.url), 'utf8'),
  ])
  assert.match(enhancer, /Novo cliente/)
  assert.match(enhancer, /Salvar e selecionar/)
  assert.match(enhancer, /Buscar CEP/)
  assert.match(enhancer, /@page \{ size: 80mm auto !important/)
  assert.match(enhancer, /thermalizeTeamPrintWindow/)
  assert.match(router, /activeModuleId === 'petshop' && <PetshopOperationsEnhancer/)
})
