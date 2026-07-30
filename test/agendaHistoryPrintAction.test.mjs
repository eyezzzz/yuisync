import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('historico mostra somente reimpressao para atendimentos concluidos', async () => {
  const source = await readFile(new URL('../src/modules/petshop/pages/AgendaPage.jsx', import.meta.url), 'utf8')
  const labels = source.match(/aria-label="Reimprimir ficha concluida"/g) || []
  assert.equal(labels.length, 2)
  assert.equal(source.includes("paymentPending ? 'Receber' : 'Imprimir'"), false)
  assert.equal(source.includes("aria-label={needsPayment(appt) ? 'Receber atendimento concluido'"), false)
  assert.equal(source.includes("title={needsPayment(appt) ? 'Receber e lancar no caixa'"), false)
  assert.match(source, /Historico do dia[\s\S]*onClick=\{\(\) => onReceipt\(appt\)\}[\s\S]*<Receipt size=\{13\}\/>/)
  assert.match(source, /nonBlocking\.map[\s\S]*aria-label="Reimprimir ficha concluida"[\s\S]*<Receipt size=\{11\}\/>/)
})
