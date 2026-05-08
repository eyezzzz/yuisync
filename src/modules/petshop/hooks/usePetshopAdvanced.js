import { useCallback } from 'react'
import { supabase, todayISO } from '../../../lib/supabase'
import { useModuleCtx } from '../../../context/ModuleContext'
import { useAuthCtx } from '../../../context/AuthContext'
import { listManagedUsers } from '../../../lib/api'
import { applyTenantFilter, buildTenantPayload, runWithTenantFallback } from '../../../lib/tenant'

const DEFAULT_LOYALTY_SETTINGS = { points_per_real: 1, points_per_service: 10, redemption_rate: 100, expiry_days: 365 }
const CLIENT_SELECT = 'id,name,phone,email,address,neighborhood,city,details'
const PLAN_SELECT = 'id,name,price,billing_cycle,services,active'
const ORDER_SELECT = `*,clients(${CLIENT_SELECT}),sales(id,customer_name,payment_method,total_price,created_at,fulfillment_type,source)`
const APPT_BASE_SELECT = 'id,module_id,client_id,groomer_id,service_type,scheduled_at,duration_min,price,status,live_status,checkin_at,ready_at,notes,subscription_benefit_used'
const APPT_SELECT = `${APPT_BASE_SELECT},clients(${CLIENT_SELECT})`
const STAFF_TYPES = ['funcionario', 'banho_tosa', 'veterinaria', 'motodog']
const LIVE_STAFF_TYPES = ['funcionario', 'banho_tosa', 'veterinaria']
const ORDER_ASSIGNEE_STAFF_TYPES = ['funcionario', 'banho_tosa', 'veterinaria', 'motodog']

export const BILLING_CYCLES = { monthly: { label: 'Mensal', days: 30 }, quarterly: { label: 'Trimestral', days: 90 } }
export const LIVE_STATUS_FLOW = [
  { id: 'aguardando', label: 'Aguardando', hint: 'Pet ainda nao deu entrada', tone: 'badge-gray' },
  { id: 'check_in', label: 'Check-in', hint: 'Recepcao confirmou a chegada', tone: 'badge-blue' },
  { id: 'em_banho', label: 'Em banho', hint: 'Banho em execucao', tone: 'badge-amber' },
  { id: 'em_tosa', label: 'Em tosa', hint: 'Tosa ou acabamento em andamento', tone: 'badge-purple' },
  { id: 'secando', label: 'Secando', hint: 'Etapa final antes da entrega', tone: 'badge-blue' },
  { id: 'pronto', label: 'Pronto', hint: 'Pet liberado para retirada', tone: 'badge-green' },
]
export const SERVICE_ORDER_FLOW = {
  entrega: [
    { id: 'pendente', label: 'Pendente', hint: 'Pedido aguardando confirmacao operacional', tone: 'badge-gray' },
    { id: 'separacao', label: 'Separacao', hint: 'Itens ou servico em preparacao', tone: 'badge-amber' },
    { id: 'em_rota', label: 'Em rota', hint: 'Entregador saiu para atendimento', tone: 'badge-blue' },
    { id: 'concluida', label: 'Concluida', hint: 'Entrega finalizada com sucesso', tone: 'badge-green' },
  ],
  servico: [
    { id: 'pendente', label: 'Pendente', hint: 'Aguardando triagem da equipe', tone: 'badge-gray' },
    { id: 'agendado', label: 'Agendado', hint: 'Equipe confirmou a ordem de servico', tone: 'badge-blue' },
    { id: 'concluida', label: 'Concluida', hint: 'Servico encerrado', tone: 'badge-green' },
  ],
}
export const CAMPAIGN_TEMPLATES = {
  sumiram: { id: 'sumiram', label: 'Sumiram', audienceName: 'Clientes sem retorno', buildMessage: (c) => `Sentimos falta do ${c.pet_name || c.owner_name}. Quer que eu deixe um banho reservado para esta semana?` },
  aniversario: { id: 'aniversario', label: 'Aniversario do Pet', audienceName: 'Pet aniversario', buildMessage: (c) => `Parabens para o ${c.pet_name || 'seu pet'}! Temos um mimo especial e pontos extras esperando por voces.` },
  vacina: { id: 'vacina', label: 'Vacina vencendo', audienceName: 'Vacina proxima do vencimento', buildMessage: (c) => `A vacina do ${c.pet_name || 'seu pet'} vence em breve. Quer que eu ja adiante o agendamento?` },
}

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const toISODate = (d) => new Date(d).toISOString().slice(0, 10)
const getDateBounds = (d = todayISO()) => ({ start: `${d}T00:00:00.000Z`, end: `${d}T23:59:59.999Z` })
const getMonthRange = (ref = new Date()) => {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1)
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999)
  return { start: start.toISOString(), end: end.toISOString(), startDate: toISODate(start), endDate: toISODate(end) }
}
const normalizePlanServices = (services = []) => (services || []).filter((x) => x?.service_type).map((x) => ({ service_type: x.service_type, qty_per_cycle: Number(x.qty_per_cycle || 0) }))
const getCycleDays = (cycle) => BILLING_CYCLES[cycle]?.days || 30
const hasCommissionsSignatureError = (error) => {
  const m = String(error?.message || '').toLowerCase()
  return m.includes('calculate_commissions') && (
    m.includes('does not exist')
    || m.includes('schema cache')
    || m.includes('could not find the function')
  )
}
const isSalePaymentSplitSchemaError = (error) => {
  const message = String(error?.message || '').toLowerCase()
  if (!message) return false
  return message.includes('sale_payment_splits') && (
    message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('relation')
    || message.includes('column')
  )
}
const isAppointmentClientRelationError = (error) => {
  const message = String(error?.message || '').toLowerCase()
  if (!message) return false
  return message.includes('appointments') && message.includes('clients') && (
    message.includes('schema cache')
    || message.includes('relationship')
    || message.includes('could not find')
  )
}
const normalizeStaffType = (value) => STAFF_TYPES.includes(value) ? value : 'funcionario'
const filterProfilesByStaffType = (profiles, allowedTypes = STAFF_TYPES) => (
  (profiles || []).filter((profile) => {
    if (!profile || profile.role === 'admin' || profile.active === false) return false
    return allowedTypes.includes(normalizeStaffType(profile.staff_type))
  })
)

