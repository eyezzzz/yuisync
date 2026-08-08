import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthCtx } from '../../context/AuthContext'
import { useModuleCtx } from '../../context/ModuleContext'
import { nextApi, nextDomainEnabled } from '../../lib/nextApi'
import { useAppointments as useLegacyAppointments } from './useLegacyAppointments'

const nextEnabled = nextDomainEnabled('appointments')
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key)

const normalizeMode = (value) => {
  const mode = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  if (['roundtrip', 'buscar_e_levar', 'buscar e levar', 'buscar_e_trazer', 'buscar e trazer', 'both'].includes(mode)) return 'roundtrip'
  if (['pickup', 'buscar', 'so_buscar', 'so buscar', 'apenas_buscar'].includes(mode)) return 'pickup'
  if (['dropoff', 'levar', 'so_levar', 'so levar', 'apenas_levar'].includes(mode)) return 'dropoff'
  return 'none'
}

const dayBoundary = (date, end = false) => {
  if (!date) return undefined
  const value = new Date(`${date}T${end ? '23:59:59.999' : '00:00:00.000'}`)
  return Number.isNaN(value.getTime()) ? undefined : value.toISOString()
}

const todayISO = () => {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const fromNext = (row) => {
  if (!row) return row
  const transport = row.transport || null
  const services = Array.isArray(row.services) ? row.services : []
  return {
    id: row.id,
    pet_id: row.pet?.id || null,
    client_id: row.client?.id || null,
    service_type: services[0]?.code || services[0]?.name || 'outro',
    service_group: null,
    service_items: services.map((service) => ({
      id: service.id,
      service_id: service.serviceId,
      code: service.code,
      name: service.name,
      service_type: service.code || service.name,
      price: Number(service.price || 0),
      duration_min: Number(service.durationMinutes || 0),
      quantity: Number(service.quantity || 1),
    })),
    scheduled_at: row.scheduledAt,
    duration_min: Number(row.durationMinutes || 0),
    price: services.reduce((sum, service) => sum + Number(service.price || 0) * Number(service.quantity || 1), 0),
    status: row.status,
    live_status: row.liveStatus || null,
    source: row.source,
    notes: row.notes,
    responsible_staff_key: row.responsibleStaff?.key || null,
    responsible_staff_name: row.responsibleStaff?.name || null,
    delivery_staff_key: transport?.staffKey || null,
    delivery_staff_name: transport?.staffName || null,
    transport_mode: transport?.mode || null,
    transport_label: transport?.mode || null,
    transport_address: transport?.address || null,
    transport_neighborhood: transport?.neighborhood || null,
    transport_city: transport?.city || null,
    transport_reference: transport?.reference || null,
    subscription_id: row.subscriptionId || null,
    subscription_benefit_used: row.subscriptionBenefitUsed === true,
    motodog: transport ? {
      mode: transport.mode,
      label: transport.mode,
      address: transport.address,
      neighborhood: transport.neighborhood,
      city: transport.city,
      reference: transport.reference,
      staff_key: transport.staffKey,
      staff_name: transport.staffName,
      outside_muriae: transport.outsideMuriae,
      pet_weight_kg: transport.petWeightKg,
      fee: transport.fee,
    } : null,
    pets: {
      id: row.pet?.id || null,
      owner_name: row.client?.name || '',
      phone: row.client?.phone || '',
      pet_name: row.pet?.name || '',
      species: row.pet?.species || 'other',
      breed: row.pet?.breed || '',
    },
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}

const servicePayload = (payload = {}) => {
  const raw = Array.isArray(payload.services) ? payload.services : Array.isArray(payload.service_items) ? payload.service_items : []
  if (!raw.length && payload.service_type) {
    return [{ code: payload.service_type, name: payload.service_type, price: Number(payload.price || 0), durationMinutes: Number(payload.duration_min || payload.durationMinutes || 60), quantity: 1 }]
  }
  return raw.map((service) => ({
    serviceId: service.serviceId || service.service_id || null,
    code: service.code || service.service_type || service.type || null,
    name: service.name || service.label || service.service_name || service.service_type || 'Servico',
    price: Number(service.price ?? service.unit_price ?? 0),
    durationMinutes: Number(service.durationMinutes ?? service.duration_min ?? 60),
    quantity: Number(service.quantity ?? 1),
  }))
}

const toNext = (payload = {}, create = false) => {
  const result = {}
  const include = (...keys) => create || keys.some((key) => own(payload, key))
  if (include('clientId', 'client_id')) result.clientId = payload.clientId || payload.client_id || null
  if (include('petId', 'pet_id')) result.petId = payload.petId || payload.pet_id || null
  if (include('scheduledAt', 'scheduled_at')) result.scheduledAt = payload.scheduledAt || payload.scheduled_at
  if (include('durationMinutes', 'duration_min')) result.durationMinutes = Number(payload.durationMinutes ?? payload.duration_min ?? 60)
  if (include('status')) result.status = payload.status
  if (include('liveStatus', 'live_status')) result.liveStatus = payload.liveStatus ?? payload.live_status
  if (include('source')) result.source = payload.source || 'manual'
  if (include('notes')) result.notes = payload.notes
  if (include('employeeId', 'employee_id')) result.employeeId = payload.employeeId ?? payload.employee_id
  if (include('groomerId', 'groomer_id')) result.groomerId = payload.groomerId ?? payload.groomer_id
  if (include('responsibleStaffKey', 'responsible_staff_key')) result.responsibleStaffKey = payload.responsibleStaffKey ?? payload.responsible_staff_key
  if (include('responsibleStaffName', 'responsible_staff_name')) result.responsibleStaffName = payload.responsibleStaffName ?? payload.responsible_staff_name
  if (include('subscriptionId', 'subscription_id')) result.subscriptionId = payload.subscriptionId ?? payload.subscription_id
  if (include('subscriptionBenefitUsed', 'subscription_benefit_used')) result.subscriptionBenefitUsed = payload.subscriptionBenefitUsed ?? payload.subscription_benefit_used
  if (include('services', 'service_items', 'service_type')) result.services = servicePayload(payload)

  const hasTransport = create || ['transport', 'motodog', 'transport_mode', 'transport_address', 'transport_neighborhood', 'transport_city', 'transport_reference', 'delivery_staff_key', 'delivery_staff_name'].some((key) => own(payload, key))
  if (hasTransport) {
    const transportSource = payload.transport || payload.motodog || {}
    result.transport = {
      mode: normalizeMode(transportSource.mode || payload.transport_mode),
      outsideMuriae: transportSource.outsideMuriae ?? transportSource.outside_muriae ?? false,
      petWeightKg: transportSource.petWeightKg ?? transportSource.pet_weight_kg ?? null,
      fee: Number(transportSource.fee || 0),
      address: transportSource.address ?? payload.transport_address ?? null,
      neighborhood: transportSource.neighborhood ?? payload.transport_neighborhood ?? null,
      city: transportSource.city ?? payload.transport_city ?? null,
      reference: transportSource.reference ?? payload.transport_reference ?? null,
      staffKey: transportSource.staffKey ?? transportSource.staff_key ?? payload.delivery_staff_key ?? null,
      staffName: transportSource.staffName ?? transportSource.staff_name ?? payload.delivery_staff_name ?? null,
    }
  }
  return result
}

export function useAppointments() {
  const legacy = useLegacyAppointments()
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const pollRef = useRef(null)
  const { activeTenantId } = useAuthCtx()
  const { activeModuleId } = useModuleCtx()

  const load = useCallback(async (filters = {}) => {
    if (!nextEnabled) return legacy.load(filters)
    if (!activeTenantId || !activeModuleId) return
    setLoading(true)
    setError(null)
    try {
      const startDate = filters.startDate || filters.date
      const endDate = filters.endDate || filters.date
      const query = { limit: String(filters.limit || 200) }
      const from = dayBoundary(startDate)
      const to = dayBoundary(endDate, true)
      if (from) query.from = from
      if (to) query.to = to
      if (filters.status) query.status = filters.status
      if (filters.client_id) query.clientId = filters.client_id
      if (filters.pet_id) query.petId = filters.pet_id
      if (filters.employee_id || filters.responsible_staff_key) query.staffKey = filters.employee_id || filters.responsible_staff_key
      let rows = (await nextApi.appointments.list(activeTenantId, activeModuleId, query) || []).map(fromNext)
      if (filters.service_type) rows = rows.filter((row) => row.service_items.some((item) => item.code === filters.service_type || item.service_type === filters.service_type))
      setAppointments(rows)
      return rows
    } catch (cause) {
      setError(cause.message)
      throw cause
    } finally {
      setLoading(false)
    }
  }, [legacy.load, activeTenantId, activeModuleId])

  const fetchAppointmentById = useCallback(async (id) => {
    if (!nextEnabled) return null
    return fromNext(await nextApi.appointments.get(activeTenantId, activeModuleId, id))
  }, [activeTenantId, activeModuleId])

  const create = useCallback(async (payload) => {
    if (!nextEnabled) return legacy.create(payload)
    if (!activeTenantId || !activeModuleId) throw new Error('Selecione uma empresa ativa antes de salvar o agendamento.')
    const row = fromNext(await nextApi.appointments.create(activeTenantId, activeModuleId, toNext(payload, true), payload.idempotency_key || crypto.randomUUID()))
    setAppointments((current) => [...current.filter((item) => item.id !== row.id), row].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)))
    return row
  }, [legacy.create, activeTenantId, activeModuleId])

  const update = useCallback(async (id, payload) => {
    if (!nextEnabled) return legacy.update(id, payload)
    const row = fromNext(await nextApi.appointments.update(activeTenantId, activeModuleId, id, toNext(payload, false)))
    setAppointments((current) => current.map((item) => item.id === id ? row : item))
    return row
  }, [legacy.update, activeTenantId, activeModuleId])

  const updateStatus = useCallback((id, status, extra = {}) => nextEnabled ? update(id, { status, ...extra }) : legacy.updateStatus(id, status, extra), [legacy.updateStatus, update])

  const remove = useCallback(async (id) => {
    if (!nextEnabled) return legacy.remove(id)
    await nextApi.appointments.remove(activeTenantId, activeModuleId, id)
    setAppointments((current) => current.filter((item) => item.id !== id))
  }, [legacy.remove, activeTenantId, activeModuleId])

  const subscribeRealtime = useCallback((date = todayISO()) => {
    if (!nextEnabled) return legacy.subscribeRealtime(date)
    if (typeof window === 'undefined') return undefined
    if (pollRef.current) window.clearInterval(pollRef.current)
    load({ date }).catch(() => {})
    pollRef.current = window.setInterval(() => load({ date }).catch(() => {}), 30000)
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [legacy.subscribeRealtime, load])

  useEffect(() => () => {
    if (pollRef.current && typeof window !== 'undefined') window.clearInterval(pollRef.current)
  }, [])

  const todayStats = () => {
    if (!nextEnabled) return legacy.todayStats()
    const today = todayISO()
    const rows = appointments.filter((item) => item.scheduled_at?.startsWith(today))
    return {
      total: rows.length,
      agendado: rows.filter((item) => item.status === 'agendado').length,
      confirmado: rows.filter((item) => item.status === 'confirmado').length,
      em_andamento: rows.filter((item) => item.status === 'em_andamento').length,
      concluido: rows.filter((item) => item.status === 'concluido').length,
      cancelado: rows.filter((item) => item.status === 'cancelado').length,
    }
  }

  return nextEnabled ? {
    appointments,
    loading,
    error,
    load,
    create,
    update,
    updateStatus,
    remove,
    subscribeRealtime,
    todayStats,
    serviceLabel: legacy.serviceLabel,
    statusBadge: legacy.statusBadge,
    fetchAppointmentById,
  } : legacy
}
