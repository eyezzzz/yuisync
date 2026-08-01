import { useEffect } from 'react'
import { useAuthCtx } from '../../../context/AuthContext'
import { useModuleCtx } from '../../../context/ModuleContext'
import { supabase } from '../../../lib/supabase'
import { printThermalReceipt } from '../../../lib/thermalPrint'
import { applyTenantFilter, runWithTenantFallback } from '../../../lib/tenant'

const normalizeText = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

const SPECIES_LABELS = {
  dog: 'CÃO',
  cat: 'GATO',
  bird: 'AVE',
  rabbit: 'COELHO',
  fish: 'PEIXE',
  other: 'OUTRO',
}

const escapeHtml = (value = '') => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

function findTodayAgendaTable() {
  const heading = [...document.querySelectorAll('h2')]
    .find((node) => normalizeText(node.textContent) === 'agenda de hoje')
  const card = heading?.closest('.rounded-xl2') || heading?.parentElement?.parentElement
  return card?.querySelector('table') || null
}

function tableColumnIndex(table, label) {
  const expected = normalizeText(label)
  return [...(table?.querySelectorAll('thead th') || [])]
    .findIndex((cell) => normalizeText(cell.textContent) === expected)
}

function friendlySpeciesLabel(value) {
  const normalized = normalizeText(value)
  return SPECIES_LABELS[normalized] || value
}

function enhanceDashboardRows(serviceMap) {
  if (!window.location.pathname.endsWith('/dashboard')) return
  const table = findTodayAgendaTable()
  if (!table) return

  const serviceIndex = tableColumnIndex(table, 'Serviço')
  const petIndex = tableColumnIndex(table, 'Pet')
  if (serviceIndex < 0) return

  table.querySelectorAll('tbody tr').forEach((row) => {
    const cells = [...row.children]
    const serviceCell = cells[serviceIndex]
    if (serviceCell) {
      const currentText = serviceCell.textContent?.trim() || ''
      const originalCode = serviceCell.dataset.yuisyncServiceCode || currentText
      if (!serviceCell.dataset.yuisyncServiceCode && /^catalog_/i.test(currentText)) {
        serviceCell.dataset.yuisyncServiceCode = currentText
      }

      if (/^catalog_/i.test(originalCode)) {
        const label = serviceMap.get(originalCode) || 'Serviço agendado'
        if (serviceCell.textContent !== label) serviceCell.textContent = label
        serviceCell.title = label
      }
    }

    if (petIndex >= 0) {
      const petCell = cells[petIndex]
      const detail = petCell?.querySelector('p:nth-of-type(2)')
      if (detail) {
        const friendly = friendlySpeciesLabel(detail.textContent)
        if (friendly && friendly !== detail.textContent) detail.textContent = friendly
      }
    }
  })
}

function findCommissionSummaryTable() {
  return [...document.querySelectorAll('table')].find((table) => {
    const headers = [...table.querySelectorAll('thead th')].map((cell) => normalizeText(cell.textContent))
    return headers.includes('esteticista')
      && headers.includes('banhos')
      && headers.includes('pacote')
      && headers.includes('conferencia')
  }) || null
}

