import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../src/shared/hooks/useAppointments.js', import.meta.url), 'utf8')

test('petshop exige confirmação antes de concluir um atendimento', () => {
  assert.match(source, /activeModuleId === 'petshop'/)
  assert.match(source, /status === 'concluido'/)
  assert.match(source, /window\.confirm\('O serviço, valores e cliente\/pet estão preenchidos corretamente\?'\)/)
  assert.match(source, /return Promise\.resolve\(null\)/)
})
