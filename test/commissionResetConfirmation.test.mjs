import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('zerar fechamento exige confirmação explícita antes de alterar o ciclo', async () => {
  const page = await read('src/modules/petshop/pages/EquipePage.jsx')

  assert.match(page, /window\.confirm\(/)
  assert.match(page, /Zerar o fechamento atual\?/)
  assert.match(page, /Os agendamentos nao serao apagados/)
  assert.match(page, /if \(!window\.confirm\([\s\S]*?\)\) return/)
})