function parseCurrency(value = '') {
  const normalized = String(value || '')
    .replace(/[^0-9,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')
  const number = Number(normalized)
  return Number.isFinite(number) ? number : 0
}

function formatCurrency(value = 0) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatDateInput(value = '') {
  if (!value) return '-'
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR')
}

function commissionPeriod() {
  const dateInputs = [...document.querySelectorAll('input[type="date"]')]
  return {
    start: formatDateInput(dateInputs[0]?.value),
    end: formatDateInput(dateInputs[1]?.value),
  }
}

function commissionSummaryRows() {
  const table = findCommissionSummaryTable()
  if (!table) return []

  return [...table.querySelectorAll('tbody tr')]
    .map((row) => [...row.children].map((cell) => String(cell.textContent || '').trim()))
    .filter((cells) => cells.length >= 8 && normalizeText(cells[0]) !== 'sem producao concluida no periodo.')
    .map((cells) => ({
      name: cells[0] || 'Esteticista',
      baths: cells[1] || '0',
      machine: cells[2] || '0',
      scissors: cells[3] || '0',
      packages: cells[4] || '0',
      others: cells[5] || '0',
      revenueLabel: cells[6] || formatCurrency(0),
      commissionLabel: cells[7] || formatCurrency(0),
      revenue: parseCurrency(cells[6]),
      commission: parseCurrency(cells[7]),
    }))
}

function safeCommissionSummaryPrint() {
  const rows = commissionSummaryRows()
  const period = commissionPeriod()
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0)
  const totalCommission = rows.reduce((sum, row) => sum + row.commission, 0)
  const printWindow = window.open('', '_blank')
  if (!printWindow) return

  const entries = rows.length > 0
    ? rows.map((row) => `
      <section class="entry">
        <div class="name">${escapeHtml(row.name)}</div>
        <div class="row"><span>Banhos</span><strong>${escapeHtml(row.baths)}</strong></div>
        <div class="row"><span>Tosa maquina/total</span><strong>${escapeHtml(row.machine)}</strong></div>
        <div class="row"><span>Tosa tesoura</span><strong>${escapeHtml(row.scissors)}</strong></div>
        <div class="row"><span>Pacote</span><strong>${escapeHtml(row.packages)}</strong></div>
        <div class="row"><span>Outros</span><strong>${escapeHtml(row.others)}</strong></div>
        <div class="row"><span>Receita</span><strong>${escapeHtml(row.revenueLabel)}</strong></div>
        <div class="row total-row"><span>Comissao</span><strong>${escapeHtml(row.commissionLabel)}</strong></div>
      </section>
    `).join('')
    : '<p class="empty">Sem producao concluida no periodo.</p>'

  printWindow.document.write(`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8"/>
        <title>Resumo geral de comissoes</title>
        <style>
          @page { margin: 0; }
          * { box-sizing: border-box; }
          html, body { width: 80mm; max-width: 80mm; margin: 0; padding: 0; color: #000; background: #fff; }
          body { font-family: Arial, Helvetica, sans-serif; padding: 3mm 0 3mm 2mm; }
          .receipt { width: 64mm; max-width: 64mm; }
          h1 { margin: 0; text-align: center; font-size: 13px; line-height: 1.15; text-transform: uppercase; }
          .meta { margin: 2mm 0 2.5mm; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 1.5mm 0; text-align: center; font-size: 9px; line-height: 1.3; }
          .entry { border-bottom: 1px dashed #000; padding: 1.7mm 0; break-inside: avoid; page-break-inside: avoid; }
          .name { margin-bottom: 1mm; font-size: 11px; font-weight: 900; text-transform: uppercase; overflow-wrap: anywhere; }
          .row { display: flex; align-items: flex-start; justify-content: space-between; gap: 3mm; padding: .45mm 0; font-size: 9.5px; line-height: 1.25; }
          .row span { min-width: 28mm; text-transform: uppercase; font-size: 8.5px; font-weight: 800; }
          .row strong { min-width: 0; text-align: right; overflow-wrap: anywhere; }
          .total-row { margin-top: .8mm; border-top: 1px dotted #000; padding-top: 1mm; font-size: 10.5px; }
          .grand-total { margin-top: 2.5mm; border: 2px solid #000; padding: 1.5mm; break-inside: avoid; page-break-inside: avoid; }
          .grand-total .row { font-size: 10px; font-weight: 900; }
          .empty { margin: 4mm 0; text-align: center; font-size: 10px; }
          .footer { margin-top: 2.5mm; text-align: center; font-size: 8px; }
          @media print { html, body { overflow: visible; } }
        </style>
      </head>
      <body>
        <main class="receipt">
          <h1>Resumo geral de comissoes</h1>
          <div class="meta">Periodo: ${escapeHtml(period.start)} a ${escapeHtml(period.end)}</div>
          ${entries}
          <section class="grand-total">
            <div class="row"><span>Receita total</span><strong>${escapeHtml(formatCurrency(totalRevenue))}</strong></div>
            <div class="row"><span>Total a pagar</span><strong>${escapeHtml(formatCurrency(totalCommission))}</strong></div>
          </section>
          <div class="footer">Impresso em ${escapeHtml(new Date().toLocaleString('pt-BR'))}</div>
        </main>
      </body>
    </html>`)
  printWindow.document.close()
  printThermalReceipt(printWindow)
}

async function loadServiceMap(moduleId, tenantId) {
  const response = await runWithTenantFallback(tenantId, async (includeTenant) => {
    let query = supabase
      .from('petshop_services')
      .select('id,code,name')
      .eq('module_id', moduleId)
      .eq('active', true)
    query = applyTenantFilter(query, tenantId, includeTenant)
    return query
  })
  if (response.error) throw response.error

  const map = new Map()
  ;(response.data || []).forEach((service) => {
    const name = String(service?.name || '').trim()
    if (!name) return
    if (service.code) map.set(String(service.code), name)
    if (service.id) map.set(String(service.id), name)
  })
  return map
}

export function DashboardAgendaLabelsEnhancer() {
  const { activeTenantId } = useAuthCtx()
  const { activeModuleId } = useModuleCtx()

  useEffect(() => {
    if (!activeTenantId || activeModuleId !== 'petshop') return undefined

    let cancelled = false
    let frame = 0
    let serviceMap = new Map()

    const apply = () => {
      frame = 0
      enhanceDashboardRows(serviceMap)
    }
    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(apply)
    }

    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    const interceptCommissionPrint = (event) => {
      const button = event.target?.closest?.('button')
      if (!button || normalizeText(button.textContent) !== 'imprimir resumo geral') return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      safeCommissionSummaryPrint()
    }
    document.addEventListener('click', interceptCommissionPrint, true)

    loadServiceMap(activeModuleId, activeTenantId)
      .then((loaded) => {
        if (cancelled) return
        serviceMap = loaded
        schedule()
      })
      .catch((error) => {
        console.warn('Falha ao resolver nomes da agenda na Dashboard:', error?.message || error)
        schedule()
      })

    schedule()
    return () => {
      cancelled = true
      observer.disconnect()
      document.removeEventListener('click', interceptCommissionPrint, true)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [activeModuleId, activeTenantId])

  return null
}

export default DashboardAgendaLabelsEnhancer