function formatClient(client) {
  return {
    id: client.id,
    owner_name: client.name || '',
    phone: client.phone || '',
    email: client.email || '',
    owner_address: client.address || '',
    owner_neighborhood: client.neighborhood || '',
    owner_city: client.city || '',
    pet_name: client.details?.pet_name || client.name || '',
    species: client.details?.species || 'other',
    breed: client.details?.breed || '',
    birth_date: client.details?.birth_date || null,
    vaccine_due_date: client.details?.vaccine_due_date || null,
  }
}

const buildUsageSummary = (sub) => {
  const services = normalizePlanServices(sub.subscription_plans?.services)
  const usage = sub.services_used || {}
  return services.map((s) => ({
    service_type: s.service_type,
    used: Number(usage[s.service_type] || 0),
    total: Number(s.qty_per_cycle || 0),
    remaining: Math.max(0, Number(s.qty_per_cycle || 0) - Number(usage[s.service_type] || 0)),
  }))
}
const mapServiceOrder = (order) => ({ ...order, client: formatClient(order.clients || {}), sale: order.sales || null })

async function getCurrentProfileId() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return data?.user?.id || null
}

export function usePetshopAdvanced() {
  const { activeModuleId } = useModuleCtx()
  const { activeTenantId } = useAuthCtx()
  const moduleId = activeModuleId || 'petshop'
  const runScoped = useCallback((runner) => runWithTenantFallback(activeTenantId, runner), [activeTenantId])

  const loadClientMap = useCallback(async (clientIds = []) => {
    const ids = [...new Set((clientIds || []).filter(Boolean))]
    if (ids.length === 0) return new Map()

    const res = await runScoped(async (includeTenant) => {
      let q = supabase
        .from('clients')
        .select(CLIENT_SELECT)
        .eq('module_id', moduleId)
        .in('id', ids)

      return applyTenantFilter(q, activeTenantId, includeTenant)
    })

    if (res.error) throw res.error
    return new Map((res.data || []).map((client) => [client.id, client]))
  }, [activeTenantId, moduleId, runScoped])

  const loadAppointmentById = useCallback(async (appointmentId) => {
    if (!appointmentId) return null

    let res = await runScoped(async (includeTenant) => {
      let q = supabase
        .from('appointments')
        .select(APPT_SELECT)
        .eq('id', appointmentId)
        .eq('module_id', moduleId)
        .single()

      return applyTenantFilter(q, activeTenantId, includeTenant)
    })

    if (res.error && isAppointmentClientRelationError(res.error)) {
      res = await runScoped(async (includeTenant) => {
        let q = supabase
          .from('appointments')
          .select(APPT_BASE_SELECT)
          .eq('id', appointmentId)
          .eq('module_id', moduleId)
          .single()

        return applyTenantFilter(q, activeTenantId, includeTenant)
      })

      if (res.error) throw res.error

      const clientMap = await loadClientMap([res.data?.client_id])
      return {
        ...res.data,
        client: formatClient(clientMap.get(res.data?.client_id) || {}),
        groomer: null,
      }
    }

    if (res.error) throw res.error
    return {
      ...res.data,
      client: formatClient(res.data?.clients || {}),
      groomer: null,
    }
  }, [activeTenantId, loadClientMap, moduleId, runScoped])

  const queueClientMessage = useCallback(async ({ client, message, campaignType = null, audienceName = null }) => {
    if (!client?.id || !message?.trim()) return null
    const now = new Date().toISOString()

    const sessionRes = await runScoped(async (includeTenant) => {
      let q = supabase.from('chat_sessions').select('id,status').eq('module_id', moduleId).eq('client_id', client.id).order('last_message_at', { ascending: false }).limit(1).maybeSingle()
      return applyTenantFilter(q, activeTenantId, includeTenant)
    })
    if (sessionRes.error) throw sessionRes.error
    let session = sessionRes.data

    if (!session) {
      const createdRes = await runScoped(async (includeTenant) => {
        const row = buildTenantPayload({
          module_id: moduleId,
          client_id: client.id,
          customer_name: client.name || client.details?.pet_name || 'Cliente',
          customer_phone: client.phone || `cliente-${client.id}`,
          status: 'human',
          channel: 'whatsapp',
          last_message_at: now,
        }, activeTenantId, includeTenant)
        return supabase.from('chat_sessions').insert(row).select('id,status').single()
      })
      if (createdRes.error) throw createdRes.error
      session = createdRes.data
    }

    const { error: msgErr } = await supabase.from('chat_messages').insert({ session_id: session.id, role: 'human_agent', content: message.trim(), sent_at: now })
    if (msgErr) throw msgErr

    const updateRes = await runScoped(async (includeTenant) => {
      let q = supabase.from('chat_sessions').update({ status: 'human', last_message_at: now }).eq('id', session.id)
      return applyTenantFilter(q, activeTenantId, includeTenant)
    })
    if (updateRes.error) throw updateRes.error

    if (campaignType) {
      const logRes = await runScoped(async (includeTenant) => {
        const row = buildTenantPayload({
          module_id: moduleId,
          client_id: client.id,
          campaign_type: campaignType,
          audience_name: audienceName,
          message: message.trim(),
          status: 'queued',
          sent_at: now,
        }, activeTenantId, includeTenant)
        return supabase.from('petshop_campaign_logs').insert(row)
      })
      if (logRes.error) throw logRes.error
    }

    return session
  }, [activeTenantId, moduleId, runScoped])

  const loadPlans = useCallback(async () => {
    const res = await runScoped(async (includeTenant) => {
      let q = supabase.from('subscription_plans').select('*').eq('module_id', moduleId).order('price')
      return applyTenantFilter(q, activeTenantId, includeTenant)
    })
    if (res.error) throw res.error
    return (res.data || []).map((p) => ({ ...p, services: normalizePlanServices(p.services) }))
  }, [activeTenantId, moduleId, runScoped])

  const savePlan = useCallback(async (payload) => {
    const row = { module_id: moduleId, name: payload.name?.trim(), price: Number(payload.price || 0), billing_cycle: payload.billing_cycle || 'monthly', services: normalizePlanServices(payload.services), active: payload.active !== false, updated_at: new Date().toISOString() }
    if (!row.name) throw new Error('Informe o nome do plano.')
    const res = await runScoped(async (includeTenant) => {
      const p = buildTenantPayload(row, activeTenantId, includeTenant)
      let q = payload.id ? supabase.from('subscription_plans').update(p).eq('id', payload.id).eq('module_id', moduleId) : supabase.from('subscription_plans').insert(p)
      q = applyTenantFilter(q, activeTenantId, includeTenant)
      return q.select('*').single()
    })
    if (res.error) throw res.error
    return { ...res.data, services: normalizePlanServices(res.data.services) }
  }, [activeTenantId, moduleId, runScoped])

  const loadClientSubscriptions = useCallback(async () => {
    const res = await runScoped(async (includeTenant) => {
      let q = supabase.from('client_subscriptions').select(`*,subscription_plans(${PLAN_SELECT}),clients(${CLIENT_SELECT})`).eq('module_id', moduleId).order('started_at', { ascending: false })
      return applyTenantFilter(q, activeTenantId, includeTenant)
    })
    if (res.error) throw res.error
    return (res.data || []).map((s) => ({ ...s, client: formatClient(s.clients || {}), usage_summary: buildUsageSummary(s) }))
  }, [activeTenantId, moduleId, runScoped])

  const saveClientSubscription = useCallback(async (payload) => {
    const planServices = normalizePlanServices(payload.plan?.services || payload.subscription_plans?.services || [])
    const startedAt = payload.started_at || todayISO()
    const row = {
      module_id: moduleId,
      plan_id: payload.plan_id,
      client_id: payload.client_id,
      status: payload.status || 'active',
      next_billing_date: payload.next_billing_date || toISODate(addDays(startedAt, getCycleDays(payload.billing_cycle || payload.plan?.billing_cycle))),
      services_used: payload.services_used || {},
      started_at: startedAt,
      cancelled_at: payload.status === 'cancelled' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }
    if (!row.plan_id || !row.client_id) throw new Error('Selecione o plano e o pet.')

    const res = await runScoped(async (includeTenant) => {
      const p = buildTenantPayload(row, activeTenantId, includeTenant)
      let q = payload.id ? supabase.from('client_subscriptions').update(p).eq('id', payload.id).eq('module_id', moduleId) : supabase.from('client_subscriptions').insert(p)
      q = applyTenantFilter(q, activeTenantId, includeTenant)
      return q.select(`*,subscription_plans(id,name,price,billing_cycle,services),clients(${CLIENT_SELECT})`).single()
    })
    if (res.error) throw res.error

    return {
      ...res.data,
      client: formatClient(res.data.clients || {}),
      usage_summary: buildUsageSummary({
        ...res.data,
        subscription_plans: { ...res.data.subscription_plans, services: planServices.length ? planServices : res.data.subscription_plans?.services },
      }),
    }
  }, [activeTenantId, moduleId, runScoped])

  const loadLoyaltyDashboard = useCallback(async () => {
    const [settingsRes, pointsRes] = await Promise.all([
      runScoped(async (includeTenant) => applyTenantFilter(supabase.from('loyalty_settings').select('*').eq('module_id', moduleId).maybeSingle(), activeTenantId, includeTenant)),
      runScoped(async (includeTenant) => {
        let q = supabase.from('loyalty_points').select(`id,client_id,module_id,points,reason,reference_id,expires_at,created_at,clients(${CLIENT_SELECT})`).eq('module_id', moduleId).order('created_at', { ascending: false })
        return applyTenantFilter(q, activeTenantId, includeTenant)
      }),
    ])
    if (settingsRes.error) throw settingsRes.error
    if (pointsRes.error) throw pointsRes.error

    const balances = new Map()
    const recent = (pointsRes.data || []).map((e) => {
      const client = formatClient(e.clients || {})
      const current = balances.get(e.client_id) || { client_id: e.client_id, client, balance: 0 }
      current.balance += Number(e.points || 0)
      balances.set(e.client_id, current)
      return { ...e, client }
    })
    return { settings: settingsRes.data || { module_id: moduleId, ...DEFAULT_LOYALTY_SETTINGS }, balances: [...balances.values()].sort((a, b) => b.balance - a.balance), recent }
  }, [activeTenantId, moduleId, runScoped])

  const saveLoyaltySettings = useCallback(async (payload) => {
    const row = { module_id: moduleId, points_per_real: Number(payload.points_per_real || DEFAULT_LOYALTY_SETTINGS.points_per_real), points_per_service: Number(payload.points_per_service || DEFAULT_LOYALTY_SETTINGS.points_per_service), redemption_rate: Number(payload.redemption_rate || DEFAULT_LOYALTY_SETTINGS.redemption_rate), expiry_days: Number(payload.expiry_days || DEFAULT_LOYALTY_SETTINGS.expiry_days), updated_at: new Date().toISOString() }
    const res = await runScoped(async (includeTenant) => {
      const p = buildTenantPayload(row, activeTenantId, includeTenant)
      return supabase.from('loyalty_settings').upsert(p, { onConflict: includeTenant ? 'tenant_id,module_id' : 'module_id' }).select('*').single()
    })
    if (res.error) throw res.error
    return res.data
  }, [activeTenantId, moduleId, runScoped])

  const createLoyaltyEntry = useCallback(async (payload) => {
    const row = { client_id: payload.client_id, module_id: moduleId, points: Number(payload.points || 0), reason: payload.reason || 'bonus', reference_id: payload.reference_id || null, expires_at: payload.expires_at || null }
    if (!row.client_id || !row.points) throw new Error('Informe o cliente e a pontuacao.')
    const res = await runScoped(async (includeTenant) => {
      const p = buildTenantPayload(row, activeTenantId, includeTenant)
      return supabase.from('loyalty_points').insert(p).select(`*,clients(${CLIENT_SELECT})`).single()
    })
    if (res.error) throw res.error
    return { ...res.data, client: formatClient(res.data.clients || {}) }
  }, [activeTenantId, moduleId, runScoped])

  const loadCommissionRules = useCallback(async () => {
    const [profiles, rulesRes] = await Promise.all([
      listManagedUsers(moduleId, { tenantId: activeTenantId }),
      runScoped(async (includeTenant) => applyTenantFilter(supabase.from('commission_rules').select('*').eq('module_id', moduleId).order('created_at', { ascending: false }), activeTenantId, includeTenant)),
    ])
    if (rulesRes.error) throw rulesRes.error
    return { profiles: filterProfilesByStaffType(profiles, STAFF_TYPES), rules: rulesRes.data || [] }
  }, [activeTenantId, moduleId, runScoped])

  const saveCommissionRule = useCallback(async (payload) => {
    const row = { module_id: moduleId, profile_id: payload.profile_id, type: payload.type || 'percentage', rate: Number(payload.rate || 0), applies_to: payload.applies_to || 'all', updated_at: new Date().toISOString() }
    if (!row.profile_id || !row.rate) throw new Error('Selecione o colaborador e a taxa.')
    const res = await runScoped(async (includeTenant) => {
      const p = buildTenantPayload(row, activeTenantId, includeTenant)
      let q = payload.id ? supabase.from('commission_rules').update(p).eq('id', payload.id).eq('module_id', moduleId) : supabase.from('commission_rules').insert(p)
      q = applyTenantFilter(q, activeTenantId, includeTenant)
      return q.select('*').single()
    })
    if (res.error) throw res.error
    return res.data
  }, [activeTenantId, moduleId, runScoped])

  const deleteCommissionRule = useCallback(async (ruleId) => {
    const res = await runScoped(async (includeTenant) => applyTenantFilter(supabase.from('commission_rules').delete().eq('id', ruleId).eq('module_id', moduleId), activeTenantId, includeTenant))
    if (res.error) throw res.error
  }, [activeTenantId, moduleId, runScoped])

  const loadTeamSnapshot = useCallback(async ({ startDate, endDate } = {}) => {
    const range = getMonthRange(new Date())
    const start = startDate ? `${startDate}T00:00:00.000Z` : range.start
    const end = endDate ? `${endDate}T23:59:59.999Z` : range.end

    let rpcRes = await supabase.rpc('calculate_commissions', { p_module_id: moduleId, p_start: start, p_end: end, p_tenant_id: activeTenantId || null })
    if (rpcRes.error && hasCommissionsSignatureError(rpcRes.error)) {
      rpcRes = await supabase.rpc('calculate_commissions', { p_module_id: moduleId, p_start: start, p_end: end })
    }
    if (rpcRes.error) throw rpcRes.error

    const { profiles, rules } = await loadCommissionRules()
    const ruleMap = new Map((rules || []).map((r) => [r.profile_id, r]))
    const rows = (rpcRes.data || []).map((e) => ({ ...e, revenue: Number(e.revenue || 0), commission: Number(e.commission || 0), rule: ruleMap.get(e.profile_id) || null }))
    return { profiles, rows, range: { startDate: startDate || range.startDate, endDate: endDate || range.endDate } }
  }, [activeTenantId, loadCommissionRules, moduleId])

  const exportCommissionCsv = useCallback((rows, fileName = 'comissoes-petshop.csv') => {
    const lines = [['Colaborador', 'Atendimentos', 'Faturamento', 'Comissao'].join(','), ...rows.map((r) => [`"${r.groomer_name || ''}"`, r.appointments_count || 0, Number(r.revenue || 0).toFixed(2), Number(r.commission || 0).toFixed(2)].join(','))]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const loadGroomers = useCallback(async () => {
    const profiles = await listManagedUsers(moduleId, { tenantId: activeTenantId })
    return filterProfilesByStaffType(profiles, LIVE_STAFF_TYPES)
  }, [activeTenantId, moduleId])

  const loadLiveBoard = useCallback(async (date = todayISO()) => {
    const { start, end } = getDateBounds(date)
    let res = await runScoped(async (includeTenant) => {
      let q = supabase.from('appointments').select(APPT_SELECT).eq('module_id', moduleId).gte('scheduled_at', start).lte('scheduled_at', end).order('scheduled_at', { ascending: true })
      return applyTenantFilter(q, activeTenantId, includeTenant)
    })
    if (res.error && isAppointmentClientRelationError(res.error)) {
      res = await runScoped(async (includeTenant) => {
        let q = supabase.from('appointments').select(APPT_BASE_SELECT).eq('module_id', moduleId).gte('scheduled_at', start).lte('scheduled_at', end).order('scheduled_at', { ascending: true })
        return applyTenantFilter(q, activeTenantId, includeTenant)
      })
      if (res.error) throw res.error

      const clientMap = await loadClientMap((res.data || []).map((appointment) => appointment.client_id))
      const groomers = await loadGroomers()
      const map = new Map(groomers.map((g) => [g.id, g]))
      return (res.data || []).map((appointment) => ({
        ...appointment,
        client: formatClient(clientMap.get(appointment.client_id) || {}),
        groomer: map.get(appointment.groomer_id) || null,
      }))
    }
    if (res.error) throw res.error
    const groomers = await loadGroomers()
    const map = new Map(groomers.map((g) => [g.id, g]))
    return (res.data || []).map((a) => ({ ...a, client: formatClient(a.clients || {}), groomer: map.get(a.groomer_id) || null }))
  }, [activeTenantId, loadClientMap, loadGroomers, moduleId, runScoped])

  const updateAppointmentGroomer = useCallback(async (appointment, groomerId) => {
    if (!appointment?.id) throw new Error('Agendamento invalido.')

    const updateRes = await runScoped(async (includeTenant) => {
      let q = supabase
        .from('appointments')
        .update({ groomer_id: groomerId || null })
        .eq('id', appointment.id)
        .eq('module_id', moduleId)

      return applyTenantFilter(q, activeTenantId, includeTenant)
    })

    if (updateRes.error) throw updateRes.error
    return loadAppointmentById(appointment.id)
  }, [activeTenantId, loadAppointmentById, moduleId, runScoped])

  const updateAppointmentLiveStatus = useCallback(async (appointment, nextStatus) => {
    const now = new Date().toISOString()
    const row = { live_status: nextStatus }
    if (nextStatus === 'check_in' && !appointment.checkin_at) row.checkin_at = now
    if (nextStatus === 'pronto') row.ready_at = now

    const updateRes = await runScoped(async (includeTenant) => {
      let q = supabase.from('appointments').update(row).eq('id', appointment.id).eq('module_id', moduleId)
      return applyTenantFilter(q, activeTenantId, includeTenant)
    })
    if (updateRes.error) throw updateRes.error

    const updated = await loadAppointmentById(appointment.id)
    if (nextStatus === 'pronto' && updated.client?.id) {
      const msg = `O ${updated.client.pet_name || 'pet'} esta pronto para busca. Horario: ${new Date(now).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`
      await queueClientMessage({
        client: {
          id: updated.client.id,
          name: updated.client.owner_name,
          phone: updated.client.phone,
          details: { pet_name: updated.client.pet_name },
        },
        message: msg,
      })
    }
    return updated
  }, [activeTenantId, loadAppointmentById, moduleId, queueClientMessage, runScoped])

  const loadCampaignAudience = useCallback(async (campaignId) => {
    const res = await runScoped(async (includeTenant) => {
      let q = supabase.from('clients').select(`id,name,phone,email,address,neighborhood,city,details,appointments(id,scheduled_at,service_type,status)`).eq('module_id', moduleId).order('name')
      return applyTenantFilter(q, activeTenantId, includeTenant)
    })
    if (res.error) throw res.error
    const today = new Date()
    return (res.data || []).map((c) => {
      const f = formatClient(c)
      const appts = [...(c.appointments || [])].sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at))
      const last = appts[0]?.scheduled_at || null
      const days = last ? (Date.now() - new Date(last).getTime()) / 86400000 : null
      const bday = f.birth_date ? new Date(f.birth_date) : null
      const vac = f.vaccine_due_date ? new Date(f.vaccine_due_date) : null
      let eligible = false
      if (campaignId === 'sumiram') eligible = !last || Number(days) >= 45
      if (campaignId === 'aniversario' && bday) {
        const y = new Date(today.getFullYear(), bday.getMonth(), bday.getDate())
        eligible = Math.abs((y.getTime() - today.getTime()) / 86400000) <= 3
      }
      if (campaignId === 'vacina' && vac) {
        const diff = (vac.getTime() - today.getTime()) / 86400000
        eligible = diff >= 0 && diff <= 7
      }
      return { ...f, last_visit_at: last, days_since_last_visit: days, eligible }
    }).filter((c) => c.eligible)
  }, [activeTenantId, moduleId, runScoped])

  const runCampaign = useCallback(async ({ campaignId, customMessage = '' }) => {
    const template = CAMPAIGN_TEMPLATES[campaignId]
    if (!template) throw new Error('Campanha invalida.')
    const audience = await loadCampaignAudience(campaignId)
    for (const c of audience) {
      const message = customMessage.trim() || template.buildMessage(c)
      await queueClientMessage({ client: { id: c.id, name: c.owner_name, phone: c.phone, details: { pet_name: c.pet_name } }, message, campaignType: campaignId, audienceName: template.audienceName })
    }
    return { count: audience.length, audience }
  }, [loadCampaignAudience, queueClientMessage])

  const loadCampaignHistory = useCallback(async () => {
    const res = await runScoped(async (includeTenant) => {
      let q = supabase.from('petshop_campaign_logs').select(`*,clients(${CLIENT_SELECT})`).eq('module_id', moduleId).order('created_at', { ascending: false }).limit(100)
      return applyTenantFilter(q, activeTenantId, includeTenant)
    })
    if (res.error) throw res.error
    return (res.data || []).map((e) => ({ ...e, client: formatClient(e.clients || {}) }))
  }, [activeTenantId, moduleId, runScoped])

  const loadOrderAssignees = useCallback(async () => {
    const profiles = await listManagedUsers(moduleId, { tenantId: activeTenantId })
    return filterProfilesByStaffType(profiles, ORDER_ASSIGNEE_STAFF_TYPES)
  }, [activeTenantId, moduleId])

  const loadServiceOrders = useCallback(async ({ status = '', orderType = '' } = {}) => {
    const res = await runScoped(async (includeTenant) => {
      let q = supabase.from('service_delivery_orders').select(ORDER_SELECT).eq('module_id', moduleId).order('created_at', { ascending: false })
      q = applyTenantFilter(q, activeTenantId, includeTenant)
      if (status) q = q.eq('status', status)
      if (orderType) q = q.eq('order_type', orderType)
      return q
    })
    if (res.error) throw res.error
    return (res.data || []).map(mapServiceOrder)
  }, [activeTenantId, moduleId, runScoped])

  const updateServiceOrder = useCallback(async (order, payload) => {
    if (!order?.id) throw new Error('Ordem invalida.')
    const res = await runScoped(async (includeTenant) => {
      let q = supabase.from('service_delivery_orders').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', order.id).eq('module_id', moduleId).select(ORDER_SELECT).single()
      return applyTenantFilter(q, activeTenantId, includeTenant)
    })
    if (res.error) throw res.error
    const updatedOrder = mapServiceOrder(res.data)
    if (payload.status && payload.status !== order.status && updatedOrder.client?.id) {
      const map = {
        agendado: 'Sua ordem de servico foi confirmada. Ja deixamos o proximo passo registrado por aqui.',
        em_rota: 'Seu pedido saiu para entrega. Qualquer ajuste de rota, seguimos por aqui.',
        concluida: 'Sua ordem foi concluida com sucesso. Se precisar de algo, e so responder no WhatsApp.',
      }
      const msg = map[payload.status]
      if (msg) await queueClientMessage({ client: { id: updatedOrder.client.id, name: updatedOrder.client.owner_name, phone: updatedOrder.client.phone, details: { pet_name: updatedOrder.client.pet_name } }, message: msg })
    }
    return updatedOrder
  }, [activeTenantId, moduleId, queueClientMessage, runScoped])

  const loadCashDashboard = useCallback(async () => {
    const { start, end } = getDateBounds(todayISO())
    const [regRes, salesRes, splitsRes] = await Promise.all([
      runScoped(async (includeTenant) => applyTenantFilter(supabase.from('cash_register').select('*').eq('module_id', moduleId).order('opened_at', { ascending: false }).limit(30), activeTenantId, includeTenant)),
      runScoped(async (includeTenant) => {
        let q = supabase.from('sales').select('id,total_price,payment_method,created_at,status').eq('module_id', moduleId).eq('status', 'concluido').gte('created_at', start).lte('created_at', end)
        return applyTenantFilter(q, activeTenantId, includeTenant)
      }),
      runScoped(async (includeTenant) => {
        let q = supabase.from('sale_payment_splits').select('sale_id,payment_method,amount').eq('module_id', moduleId)
        q = q.gte('created_at', start).lte('created_at', end)
        return applyTenantFilter(q, activeTenantId, includeTenant)
      }),
    ])
    if (regRes.error) throw regRes.error
    if (salesRes.error) throw salesRes.error
    if (splitsRes.error && !isSalePaymentSplitSchemaError(splitsRes.error)) throw splitsRes.error

    const sales = salesRes.data || []
    const splitRows = splitsRes.error ? [] : (splitsRes.data || [])
    const splitMap = new Map()
    splitRows.forEach((row) => {
      const existing = splitMap.get(row.sale_id) || []
      existing.push(row)
      splitMap.set(row.sale_id, existing)
    })

    const totalsByMethod = sales.reduce((acc, sale) => {
      const saleSplits = splitMap.get(sale.id) || []
      if (saleSplits.length > 0) {
        saleSplits.forEach((split) => {
          const key = split.payment_method || 'outros'
          acc[key] = (acc[key] || 0) + Number(split.amount || 0)
        })
        return acc
      }

      const key = sale.payment_method || 'outros'
      acc[key] = (acc[key] || 0) + Number(sale.total_price || 0)
      return acc
    }, {})
    return {
      registers: regRes.data || [],
      current: (regRes.data || []).find((r) => !r.closed_at) || null,
      sales,
      totalsByMethod,
      expectedCash: Number(totalsByMethod.dinheiro || 0),
    }
  }, [activeTenantId, moduleId, runScoped])

  const openCashRegister = useCallback(async ({ opening_balance = 0, notes = '' }) => {
    const profileId = await getCurrentProfileId()
    const res = await runScoped(async (includeTenant) => {
      const row = buildTenantPayload({ module_id: moduleId, opened_by: profileId, opening_balance: Number(opening_balance || 0), notes: notes || null }, activeTenantId, includeTenant)
      return supabase.from('cash_register').insert(row).select('*').single()
    })
    if (res.error) throw res.error
    return res.data
  }, [activeTenantId, moduleId, runScoped])

  const closeCashRegister = useCallback(async ({ registerId, closing_balance = 0, notes = '' }) => {
    const dashboard = await loadCashDashboard()
    const current = dashboard.current
    if (!current || current.id !== registerId) throw new Error('Nenhum caixa aberto encontrado.')

    const expectedBalance = Number(current.opening_balance || 0) + Number(dashboard.expectedCash || 0)
    const closingBalance = Number(closing_balance || 0)
    const profileId = await getCurrentProfileId()

    const res = await runScoped(async (includeTenant) => {
      let q = supabase.from('cash_register').update({
        closed_by: profileId,
        closing_balance: closingBalance,
        expected_balance: expectedBalance,
        difference: closingBalance - expectedBalance,
        closed_at: new Date().toISOString(),
        notes: notes || current.notes || null,
      }).eq('id', registerId).eq('module_id', moduleId).select('*').single()
      return applyTenantFilter(q, activeTenantId, includeTenant)
    })
    if (res.error) throw res.error
    return res.data
  }, [activeTenantId, loadCashDashboard, moduleId, runScoped])

  return {
    BILLING_CYCLES,
    LIVE_STATUS_FLOW,
    SERVICE_ORDER_FLOW,
    CAMPAIGN_TEMPLATES,
    loadPlans,
    savePlan,
    loadClientSubscriptions,
    saveClientSubscription,
    loadLoyaltyDashboard,
    saveLoyaltySettings,
    createLoyaltyEntry,
    loadCommissionRules,
    saveCommissionRule,
    deleteCommissionRule,
    loadTeamSnapshot,
    exportCommissionCsv,
    loadGroomers,
    loadLiveBoard,
    updateAppointmentGroomer,
    updateAppointmentLiveStatus,
    loadCampaignAudience,
    runCampaign,
    loadCampaignHistory,
    loadOrderAssignees,
    loadServiceOrders,
    updateServiceOrder,
    loadCashDashboard,
    openCashRegister,
    closeCashRegister,
    queueClientMessage,
  }
}
