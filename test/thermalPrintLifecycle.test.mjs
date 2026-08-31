import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync('src/lib/thermalPrint.js', 'utf8')

test('impressao termica nao fecha a janela imediatamente apos print', () => {
  assert.doesNotMatch(source, /setTimeout\(\(\) => printWindow\.close\(\),\s*100\)/)
  assert.match(source, /afterprint/)
  assert.match(source, /closeAfterPrint/)
})

test('janela so agenda fechamento depois do ciclo de impressao', () => {
  const printIndex = source.indexOf('printWindow.print()')
  const afterPrintIndex = source.indexOf("printWindow.addEventListener('afterprint'")
  assert.ok(afterPrintIndex > -1)
  assert.ok(printIndex > afterPrintIndex)
  assert.match(source, /if \(!printWindow\.closed\) printWindow\.close\(\)/)
})

test('carregamento de imagens tem fallback sem matar o popup', () => {
  assert.match(source, /image\.addEventListener\('load'/)
  assert.match(source, /image\.addEventListener\('error'/)
  assert.match(source, /setTimeout\(\(\) => \{[\s\S]*printWhenReady\(\)[\s\S]*\}, 1200\)/)
})
