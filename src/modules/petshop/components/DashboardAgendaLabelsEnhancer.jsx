import { useEffect } from 'react'
import { useAuthCtx } from '../../../context/AuthContext'
import { useModuleCtx } from '../../../context/ModuleContext'
import { supabase } from '../../../lib/supabase'
import { applyTenantFilter, runWithTenantFallback } from '../../../lib/tenant'

const normalizeText = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim()

const SPECIES_LABELS = {
  dog: 'CÃO',
  cat: 'GATO',
  bird: 'AVE',
  rabbit: 'COELHO',
  fish: 'PEIXE',
  other: 'OUTRO',
}

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

function serviceOptionLabel(option) {
  const highlighted = [...(option?.querySelectorAll?.('span') || [])]
    .find((span) => String(span.className || '').includes('font-bold'))
  return normalizeText(highlighted?.textContent || option?.textContent)
}

function isPrimaryBathSearch(value) {
  const query = normalizeText(value)
  return Boolean(query) && ('banho'.startsWith(query) || query.startsWith('banho'))
}

function isPrimaryBathOption(option) {
  const label = serviceOptionLabel(option)
  if (!label || label.includes('tosa')) return false
  const primaryName = label.includes('banho pet porte pequeno')
  const primaryWeight = label.includes('0 kg a 10 kg')
    || label.includes('0 a 10 kg')
    || label.includes('ate 10 kg')
  return label.includes('banho') && primaryName && primaryWeight
}

function enhanceAgendaServiceSearch() {
  const input = document.querySelector('input[aria-label="Buscar servico para adicionar"]')
  if (!input || !isPrimaryBathSearch(input.value)) return

  const modal = input.closest('.modal-box')
  const listbox = modal?.querySelector('[role="listbox"][aria-label="Servicos encontrados"]')
  if (!listbox) return

  const options = [...listbox.querySelectorAll('button[role="option"]')]
  const primaryBath = options.find(isPrimaryBathOption)
  if (!primaryBath) return

  primaryBath.dataset.yuisyncPrimaryBathPriority = 'true'
  if (listbox.firstElementChild !== primaryBath) {
    listbox.insertBefore(primaryBath, listbox.firstElementChild)
  }
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
      enhanceAgendaServiceSearch()
    }
    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(apply)
    }

    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    const onInput = (event) => {
      if (event.target?.matches?.('input[aria-label="Buscar servico para adicionar"]')) schedule()
    }
    document.addEventListener('input', onInput, true)

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
      document.removeEventListener('input', onInput, true)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [activeModuleId, activeTenantId])

  return null
}

export default DashboardAgendaLabelsEnhancer
