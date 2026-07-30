import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('todo atendimento exibido no historico pode imprimir a ficha', async () => {
  const source = await readFile(new URL('../src/modules/petshop/pages/AgendaPage.jsx', import.meta.url), 'utf8')
  const marker = 'aria-label="Imprimir ficha do historico"'
  const first = source.indexOf(marker)
  const second = source.indexOf(marker, first + marker.length)
  assert.ok(first >= 0 && second > first)
  assert.equal(source.indexOf(marker, second + marker.length), -1)
  assert.equal(source.includes('aria-label="Reimprimir ficha concluida"'), false)
  assert.equal(source.slice(Math.max(0, first - 180), first).includes("appt.status === 'concluido'"), false)
  assert.equal(source.slice(Math.max(0, second - 180), second).includes('completed &&'), false)
  assert.ok(source.includes('Historico do dia'))
  assert.ok(source.includes('<Receipt size={13}/>'))
  assert.ok(source.includes('<Receipt size={11}/>'))
})
