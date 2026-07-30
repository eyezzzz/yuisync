import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  SERVICE_CATALOG_PAGE_SIZE,
  fetchAllServiceCatalogPages,
} from '../src/modules/petshop/lib/serviceCatalogPagination.js'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

function pagedBuilder(rows, calls) {
  return () => ({
    async range(from, to) {
      calls.push([from, to])
      return { data: rows.slice(from, to + 1), error: null }
    },
  })
}

test('agenda carrega servico de tosa mesmo depois da linha mil', async () => {
  const rows = Array.from({ length: SERVICE_CATALOG_PAGE_SIZE + 5 }, (_, index) => ({
    id: `product-${String(index).padStart(4, '0')}`,
    name: index === SERVICE_CATALOG_PAGE_SIZE + 4 ? 'Tosa completa porte grande' : `Produto ${index}`,
  }))
  const calls = []

  const result = await fetchAllServiceCatalogPages(pagedBuilder(rows, calls))

  assert.equal(result.error, null)
  assert.equal(result.data.length, SERVICE_CATALOG_PAGE_SIZE + 5)
  assert.equal(result.data.at(-1).name, 'Tosa completa porte grande')
  assert.deepEqual(calls, [
    [0, SERVICE_CATALOG_PAGE_SIZE - 1],
    [SERVICE_CATALOG_PAGE_SIZE, SERVICE_CATALOG_PAGE_SIZE * 2 - 1],
  ])
})

test('paginacao interrompe e devolve erro do Supabase', async () => {
  const expected = new Error('falha de consulta')
  let calls = 0
  const result = await fetchAllServiceCatalogPages(() => ({
    async range() {
      calls += 1
      return { data: null, error: expected }
    },
  }))

  assert.equal(calls, 1)
  assert.equal(result.data, null)
  assert.equal(result.error, expected)
})

test('hook pagina produtos e petshop_services com ordenacao estavel', async () => {
  const hook = await read('src/modules/petshop/hooks/usePetshopAdvanced.js')

  assert.equal((hook.match(/fetchAllServiceCatalogPages\(\(\) =>/g) || []).length, 2)
  assert.match(hook, /from\('products'\)[\s\S]*?\.order\('name',[\s\S]*?\.order\('id'/)
  assert.match(hook, /from\('petshop_services'\)[\s\S]*?\.order\('id'/)
  assert.doesNotMatch(hook, /\.limit\(1000\)/)
})
