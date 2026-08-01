import { useEffect } from 'react'

import { useAuthCtx } from '../../../context/AuthContext'
import { useModuleCtx } from '../../../context/ModuleContext'
import { supabase } from '../../../lib/supabase'
import { applyTenantFilter, runWithTenantFallback } from '../../../lib/tenant'

const normalize = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim()

const CANCELLED_STATUSES = new Set(['cancelado', 'cancelled', 'no_show'])

function serviceText(appointment, serviceMap) {
  const values = [appointment?.service_type]
  const items = Array.isArray(appointment?.service_items) ? appointment.service_items : []
  items.forEach((item) => {
    values.push(item?.name, item?.label, item?.code, item?.service_code, item?.service_type)
  })

  return normalize(values
    .filter(Boolean)
    .flatMap((value) => [value, serviceMap.get(String(value))])
    .filter(Boolean)
    .join(' '))
}

function countTodayServices(appointments, serviceMap) {
  return (appointments || []).reduce((totals, appointment) => {
    if (CANCELLED_STATUSES.has(normalize(appointment?.status))) return totals
    const text = serviceText(appointment, serviceMap)
    if (/\bbanho\b|\bbath\b/.test(text)) totals.baths += 1
    if (/\btosa\b|tesoura|maquina|groom|trim/.test(text)) totals.grooming += 1
    return totals
  }, { baths: 0, grooming: 0 })
}

function cardByLabel(label) {
  const expected = normalize(label)
  return [...document.querySelectorAll('button.kpi-card')].find((card) => {
    const labelNode = card.querySelector('p.text-xs, p[class*="uppercase"]')
    return normalize(labelNode?.textContent) === expected
  }) || null
}

function updateCard(card, { label, value, sub }) {
  if (!card) return
  const paragraphs = [...card.querySelectorAll('p')]
  const labelNode = paragraphs.find((node) => normalize(node.textContent) === 'confirmados'
    || normalize(node.textContent) === 'em andamento'
    || node.className.includes('uppercase'))
  const valueNode = paragraphs.find((node) => node.className.includes('text-3xl'))
  const subNode = paragraphs.find((node) => node !== labelNode && node !== valueNode && node.className.includes('text-xs'))

  if (labelNode) labelNode.textContent = label
  if (valueNode) valueNode.textContent = String(value)
  if (subNode) subNode.textContent = sub
  card.setAttribute('aria-label', `${label}: ${value}`)
  card.dataset.yuisyncServiceKpi = normalize(label)
}

function applyServiceKpis(counts) {
  if (!window.location.pathname.endsWith('/dashboard')) return

  updateCard(cardByLabel('Confirmados'), {
    label: 'Banhos',
    value: counts.baths,
    sub: `${counts.baths} agendamento${counts.baths === 1 ? '' : 's'} de banho hoje`,
  })
  updateCard(cardByLabel('Em andamento'), {
    label: 'Tosas',
    value: counts.grooming,
    sub: `${counts.grooming} agendamento${counts.grooming === 1 ? '' : 's'} de tosa hoje`,
  })
}

async function loadTodayCounts(moduleId, tenantId) {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)

  const [appointmentsResponse, servicesResponse] = await Promise.all([
    runWithTenantFallback(tenantId, async (includeTenant) => {
      let query = supabase
        .from('appointments')
        .select('id,status,service_type,service_items,scheduled_at')
        .eq('module_id', moduleId)
        .gte('scheduled_at', start.toISOString())
        .lte('scheduled_at', end.toISOString())
      query = applyTenantFilter(query, tenantId, includeTenant)
      return query
    }),
    runWithTenantFallback(tenantId, async (includeTenant) => {
      let query = supabase
        .from('petshop_services')
        .select('id,code,name')
        .eq('module_id', moduleId)
      query = applyTenantFilter(query, tenantId, includeTenant)
      return query
    }),
  ])

  if (appointmentsResponse.error) throw appointmentsResponse.error
  if (servicesResponse.error) throw servicesResponse.error

  const serviceMap = new Map()
  ;(servicesResponse.data || []).forEach((service) => {
    if (service?.id) serviceMap.set(String(service.id), service.name || service.code || '')
    if (service?.code) serviceMap.set(String(service.code), service.name || service.code || '')
  })

  return countTodayServices(appointmentsResponse.data || [], serviceMap)
}

export function DashboardServiceKpiEnhancer() {
  const { activeTenantId } = useAuthCtx()
  const { activeModuleId } = useModuleCtx()

  useEffect(() => {
    if (!activeTenantId || activeModuleId !== 'petshop') return undefined

    let cancelled = false
    let counts = { baths: 0, grooming: 0 }
    let frame = 0

    const apply = () => {
      frame = 0
      applyServiceKpis(counts)
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(apply)
    }
    const refresh = async () => {
      try {
        const loaded = await loadTodayCounts(activeModuleId, activeTenantId)
        if (cancelled) return
        counts = loaded
        schedule()
      } catch (error) {
        console.warn('Falha ao calcular banhos e tosas da Dashboard:', error?.message || error)
      }
    }

    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    void refresh()
    const interval = window.setInterval(refresh, 60_000)

    return () => {
      cancelled = true
      observer.disconnect()
      window.clearInterval(interval)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [activeModuleId, activeTenantId])

  return null
}

export default DashboardServiceKpiEnhancer
