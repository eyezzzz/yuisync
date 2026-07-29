from pathlib import Path

root = Path(__file__).resolve().parents[2]
source_path = root / 'src/modules/petshop/pages/AgendaResolvedPage.jsx'
test_path = root / 'test/agendaPrintCleanup.test.mjs'
workflow_path = root / '.github/workflows/apply-agenda-print-cleanup.yml'
script_path = Path(__file__).resolve()

source = source_path.read_text(encoding='utf-8')
original = source

old_logo = "  const logo = String(storeSettings?.receipt_logo_data_url || '')"
new_logo = """  const logo = String(
    storeSettings?.receipt_logo_data_url
    || storeSettings?.store_logo_url
    || storeSettings?.logo_url
    || '',
  )"""
if old_logo not in source:
    raise RuntimeError('Fonte da logo esperada nao encontrada')
source = source.replace(old_logo, new_logo, 1)

replacements = {
    ".store { font-size: 14px;": ".store { font-size: 15px;",
    ".store-line { margin-top: 1px; font-size: 8px;": ".store-line { margin-top: 1px; font-size: 9px;",
    ".title { margin: 3mm 0 2mm; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 1.6mm 0; font-size: 11px;": ".title { margin: 3mm 0 2mm; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 1.6mm 0; font-size: 12px;",
    ".line { display: grid; grid-template-columns: 18mm minmax(0, 1fr); gap: 1.5mm; padding: .7mm 0; font-size: 9px;": ".line { display: grid; grid-template-columns: 18mm minmax(0, 1fr); gap: 1.5mm; padding: .8mm 0; font-size: 10px;",
    ".line strong { font-size: 8px;": ".line strong { font-size: 9px;",
    ".appointment-title { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2mm; font-size: 10px;": ".appointment-title { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2mm; font-size: 11px;",
    ".appointment-line { margin-top: .7mm; font-size: 8.5px;": ".appointment-line { margin-top: .8mm; font-size: 9.5px;",
    ".footer { margin-top: 3mm; font-size: 7.5px;": ".footer { margin-top: 3mm; font-size: 8.5px;",
}
for old, new in replacements.items():
    if old not in source:
        raise RuntimeError(f'CSS esperado nao encontrado: {old}')
    source = source.replace(old, new, 1)

old_print = """function writeAndPrint(html) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return false
  printWindow.document.write(html)
  printWindow.document.close()
  printThermalReceipt(printWindow)
  return true
}"""
new_print = """function writeAndPrint(html) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return false
  printWindow.document.write(html)
  printWindow.document.close()

  let printed = false
  const printWhenReady = () => {
    if (printed) return
    printed = true
    printThermalReceipt(printWindow)
  }
  const images = [...printWindow.document.images]
  const pendingImages = images.filter((image) => !image.complete)
  if (pendingImages.length === 0) {
    window.setTimeout(printWhenReady, 80)
  } else {
    let remaining = pendingImages.length
    const settleImage = () => {
      remaining -= 1
      if (remaining <= 0) window.setTimeout(printWhenReady, 80)
    }
    pendingImages.forEach((image) => {
      image.addEventListener('load', settleImage, { once: true })
      image.addEventListener('error', settleImage, { once: true })
    })
    window.setTimeout(printWhenReady, 1500)
  }
  return true
}"""
if old_print not in source:
    raise RuntimeError('writeAndPrint esperado nao encontrado')
source = source.replace(old_print, new_print, 1)

price_line = "    const prices = appointmentPriceBreakdown(appointment, transportOptions)\n"
if price_line not in source:
    raise RuntimeError('Calculo de valor da ficha nao encontrado')
source = source.replace(price_line, '', 1)

financial_block = """      <div class="checklist"><strong>CONTROLE:</strong><br/>[ ] Pet recebido &nbsp; [ ] Servico iniciado<br/>[ ] Servico concluido &nbsp; [ ] Tutor avisado</div>
      <div class="details" style="margin-top:2.5mm">
        ${line('Servico', fmtCurrency(prices.service))}
        ${line('Transporte', fmtCurrency(prices.transport))}
      </div>
      <div class="total"><span>TOTAL</span><span>${escapeHtml(fmtCurrency(prices.total))}</span></div>
"""
if financial_block not in source:
    raise RuntimeError('Bloco financeiro/checklist da ficha nao encontrado')
source = source.replace(financial_block, '', 1)
source = source.replace(
    "  }, [serviceLabel, statusBadge, storeSettings, transportOptions])",
    "  }, [serviceLabel, statusBadge, storeSettings])",
    1,
)

day_price_line = "      const prices = appointmentPriceBreakdown(appointment, transportOptions)\n"
if day_price_line not in source:
    raise RuntimeError('Calculo de valor da agenda do dia nao encontrado')
source = source.replace(day_price_line, '', 1)

day_total_line = "          <div class=\"appointment-line\">Total: ${escapeHtml(fmtCurrency(prices.total))}</div>\n"
if day_total_line not in source:
    raise RuntimeError('Linha de valor da agenda do dia nao encontrada')
source = source.replace(day_total_line, '', 1)
source = source.replace(
    "  }, [operationalAppointments, selectedDate, serviceLabel, statusBadge, storeSettings, transportOptions])",
    "  }, [operationalAppointments, selectedDate, serviceLabel, statusBadge, storeSettings])",
    1,
)

if source == original:
    raise RuntimeError('Nenhuma alteracao foi aplicada')

single_start = source.index('  const printAppointment = useCallback')
single_end = source.index('  const printDay = useCallback', single_start)
single_block = source[single_start:single_end]
for forbidden in ['fmtCurrency(', 'prices.', 'CONTROLE:', 'checklist']:
    if forbidden in single_block:
        raise RuntimeError(f'Informacao proibida permaneceu na ficha: {forbidden}')

day_start = source.index('  const printDay = useCallback')
day_end = source.index('  const completeAppointment = useCallback', day_start)
day_block = source[day_start:day_end]
for forbidden in ['fmtCurrency(', 'prices.', 'Total:']:
    if forbidden in day_block:
        raise RuntimeError(f'Informacao de valor permaneceu na agenda do dia: {forbidden}')

source_path.write_text(source, encoding='utf-8')

test_path.write_text("""import assert from 'node:assert/strict'
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
})

test('agenda do dia nao imprime valor dos atendimentos', () => {
  assert.equal(dayBlock.includes('fmtCurrency('), false)
  assert.equal(dayBlock.includes('Total:'), false)
})

test('impressao aguarda a logo e possui fallback de configuracao', () => {
  assert.match(source, /receipt_logo_data_url[\\s\\S]*store_logo_url[\\s\\S]*logo_url/)
  assert.match(source, /image\\.addEventListener\\('load'/)
  assert.match(source, /window\\.setTimeout\\(printWhenReady, 1500\\)/)
})

test('tipografia termica foi levemente ampliada', () => {
  assert.match(source, /\\.line \\{[^}]*font-size: 10px/)
  assert.match(source, /\\.appointment-line \\{[^}]*font-size: 9\\.5px/)
  assert.match(source, /\\.footer \\{[^}]*font-size: 8\\.5px/)
})
""", encoding='utf-8')

for temporary in [workflow_path, script_path]:
    if temporary.exists():
        temporary.unlink()
