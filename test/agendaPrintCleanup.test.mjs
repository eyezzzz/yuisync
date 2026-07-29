import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync('src/modules/petshop/pages/AgendaResolvedPage.jsx', 'utf8')
const appointmentBlock = source.slice(
  source.indexOf('const printAppointment = useCallback'),
  source.indexOf('const printDay = useCallback'),
)
const dayBlock = source.slice(
  source.indexOf('const printDay = useCallback'),
  source.indexOf('const completeAppointment = useCallback'),
)

test('ficha de atendimento nao imprime valores nem checklist', () => {
  assert.equal(appointmentBlock.includes('fmtCurrency('), false)
  assert.equal(appointmentBlock.includes('prices.'), false)
  assert.equal(appointmentBlock.includes('CONTROLE:'), false)
  assert.equal(appointmentBlock.includes('checklist'), false)
  assert.equal(appointmentBlock.includes("line('Endereco'"), false)
})

test('agenda do dia nao imprime valor dos atendimentos', () => {
  assert.equal(dayBlock.includes('fmtCurrency('), false)
  assert.equal(dayBlock.includes('Total:'), false)
})

test('impressao aguarda a logo e possui fallback de configuracao', () => {
  assert.match(source, /receipt_logo_data_url[\s\S]*store_logo_url[\s\S]*logo_url/)
  assert.match(source, /image\.addEventListener\('load'/)
  assert.match(source, /window\.setTimeout\(printWhenReady, 1500\)/)
})

test('tipografia termica foi levemente ampliada', () => {
  assert.match(source, /\.line \{[^}]*font-size: 10px/)
  assert.match(source, /\.appointment-line \{[^}]*font-size: 9\.5px/)
  assert.match(source, /\.footer \{[^}]*font-size: 8\.5px/)
})
