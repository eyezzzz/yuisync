import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarClock, History, PawPrint, Scissors, ShoppingBag, Truck, X } from 'lucide-react'

import { useAuthCtx } from '../../../context/AuthContext'
import { useModuleCtx } from '../../../context/ModuleContext'
import { supabase } from '../../../lib/supabase'
import { applyTenantFilter, runWithTenantFallback } from '../../../lib/tenant'

const GROOMING_MACHINE_OPTIONS = [4, 7, 10]
const FINAL_STATUSES = new Set(['concluido', 'completed', 'finalizado', 'finalizada'])

const normalize = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim()

const phoneDigits = (value = '') => String(value || '').replace(/\D/g, '')

const fmtMoney = (value = 0) => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const fmtDateTime = (value) => {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function clientGroupKey(client = {}) {
  const explicit = String(client?.details?.tutor_group_id || '').trim()
  if (explicit) return `group:${explicit}`
  const phone = phoneDigits(client.phone)
  if (phone) return `phone:${phone}`
  return `name:${normalize(client.name)}`
}

function mapClient(client = {}) {
  return {
    ...client,
    pet_name: String(client?.details?.pet_name || '').trim() || 'Pet',
    group_key: clientGroupKey(client),
  }
}

function groupClients(clients = []) {
  const groups = new Map()
  clients.forEach((client) => {
    const key = client.group_key
    const current = groups.get(key) || {
      key,
      owner_name: client.name || 'Cliente',
      phone: client.phone || '',
      clients: [],
    }
    current.clients.push(client)
    groups.set(key, current)
  })
  return groups
}

function matchingGroup(groups, ownerName, petNames = []) {
  const owner = normalize(ownerName)
  const pets = petNames.map(normalize).filter(Boolean)
  return [...groups.values()].find((group) => {
    if (normalize(group.owner_name) !== owner) return false
    if (!pets.length) return true
    return group.clients.some((client) => pets.includes(normalize(client.pet_name)))
  }) || null
}

function createHistoryButton(groupKey) {
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.yuisyncClientHistory = groupKey
  button.className = 'btn btn-secondary btn-sm'
  button.innerHTML = '<span aria-hidden="true">↺</span> Histórico'
  return button
}

function injectHistoryButtons(groups) {
  if (!window.location.pathname.endsWith('/pets')) return

  document.querySelectorAll('.page button').forEach((openButton) => {
    if (normalize(openButton.textContent) !== 'abrir') return
    const card = openButton.closest('.rounded-2xl.border.bg-card')
    if (!card || card.querySelector('[data-yuisync-client-history]')) return
    const owner = card.querySelector('h3')?.textContent || ''
    const petNames = [...card.querySelectorAll('button strong')].map((node) => node.textContent || '')
    const group = matchingGroup(groups, owner, petNames)
    const actions = card.querySelector('[data-yuisync-add-pet-action]')?.parentElement
    if (group && actions) actions.insertBefore(createHistoryButton(group.key), actions.firstChild)
  })

  document.querySelectorAll('.page table tbody tr').forEach((row) => {
    if (row.querySelector('[data-yuisync-client-history]')) return
    const cells = [...row.children]
    const owner = cells[0]?.textContent || ''
    const petNames = [...(cells[1]?.querySelectorAll('button') || [])].map((node) => node.textContent || '')
    const group = matchingGroup(groups, owner, petNames)
    const actions = cells.at(-1)?.querySelector('.flex')
    if (group && actions) actions.insertBefore(createHistoryButton(group.key), actions.firstChild)
  })

  document.querySelectorAll('.fixed.inset-0.z-50').forEach((drawer) => {
    if (drawer.querySelector('[data-yuisync-client-history]')) return
    const owner = drawer.querySelector('.modal-header h2')?.textContent || ''
    const petLine = drawer.querySelector('.modal-header h2 + p')?.textContent || ''
    const petName = petLine.split('-')[0]?.trim() || ''
    const group = matchingGroup(groups, owner, [petName])
    const headerActions = drawer.querySelector('.modal-header > .flex.items-center.gap-2:last-child')
    if (group && headerActions) headerActions.insertBefore(createHistoryButton(group.key), headerActions.firstChild)
  })
}

function serviceLabel(appointment, serviceMap) {
  const items = Array.isArray(appointment?.service_items) ? appointment.service_items : []
  const labels = items.map((item) => {
    const code = item?.code || item?.service_code || item?.service_type
    return item?.name || item?.label || item?.service_name || serviceMap.get(String(code || '')) || code
  }).filter(Boolean)
  if (labels.length) return labels.join(' + ')
  return serviceMap.get(String(appointment?.service_type || '')) || appointment?.service_type || 'Serviço'
}

function deliveryLabelFromAppointment(appointment = {}) {
  const mode = normalize(appointment.transport_mode)
  if (!mode || mode === 'cliente_leva') return ''
  const label = appointment.transport_label || 'MotoDog'
  const address = [appointment.transport_address, appointment.transport_neighborhood, appointment.transport_city]
    .filter(Boolean)
    .join(' - ')
  return address ? `${label}: ${address}` : label
}

function deliveryLabelFromSale(sale = {}) {
  const fulfillment = normalize(sale.fulfillment_type)
  if (!fulfillment || ['balcao', 'retirada', 'servico'].includes(fulfillment)) return ''
  return fulfillment.includes('entrega') ? 'Entrega' : sale.fulfillment_type
}

function saleItemsLabel(sale = {}) {
  const items = Array.isArray(sale.sale_items) ? sale.sale_items : []
  const labels = items.map((item) => {
    const product = Array.isArray(item.products) ? item.products[0] : item.products
    const name = product?.name || 'Produto'
    const quantity = Number(item.quantity || 1)
    return `${quantity}x ${name}`
  }).filter(Boolean)
  return labels.join(' + ') || sale.notes || 'Compra'
}

function statusLabel(value = '') {
  const key = normalize(value)
  return {
    agendado: 'Agendado',
    confirmado: 'Confirmado',
    em_andamento: 'Em andamento',
    concluido: 'Concluído',
    completed: 'Concluído',
    finalizado: 'Concluído',
    cancelado: 'Cancelado',
    no_show: 'No-show',
  }[key] || value || '-'
}

async function tenantQuery(tenantId, callback) {
  return runWithTenantFallback(tenantId, async (includeTenant) => callback(includeTenant))
}

async function loadHistory(moduleId, tenantId, group) {
  const clientIds = group.clients.map((client) => client.id)
  const petById = new Map(group.clients.map((client) => [String(client.id), client.pet_name]))

  const appointmentQuery = async (includeMachine = true) => tenantQuery(tenantId, async (includeTenant) => {
    const fields = [
      'id', 'client_id', 'service_type', 'service_items', 'scheduled_at', 'status', 'price', 'source',
      'transport_mode', 'transport_label', 'transport_address', 'transport_neighborhood', 'transport_city',
      includeMachine ? 'grooming_machine_no' : null,
    ].filter(Boolean).join(',')
    let query = supabase
      .from('appointments')
      .select(fields)
      .eq('module_id', moduleId)
      .in('client_id', clientIds)
      .order('scheduled_at', { ascending: false })
      .limit(100)
    query = applyTenantFilter(query, tenantId, includeTenant)
    return query
  })

  let appointmentsResponse = await appointmentQuery(true)
  if (appointmentsResponse.error && normalize(appointmentsResponse.error.message).includes('grooming_machine_no')) {
    appointmentsResponse = await appointmentQuery(false)
  }

  const [salesResponse, servicesResponse] = await Promise.all([
    tenantQuery(tenantId, async (includeTenant) => {
      let query = supabase
        .from('sales')
        .select('id,client_id,appointment_id,total_price,status,source,fulfillment_type,delivery_fee,notes,created_at,sale_items(quantity,unit_price,subtotal,products(name,category))')
        .eq('module_id', moduleId)
        .in('client_id', clientIds)
        .order('created_at', { ascending: false })
        .limit(100)
      query = applyTenantFilter(query, tenantId, includeTenant)
      return query
    }),
    tenantQuery(tenantId, async (includeTenant) => {
      let query = supabase
        .from('petshop_services')
        .select('id,code,name')
        .eq('module_id', moduleId)
      query = applyTenantFilter(query, tenantId, includeTenant)
      return query
    }),
  ])

  if (appointmentsResponse.error) throw appointmentsResponse.error
  if (salesResponse.error) throw salesResponse.error
  if (servicesResponse.error) throw servicesResponse.error

  const serviceMap = new Map()
  ;(servicesResponse.data || []).forEach((service) => {
    if (service.id) serviceMap.set(String(service.id), service.name || service.code)
    if (service.code) serviceMap.set(String(service.code), service.name || service.code)
  })

  const sales = salesResponse.data || []
  const saleByAppointment = new Map(sales
    .filter((sale) => sale.appointment_id)
    .map((sale) => [String(sale.appointment_id), sale]))

  const appointmentRows = (appointmentsResponse.data || []).map((appointment) => {
    const linkedSale = saleByAppointment.get(String(appointment.id))
    const machine = Number(appointment.grooming_machine_no || 0)
    const baseLabel = serviceLabel(appointment, serviceMap)
    return {
      id: `appointment:${appointment.id}`,
      kind: 'service',
      date: appointment.scheduled_at,
      pet: petById.get(String(appointment.client_id)) || 'Pet',
      title: machine ? `${baseLabel} - Nº ${machine}` : baseLabel,
      status: statusLabel(appointment.status),
      final: FINAL_STATUSES.has(normalize(appointment.status)),
      value: Number(linkedSale?.total_price ?? appointment.price ?? 0),
      delivery: deliveryLabelFromAppointment(appointment),
      machine: machine || null,
    }
  })

  const purchaseRows = sales
    .filter((sale) => !sale.appointment_id)
    .map((sale) => ({
      id: `sale:${sale.id}`,
      kind: 'purchase',
      date: sale.created_at,
      pet: petById.get(String(sale.client_id)) || 'Cliente',
      title: saleItemsLabel(sale),
      status: statusLabel(sale.status),
      final: FINAL_STATUSES.has(normalize(sale.status)),
      value: Number(sale.total_price || 0),
      delivery: deliveryLabelFromSale(sale),
      machine: null,
    }))

  return [...appointmentRows, ...purchaseRows]
    .sort((left, right) => new Date(right.date || 0) - new Date(left.date || 0))
}

function HistoryModal({ group, rows, loading, error, onClose }) {
  const lastFinal = rows.find((row) => row.final)
  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-box max-w-3xl">
        <div className="modal-header">
          <div>
            <h2 className="font-display text-xl font-bold text-text">Histórico do cliente</h2>
            <p className="mt-1 text-sm text-muted">{group.owner_name} · {group.clients.map((client) => client.pet_name).join(', ')}</p>
          </div>
          <button type="button" aria-label="Fechar histórico" onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button>
        </div>
        <div className="modal-body space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--border)] bg-card p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-muted">Registros</p><strong className="mt-2 block text-2xl text-text">{rows.length}</strong></div>
            <div className="rounded-xl border border-[var(--border)] bg-card p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-muted">Último valor finalizado</p><strong className="mt-2 block text-2xl text-emerald-400">{lastFinal ? fmtMoney(lastFinal.value) : '-'}</strong></div>
            <div className="rounded-xl border border-[var(--border)] bg-card p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-muted">Pets vinculados</p><strong className="mt-2 block text-2xl text-text">{group.clients.length}</strong></div>
          </div>

          {loading ? <p className="py-10 text-center text-sm text-muted">Carregando histórico...</p> : error ? (
            <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
          ) : rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-muted">Nenhuma compra ou atendimento encontrado.</p>
          ) : (
            <div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">
              {rows.map((row) => {
                const Icon = row.kind === 'purchase' ? ShoppingBag : Scissors
                return (
                  <article key={row.id} className="rounded-xl border border-[var(--border)] bg-card px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-lg bg-emerald-500/10 p-2 text-emerald-400"><Icon size={15}/></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-text">{row.title}</p>
                            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted"><CalendarClock size={12}/> {fmtDateTime(row.date)} · {row.pet}</p>
                          </div>
                          <div className="text-right"><span className="badge badge-gray">{row.status}</span><p className="mt-1 font-bold text-emerald-400">{fmtMoney(row.value)}</p></div>
                        </div>
                        {row.delivery && <p className="mt-2 flex items-start gap-1 text-xs text-sky-300"><Truck size={12} className="mt-0.5 shrink-0"/> {row.delivery}</p>}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function MachineModal({ prompt, selected, saving, error, onSelect, onConfirm, onClose }) {
  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={(event) => !saving && event.target === event.currentTarget && onClose()}>
      <div className="modal-box max-w-md">
        <div className="modal-header">
          <div><h2 className="font-display text-xl font-bold text-text">Concluir tosa</h2><p className="mt-1 text-sm text-muted">Nº da máquina utilizada — preenchimento opcional.</p></div>
          <button type="button" aria-label="Fechar máquina" disabled={saving} onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button>
        </div>
        <div className="modal-body space-y-4">
          <div className="grid grid-cols-4 gap-2">
            {GROOMING_MACHINE_OPTIONS.map((machine) => (
              <button key={machine} type="button" onClick={() => onSelect(machine)} className={`rounded-xl border px-3 py-4 text-center text-lg font-black ${selected === machine ? 'border-emerald-400 bg-emerald-500/15 text-emerald-300' : 'border-[var(--border)] text-text hover:border-emerald-500/35'}`}>{machine}</button>
            ))}
            <button type="button" onClick={() => onSelect(null)} className={`rounded-xl border px-2 py-4 text-center text-xs font-bold ${selected === null ? 'border-emerald-400 bg-emerald-500/15 text-emerald-300' : 'border-[var(--border)] text-muted hover:border-emerald-500/35'}`}>Sem Nº</button>
          </div>
          <p className="text-xs text-muted">O histórico ficará como “Tosa ... - Nº 7”. Sem seleção, o atendimento será concluído normalmente.</p>
          {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
          <div className="flex gap-2"><button type="button" disabled={saving} className="btn btn-secondary flex-1 justify-center" onClick={onClose}>Cancelar</button><button type="button" disabled={saving} className="btn btn-primary flex-1 justify-center" onClick={onConfirm}>{saving ? 'Salvando...' : 'Concluir atendimento'}</button></div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function ClientHistoryGroomingEnhancer() {
  const { activeTenantId } = useAuthCtx()
  const { activeModuleId } = useModuleCtx()
  const [clients, setClients] = useState([])
  const [historyGroup, setHistoryGroup] = useState(null)
  const [historyRows, setHistoryRows] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [machinePrompt, setMachinePrompt] = useState(null)
  const [machineNo, setMachineNo] = useState(null)
  const [machineSaving, setMachineSaving] = useState(false)
  const [machineError, setMachineError] = useState('')

  const groups = useMemo(() => groupClients(clients), [clients])

  const loadClients = useCallback(async () => {
    if (!activeTenantId || activeModuleId !== 'petshop') return
    const response = await tenantQuery(activeTenantId, async (includeTenant) => {
      let query = supabase
        .from('clients')
        .select('id,name,phone,details')
        .eq('module_id', activeModuleId)
        .eq('active', true)
      query = applyTenantFilter(query, activeTenantId, includeTenant)
      return query
    })
    if (response.error) throw response.error
    setClients((response.data || []).map(mapClient))
  }, [activeModuleId, activeTenantId])

  useEffect(() => {
    if (!activeTenantId || activeModuleId !== 'petshop') return undefined
    let cancelled = false
    loadClients().catch((error) => {
      if (!cancelled) console.warn('Falha ao carregar clientes para histórico:', error?.message || error)
    })
    return () => { cancelled = true }
  }, [activeModuleId, activeTenantId, loadClients])

  useEffect(() => {
    if (!groups.size) return undefined
    let frame = 0
    const apply = () => { frame = 0; injectHistoryButtons(groups) }
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(apply) }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    schedule()
    return () => { observer.disconnect(); if (frame) window.cancelAnimationFrame(frame) }
  }, [groups])

  const openHistory = useCallback(async (group) => {
    setHistoryGroup(group)
    setHistoryRows([])
    setHistoryError('')
    setHistoryLoading(true)
    try {
      setHistoryRows(await loadHistory(activeModuleId, activeTenantId, group))
    } catch (error) {
      setHistoryError(error?.message || 'Não foi possível carregar o histórico.')
    } finally {
      setHistoryLoading(false)
    }
  }, [activeModuleId, activeTenantId])

  useEffect(() => {
    const onHistoryClick = (event) => {
      const button = event.target.closest?.('[data-yuisync-client-history]')
      if (!button) return
      event.preventDefault()
      event.stopPropagation()
      const group = groups.get(button.dataset.yuisyncClientHistory)
      if (group) void openHistory(group)
    }

    const onCompleteCapture = (event) => {
      const action = event.target.closest?.('[data-yuisync-action="complete"]')
      if (!action) return
      if (action.dataset.yuisyncMachineBypass === 'true') {
        delete action.dataset.yuisyncMachineBypass
        return
      }
      const card = action.closest('[data-yuisync-appointment-id]')
      const text = normalize(card?.textContent)
      if (!card || (!text.includes('tosa') && card.dataset.yuisyncCardKind !== 'grooming')) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      setMachineNo(null)
      setMachineError('')
      setMachinePrompt({ appointmentId: card.dataset.yuisyncAppointmentId, action })
    }

    document.addEventListener('click', onHistoryClick, true)
    document.addEventListener('click', onCompleteCapture, true)
    return () => {
      document.removeEventListener('click', onHistoryClick, true)
      document.removeEventListener('click', onCompleteCapture, true)
    }
  }, [groups, openHistory])

  const confirmMachine = useCallback(async () => {
    if (!machinePrompt?.appointmentId) return
    setMachineSaving(true)
    setMachineError('')
    try {
      const response = await tenantQuery(activeTenantId, async (includeTenant) => {
        let query = supabase
          .from('appointments')
          .update({ grooming_machine_no: machineNo, updated_at: new Date().toISOString() })
          .eq('id', machinePrompt.appointmentId)
          .eq('module_id', activeModuleId)
        query = applyTenantFilter(query, activeTenantId, includeTenant)
        return query
      })
      if (response.error) throw response.error
      const action = machinePrompt.action
      setMachinePrompt(null)
      if (action?.isConnected) {
        action.dataset.yuisyncMachineBypass = 'true'
        action.click()
      }
    } catch (error) {
      setMachineError(error?.message || 'Não foi possível salvar o Nº da máquina.')
    } finally {
      setMachineSaving(false)
    }
  }, [activeModuleId, activeTenantId, machineNo, machinePrompt])

  return (
    <>
      {historyGroup && <HistoryModal group={historyGroup} rows={historyRows} loading={historyLoading} error={historyError} onClose={() => setHistoryGroup(null)} />}
      {machinePrompt && <MachineModal prompt={machinePrompt} selected={machineNo} saving={machineSaving} error={machineError} onSelect={setMachineNo} onConfirm={confirmMachine} onClose={() => !machineSaving && setMachinePrompt(null)} />}
    </>
  )
}

export default ClientHistoryGroomingEnhancer
