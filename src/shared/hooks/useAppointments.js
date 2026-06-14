import { useState, useCallback, useEffect, useRef } from 'react'
import { supabase, todayISO, getTimezoneOffset } from '../../lib/supabase'
import { useModuleCtx } from '../../context/ModuleContext'
import { useAuthCtx } from '../../context/AuthContext'
import { applyTenantFilter, buildTenantPayload, runWithTenantFallback } from '../../lib/tenant'

const APPOINTMENT_BASE_FIELDS = `
  id, pet_id, client_id, service_type, scheduled_at, duration_min, price, status, notes, source, created_at,
  employee_id, groomer_id, live_status, checkin_at, ready_at, subscription_id, subscription_benefit_used
`
const APPOINTMENT_SELECT = `${APPOINTMENT_BASE_FIELDS},
  clients ( id, name, document, phone, email, address, neighborhood, city, details )
`

function isClientRelationError(error) {
  const message = String(error?.message || '').toLowerCase()
  if (!message) return false
  return message.includes('appointments') && message.includes('clients') && (
    message.includes('schema cache')
    || message.includes('relationship')
    || message.includes('could not find')
  )
}

function mapAppointmentRow(appointment) {
  if (!appointment?.clients) return appointment
  return {
    ...appointment,
    pets: {
      id: appointment.clients.id,
      owner_name: appointment.clients.name,
      phone: appointment.clients.phone,
      email: appointment.clients.email,
      owner_address: appointment.clients.address,
      owner_neighborhood: appointment.clients.neighborhood,
      owner_city: appointment.clients.city,
      pet_name: appointment.clients.details?.pet_name || '',
      species: appointment.clients.details?.species || '',
      breed: appointment.clients.details?.breed || '',
    },
    clients: undefined,
  }
}

async function loadClientsMap(activeModuleId, activeTenantId, clientIds) {
  const ids = [...new Set((clientIds || []).filter(Boolean))]
  if (ids.length === 0) return new Map()

  const response = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
    let query = supabase
      .from('clients')
      .select('id, name, document, phone, email, address, neighborhood, city, details')
      .eq('module_id', activeModuleId)
      .in('id', ids)

    query = applyTenantFilter(query, activeTenantId, includeTenant)
    return query
  })

  if (response.error) throw response.error
  return new Map((response.data || []).map((client) => [client.id, client]))
}

const normalizeSpecies = (value) => {
  const species = String(value || '').toLowerCase()
  return ['dog', 'cat', 'bird', 'rabbit', 'fish', 'other'].includes(species) ? species : 'other'
}

function normalizeAppointmentPayload(payload = {}, moduleId) {
  const apiPayload = { ...payload }
  if (moduleId) apiPayload.module_id = moduleId

  const clientId = apiPayload.client_id || apiPayload.pet_id
  if (clientId) {
    apiPayload.client_id = clientId
    apiPayload.pet_id = apiPayload.pet_id || clientId
  }

  return apiPayload
}

async function ensurePetRecordForClient(activeModuleId, activeTenantId, clientId) {
  if (activeModuleId !== 'petshop' || !clientId) return clientId

  const response = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
    let query = supabase
      .from('clients')
      .select('id, name, phone, email, document, address, neighborhood, city, notes, details')
      .eq('module_id', activeModuleId)
      .eq('id', clientId)
      .single()

    query = applyTenantFilter(query, activeTenantId, includeTenant)
    return query
  })

  if (response.error) throw response.error
  const client = response.data
  if (!client?.id) throw new Error('Cliente selecionado nao encontrado.')

  const petPayload = {
    id: client.id,
    module_id: activeModuleId,
    owner_name: client.name || 'Cliente',
    owner_cpf: client.document || null,
    phone: client.phone || 'sem telefone',
    email: client.email || null,
    owner_address: client.address || null,
    owner_neighborhood: client.neighborhood || null,
    owner_city: client.city || null,
    pet_name: client.details?.pet_name || client.name || 'Pet',
    species: normalizeSpecies(client.details?.species),
    breed: client.details?.breed || null,
    birth_date: client.details?.birth_date || null,
    weight_kg: client.details?.weight_kg || null,
    color: client.details?.color || null,
    notes: client.notes || null,
    updated_at: new Date().toISOString(),
  }

  const petResponse = await supabase
    .from('pets')
    .upsert(petPayload, { onConflict: 'id' })
    .select('id')
    .single()

  if (petResponse.error) throw petResponse.error
  return petResponse.data?.id || client.id
}

async function findAvailableSubscriptionBenefit(moduleId, tenantId, clientId, serviceType) {
  if (moduleId !== 'petshop' || !clientId || !serviceType) return null

  const response = await runWithTenantFallback(tenantId, async (includeTenant) => {
    let query = supabase
      .from('client_subscriptions')
      .select(`
        id, services_used,
        subscription_plans ( services )
      `)
      .eq('module_id', moduleId)
      .eq('client_id', clientId)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    query = applyTenantFilter(query, tenantId, includeTenant)
    return query
  })

  if (response.error || !response.data) return null

  const planServices = response.data.subscription_plans?.services || []
  const serviceConfig = planServices.find((entry) => entry?.service_type === serviceType)
  if (!serviceConfig) return null

  const used = Number(response.data.services_used?.[serviceType] || 0)
  const total = Number(serviceConfig.qty_per_cycle || 0)
  if (total <= used) return null

  return {
    subscriptionId: response.data.id,
    usage: response.data.services_used || {},
    serviceType,
    remaining: total - used,
  }
}

async function consumeSubscriptionBenefit(moduleId, tenantId, benefit) {
  if (!benefit?.subscriptionId) return

  const nextUsage = {
    ...(benefit.usage || {}),
    [benefit.serviceType]: Number(benefit.usage?.[benefit.serviceType] || 0) + 1,
  }

  const response = await runWithTenantFallback(tenantId, async (includeTenant) => {
    let query = supabase
      .from('client_subscriptions')
      .update({
        services_used: nextUsage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', benefit.subscriptionId)
      .eq('module_id', moduleId)

    query = applyTenantFilter(query, tenantId, includeTenant)
    return query
  })

  if (response.error) throw response.error
}

export function useAppointments() {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const channelRef = useRef(null)
  const { activeModuleId } = useModuleCtx()
  const { activeTenantId } = useAuthCtx()

  const fetchAppointmentById = useCallback(async (appointmentId) => {
    if (!activeModuleId || !appointmentId) return null

    let response = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      let query = supabase
        .from('appointments')
        .select(APPOINTMENT_SELECT)
        .eq('id', appointmentId)
        .eq('module_id', activeModuleId)
        .single()

      query = applyTenantFilter(query, activeTenantId, includeTenant)
      return query
    })

    if (response.error && isClientRelationError(response.error)) {
      response = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
        let query = supabase
          .from('appointments')
          .select(APPOINTMENT_BASE_FIELDS)
          .eq('id', appointmentId)
          .eq('module_id', activeModuleId)
          .single()

        query = applyTenantFilter(query, activeTenantId, includeTenant)
        return query
      })

      if (response.error) throw response.error

      const clientMap = await loadClientsMap(activeModuleId, activeTenantId, [response.data?.client_id])
      return mapAppointmentRow({
        ...response.data,
        clients: clientMap.get(response.data?.client_id) || null,
      })
    }

    if (response.error) throw response.error
    return mapAppointmentRow(response.data)
  }, [activeModuleId, activeTenantId])

  const load = useCallback(async (filters = {}) => {
    if (!activeModuleId) return
    setLoading(true)
    setError(null)
    const tz = getTimezoneOffset()

    try {
      const response = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
        let query = supabase
          .from('appointments')
          .select(APPOINTMENT_SELECT)
          .eq('module_id', activeModuleId)
          .order('scheduled_at', { ascending: true })

        query = applyTenantFilter(query, activeTenantId, includeTenant)

        if (filters.startDate || filters.endDate) {
          const startDate = filters.startDate || filters.endDate
          const endDate = filters.endDate || filters.startDate
          query = query
            .gte('scheduled_at', `${startDate}T00:00:00${tz}`)
            .lte('scheduled_at', `${endDate}T23:59:59.999${tz}`)
        } else if (filters.date) {
          query = query
            .gte('scheduled_at', `${filters.date}T00:00:00${tz}`)
            .lte('scheduled_at', `${filters.date}T23:59:59.999${tz}`)
        }
        if (filters.status) query = query.eq('status', filters.status)
        if (filters.service_type) query = query.eq('service_type', filters.service_type)
        if (filters.employee_id) query = query.eq('employee_id', filters.employee_id)

        return query
      })

      if (response.error && isClientRelationError(response.error)) {
        const fallbackResponse = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
          let query = supabase
            .from('appointments')
            .select(APPOINTMENT_BASE_FIELDS)
            .eq('module_id', activeModuleId)
            .order('scheduled_at', { ascending: true })

          query = applyTenantFilter(query, activeTenantId, includeTenant)

          if (filters.startDate || filters.endDate) {
            const startDate = filters.startDate || filters.endDate
            const endDate = filters.endDate || filters.startDate
            query = query
              .gte('scheduled_at', `${startDate}T00:00:00${tz}`)
              .lte('scheduled_at', `${endDate}T23:59:59.999${tz}`)
          } else if (filters.date) {
            query = query
              .gte('scheduled_at', `${filters.date}T00:00:00${tz}`)
              .lte('scheduled_at', `${filters.date}T23:59:59.999${tz}`)
          }
          if (filters.status) query = query.eq('status', filters.status)
          if (filters.service_type) query = query.eq('service_type', filters.service_type)
          if (filters.employee_id) query = query.eq('employee_id', filters.employee_id)

          return query
        })

        if (fallbackResponse.error) throw fallbackResponse.error

        const clientMap = await loadClientsMap(activeModuleId, activeTenantId, (fallbackResponse.data || []).map((item) => item.client_id))
        const rows = (fallbackResponse.data || []).map((item) => mapAppointmentRow({
          ...item,
          clients: clientMap.get(item.client_id) || null,
        }))
        setAppointments(rows)
        return
      }

      if (response.error) throw response.error
      setAppointments((response.data || []).map(mapAppointmentRow))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [activeModuleId, activeTenantId])

  const subscribeRealtime = useCallback((date = todayISO()) => {
    if (!activeModuleId) return
    channelRef.current?.unsubscribe()
    channelRef.current = supabase
      .channel('appointments-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'appointments',
      }, () => load({ date }))
      .subscribe()
  }, [activeModuleId, load])

  useEffect(() => () => channelRef.current?.unsubscribe(), [])

  const create = useCallback(async (payload) => {
    if (!activeTenantId) throw new Error('Selecione uma empresa ativa antes de salvar o agendamento.')
    const apiPayload = normalizeAppointmentPayload(payload, activeModuleId)
    if (apiPayload.client_id) {
      apiPayload.pet_id = await ensurePetRecordForClient(activeModuleId, activeTenantId, apiPayload.client_id)
    }

    const benefit = await findAvailableSubscriptionBenefit(
      activeModuleId,
      activeTenantId,
      apiPayload.client_id,
      apiPayload.service_type,
    )

    if (benefit) {
      apiPayload.subscription_id = benefit.subscriptionId
      apiPayload.subscription_benefit_used = true
      apiPayload.price = 0
      apiPayload.notes = [apiPayload.notes, `Plano ativo aplicado em ${apiPayload.service_type}`]
        .filter(Boolean)
        .join(' | ')
    }

    const response = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      const insertPayload = buildTenantPayload(apiPayload, activeTenantId, includeTenant)
      return supabase
        .from('appointments')
        .insert(insertPayload)
        .select('id')
        .single()
    })

    if (response.error) throw response.error

    if (benefit) {
      await consumeSubscriptionBenefit(activeModuleId, activeTenantId, benefit)
    }

    const created = await fetchAppointmentById(response.data?.id)
    setAppointments((prev) => [...prev, created].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)))
    return created
  }, [activeModuleId, activeTenantId, fetchAppointmentById])

  const update = useCallback(async (id, payload) => {
    if (!activeTenantId) throw new Error('Selecione uma empresa ativa antes de salvar o agendamento.')
    const apiPayload = normalizeAppointmentPayload(payload)
    if (apiPayload.client_id) {
      apiPayload.pet_id = await ensurePetRecordForClient(activeModuleId, activeTenantId, apiPayload.client_id)
    }

    const response = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      let query = supabase
        .from('appointments')
        .update(apiPayload)
        .eq('id', id)
        .eq('module_id', activeModuleId)

      query = applyTenantFilter(query, activeTenantId, includeTenant)
      return query
    })

    if (response.error) throw response.error

    const updated = await fetchAppointmentById(id)
    setAppointments((prev) => prev.map((appt) => (appt.id === id ? updated : appt)))
    return updated
  }, [activeModuleId, activeTenantId, fetchAppointmentById])

  const updateStatus = (id, status, extra = {}) => update(id, { status, ...extra })

  const remove = useCallback(async (id) => {
    const response = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      let query = supabase
        .from('appointments')
        .delete()
        .eq('id', id)
        .eq('module_id', activeModuleId)

      query = applyTenantFilter(query, activeTenantId, includeTenant)
      return query
    })

    if (response.error) throw response.error
    setAppointments((prev) => prev.filter((appt) => appt.id !== id))
  }, [activeModuleId, activeTenantId])

  const todayStats = () => {
    const today = todayISO()
    const todayList = appointments.filter((appt) => appt.scheduled_at?.startsWith(today))
    return {
      total: todayList.length,
      agendado: todayList.filter((appt) => appt.status === 'agendado').length,
      confirmado: todayList.filter((appt) => appt.status === 'confirmado').length,
      em_andamento: todayList.filter((appt) => appt.status === 'em_andamento').length,
      concluido: todayList.filter((appt) => appt.status === 'concluido').length,
      cancelado: todayList.filter((appt) => appt.status === 'cancelado').length,
    }
  }

  const serviceLabel = (type) => {
    const labels = {
      banho: 'Banho',
      tosa: 'Tosa',
      banho_e_tosa: 'Banho & Tosa',
      escovacao: 'Escovacao',
      veterinario: 'Veterinario',
      consulta: 'Consulta',
      vacina: 'Vacina',
      motoboy: 'Motoboy/Transporte',
      outro: 'Outro',
    }
    if (labels[type]) return labels[type]
    const normalized = String(type || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    if (/banho.*tosa|tosa.*banho/.test(normalized)) return 'Banho & Tosa'
    if (/banho/.test(normalized)) return 'Banho'
    if (/tosa|higien/.test(normalized)) return 'Tosa'
    if (/vacina/.test(normalized)) return 'Vacina'
    if (/vet|consulta|clinica|medico/.test(normalized)) return 'Veterinario'
    return type
  }

  const statusBadge = (status) => ({
    agendado: { cls: 'badge-amber', label: 'Agendado' },
    confirmado: { cls: 'badge-blue', label: 'Confirmado' },
    em_andamento: { cls: 'badge-purple', label: 'Em andamento' },
    concluido: { cls: 'badge-green', label: 'Concluido' },
    cancelado: { cls: 'badge-red', label: 'Cancelado' },
    no_show: { cls: 'badge-gray', label: 'No-show' },
  }[status] || { cls: 'badge-gray', label: status })

  return {
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
    serviceLabel,
    statusBadge,
  }
}
