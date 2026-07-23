import process from 'node:process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DateTime } from 'luxon'
import { respondToChatMessage } from '../server/lib/chat.js'
import { adminSupabase } from '../server/lib/supabase.js'

const MODULE_ID = 'petshop'
const ACTIVE_APPOINTMENT_STATUSES = new Set([
  'agendado',
  'confirmado',
  'em_andamento',
  'booked',
  'ocupado',
  'blocked',
  'bloqueado',
  'scheduled',
  'pendente',
])
const CANCELLED_APPOINTMENT_STATUSES = new Set([
  'cancelado',
  'cancelled',
  'concluido',
  'concluído',
  'completed',
  'finalizado',
])

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalize(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function extractAgentContext(context) {
  return context?.petbot_agent && typeof context.petbot_agent === 'object'
    ? context.petbot_agent
    : {}
}

function extractPendingOrder(context) {
  const pending = extractAgentContext(context).pending_order
  return pending?.id && pending?.order ? pending : null
}

function asIso(value) {
  const parsed = DateTime.fromISO(clean(value), { setZone: true })
  return parsed.isValid ? parsed.toUTC().toISO() : null
}

function sameInstant(left, right) {
  const leftIso = asIso(left)
  const rightIso = asIso(right)
  if (!leftIso || !rightIso) return false
  return Math.abs(DateTime.fromISO(leftIso).toMillis() - DateTime.fromISO(rightIso).toMillis()) < 1000
}

async function requireResult(query, label) {
  const { data, error } = await query
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

async function loadTestSettings(requestedTenantId = clean(process.env.PETBOT_E2E_TENANT_ID)) {
  let query = adminSupabase
    .from('settings')
    .select([
      'tenant_id',
      'module_id',
      'petbot_autonomy_mode',
      'petbot_timezone',
      'petbot_business_hours',
      'petbot_slot_interval_min',
      'petbot_booking_lead_time_min',
      'petbot_booking_capacity',
    ].join(','))
    .eq('module_id', MODULE_ID)
    .eq('petbot_autonomy_mode', 'enabled')

  const normalizedTenantId = clean(requestedTenantId)
  if (normalizedTenantId) query = query.eq('tenant_id', normalizedTenantId)

  const rows = await requireResult(query.limit(2), 'Não foi possível carregar as configurações do PetBot')
  assert(rows.length === 1, normalizedTenantId
    ? 'Não existe configuração autônoma única para o tenant informado.'
    : 'Defina PETBOT_E2E_TENANT_ID: mais de uma configuração autônoma foi encontrada.')
  return rows[0]
}

function appointmentOccupiesCandidate(appointment, candidateStart, candidateEnd) {
  const status = normalize(appointment.status)
  if (CANCELLED_APPOINTMENT_STATUSES.has(status)) return false
  if (status && !ACTIVE_APPOINTMENT_STATUSES.has(status)) return false

  const occupiedStart = DateTime.fromISO(appointment.scheduled_at, { setZone: true })
  if (!occupiedStart.isValid) return false
  const occupiedEnd = occupiedStart.plus({ minutes: Math.max(15, Number(appointment.duration_min || 60)) })
  return occupiedStart < candidateEnd && occupiedEnd > candidateStart
}

function ceilToInterval(value, interval) {
  return Math.ceil(value / interval) * interval
}

async function findSafeAppointmentSlots(settings, total = 3) {
  const zone = clean(settings.petbot_timezone) || 'America/Sao_Paulo'
  const now = DateTime.now().setZone(zone)
  const rangeEnd = now.plus({ days: 60 })
  const appointments = await requireResult(
    adminSupabase
      .from('appointments')
      .select('scheduled_at,duration_min,status')
      .eq('tenant_id', settings.tenant_id)
      .eq('module_id', MODULE_ID)
      .gte('scheduled_at', now.toUTC().toISO())
      .lte('scheduled_at', rangeEnd.toUTC().toISO()),
    'Não foi possível consultar a agenda real',
  )

  const interval = Math.max(5, Number(settings.petbot_slot_interval_min || 30))
  const lead = Math.max(0, Number(settings.petbot_booking_lead_time_min || 15))
  const businessHours = settings.petbot_business_hours || {}
  const selected = []

  for (let dayOffset = 2; dayOffset <= 60 && selected.length < total; dayOffset += 1) {
    const date = now.plus({ days: dayOffset }).startOf('day')
    const periods = Array.isArray(businessHours[String(date.weekday)])
      ? businessHours[String(date.weekday)]
      : []
    let selectedForDate = false

    for (const period of periods) {
      const open = DateTime.fromFormat(
        `${date.toFormat('yyyy-MM-dd')} ${clean(period.open)}`,
        'yyyy-MM-dd HH:mm',
        { zone },
      )
      const close = DateTime.fromFormat(
        `${date.toFormat('yyyy-MM-dd')} ${clean(period.close)}`,
        'yyyy-MM-dd HH:mm',
        { zone },
      )
      if (!open.isValid || !close.isValid || close <= open) continue

      const preferredStart = date.set({ hour: 10, minute: 0 })
      const offsetMinutes = Math.max(0, preferredStart.diff(open, 'minutes').minutes)
      let candidate = open.plus({ minutes: ceilToInterval(offsetMinutes, interval) })

      while (candidate.plus({ minutes: 180 }) <= close) {
        const candidateEnd = candidate.plus({ minutes: 180 })
        const respectsLead = candidate > now.plus({ minutes: lead + 30 })
        const isFree = !appointments.some((appointment) => (
          appointmentOccupiesCandidate(appointment, candidate, candidateEnd)
        ))
        if (respectsLead && isFree) {
          selected.push(candidate)
          selectedForDate = true
          break
        }
        candidate = candidate.plus({ minutes: interval })
      }
      if (selectedForDate) break
    }
  }

  assert(selected.length === total, `Não foram encontrados ${total} horários livres e isolados na agenda.`)
  return selected
}

function formatRequestedSlot(slot) {
  return `pode ser dia ${slot.toFormat('dd/MM/yyyy')} às ${slot.toFormat('HH:mm')}?`
}

function createFlowDefinitions(slots) {
  return [
    {
      id: 'banho_normal',
      customerName: 'Ronaldo Teste',
      petName: 'Thor',
      expectedOrderType: 'banho_tosa',
      expectedServicePattern: /banho/i,
      forbiddenServicePattern: /\btosa\b(?!\s*higi)/i,
      slot: slots[0],
      seedMessages: [
        'Ola bom dia, gostaria de agendar um banho pro meu cachorro',
        'Somente banho normal',
        'tosa higienica',
        'thor',
        'cachorro',
        'shih tzu',
        formatRequestedSlot(slots[0]),
        'vou levar',
        'sem perfume',
      ],
      confirmation: 'sim, confirmo',
    },
    {
      id: 'banho_tosa',
      customerName: 'Luisa Teste',
      petName: 'Toby',
      expectedOrderType: 'banho_tosa',
      expectedServicePattern: /tosa/i,
      slot: slots[1],
      seedMessages: [
        'Ola bom dia, gostaria de agendar um banho e tosa pro meu cachorro',
        'é toby, ele tem 6kg',
        'Shih tzu',
        'tosa no corpinho, máquina 3',
        formatRequestedSlot(slots[1]),
        'Vou levar ele',
        'sem observação',
      ],
      confirmation: 'confirmo',
    },
    {
      id: 'veterinaria',
      customerName: 'Vanessa Teste',
      petName: 'Bob',
      expectedOrderType: 'veterinaria',
      expectedServicePattern: /veterin/i,
      slot: slots[2],
      seedMessages: [
        'Ola boa tarde, gostaria de marcar uma consulta veterinaria pro Bob',
        'ele é um cachorro sem raça definida, porte pequeno e tem 9kg',
        'ele está com coceira, mas está bem e não é emergência',
        formatRequestedSlot(slots[2]),
      ],
      confirmation: 'sim, por favor',
    },
  ]
}

function nextMissingFactMessage(flow, session) {
  const facts = extractAgentContext(session.context).facts || {}
  if (!clean(facts.pet_name)) return `o nome dele é ${flow.petName}`
  if (!clean(facts.species)) return `${flow.petName} é cachorro`
  if (!clean(facts.breed) && !clean(facts.size)) {
    return flow.id === 'veterinaria'
      ? `${flow.petName} é sem raça definida e porte pequeno`
      : `${flow.petName} é shih tzu`
  }
  if (flow.id !== 'veterinaria' && !(Number(facts.weight_kg || 0) > 0)) {
    return flow.id === 'banho_normal' ? 'ele tem 8kg' : 'ele tem 6kg'
  }
  if (flow.id === 'veterinaria' && !clean(facts.symptom)) {
    return 'ele está com coceira, mas está bem e não é emergência'
  }
  if (!clean(facts.service_date) || !clean(facts.service_preferred_time || facts.service_time_preference)) {
    return formatRequestedSlot(flow.slot)
  }
  if (flow.id !== 'veterinaria' && !clean(facts.service_transport_mode)) return 'vou levar'
  if (flow.id !== 'veterinaria' && !facts.service_notes_resolved) {
    return flow.id === 'banho_normal' ? 'sem perfume' : 'sem observação'
  }
  if (!clean(facts.service_type)) {
    return flow.id === 'veterinaria'
      ? 'quero uma consulta veterinária comum'
      : flow.id === 'banho_normal'
        ? 'é somente banho normal, com a tosa higiênica que já vem inclusa'
        : 'é banho com tosa no corpinho, máquina 3'
  }
  return 'Pode preparar o resumo final com esses dados, por favor.'
}

async function createTestSession({ tenantId, marker, flow, phone }) {
  const existingClients = await requireResult(
    adminSupabase
      .from('clients')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('module_id', MODULE_ID)
      .eq('phone', phone),
    `Falha ao verificar o telefone fictício de ${flow.id}`,
  )
  assert(existingClients.length === 0, `O telefone fictício de ${flow.id} já existe.`)

  return requireResult(
    adminSupabase
      .from('chat_sessions')
      .insert({
        tenant_id: tenantId,
        module_id: MODULE_ID,
        customer_phone: phone,
        customer_name: flow.customerName,
        status: 'bot',
        channel: 'whatsapp',
        intent: 'geral',
        context: {
          e2e_test: {
            marker,
            flow: flow.id,
          },
        },
        external_id: `${marker}:${flow.id}`,
      })
      .select('id,tenant_id,module_id,customer_phone,customer_name,status,client_id,context')
      .single(),
    `Falha ao criar a conversa ${flow.id}`,
  )
}

async function loadSession(sessionId) {
  return requireResult(
    adminSupabase
      .from('chat_sessions')
      .select('id,tenant_id,module_id,customer_phone,customer_name,status,client_id,intent,context,last_message_at')
      .eq('id', sessionId)
      .single(),
    'Falha ao recarregar a sessão do chat',
  )
}

async function sendTurn(flow, sessionId, message, marker, transcript) {
  const startedAt = Date.now()
  const result = await respondToChatMessage(adminSupabase, sessionId, message, {
    source: 'live_e2e',
    userMetadata: { e2e_marker: marker, e2e_flow: flow.id },
    assistantMetadata: { e2e_marker: marker, e2e_flow: flow.id },
  })
  const reply = clean(result.reply)
  transcript.push({
    customer: message,
    assistant: reply,
    duration_ms: Date.now() - startedAt,
  })
  process.stdout.write(`\n[${flow.id}] Cliente: ${message}\n[${flow.id}] Luna: ${reply}\n`)
  return loadSession(sessionId)
}

async function reachPendingOrder(flow, session, marker, transcript) {
  let current = session
  for (const message of flow.seedMessages) {
    current = await sendTurn(flow, session.id, message, marker, transcript)
  }

  for (let attempt = 0; attempt < 8 && !extractPendingOrder(current.context); attempt += 1) {
    const supplement = nextMissingFactMessage(flow, current)
    current = await sendTurn(flow, session.id, supplement, marker, transcript)
  }

  const pending = extractPendingOrder(current.context)
  assert(pending, `${flow.id}: o chat não chegou ao resumo final depois das mensagens controladas.`)
  assert(clean(pending.order.order_type) === flow.expectedOrderType,
    `${flow.id}: tipo preparado incorreto (${clean(pending.order.order_type) || 'vazio'}).`)
  assert(sameInstant(pending.order.scheduled_at, flow.slot.toISO()),
    `${flow.id}: o resumo preparou um horário diferente do solicitado.`)
  assert(flow.expectedServicePattern.test(clean(pending.order.service_label || pending.order.service_type)),
    `${flow.id}: o serviço preparado não corresponde ao fluxo.`)
  if (flow.forbiddenServicePattern) {
    assert(!flow.forbiddenServicePattern.test(clean(pending.order.service_label)),
      `${flow.id}: banho normal foi convertido indevidamente em tosa corporal.`)
  }
  return { session: current, pending }
}

async function verifyCommittedRows({ flow, session, pending }) {
  const context = session.context || {}
  const saleId = clean(context.last_sale_id)
  const orderId = clean(context.last_order_id)
  const appointmentId = clean(context.last_appointment_id)
  assert(saleId && orderId && appointmentId, `${flow.id}: os IDs terminais não foram gravados no contexto.`)
  assert(extractAgentContext(context).order_saved === true, `${flow.id}: order_saved não ficou verdadeiro.`)
  assert(!extractPendingOrder(context), `${flow.id}: o pedido continuou pendente depois da confirmação.`)

  const [sale, order, appointment, commits, salesByPhone, ordersBySession, appointmentsByPhone] = await Promise.all([
    requireResult(
      adminSupabase
        .from('sales')
        .select('id,tenant_id,module_id,client_id,customer_name,customer_phone,total_price,status,payment_status,source,fulfillment_type,notes')
        .eq('id', saleId)
        .single(),
      `${flow.id}: venda ausente`,
    ),
    requireResult(
      adminSupabase
        .from('service_delivery_orders')
        .select('id,tenant_id,module_id,sale_id,client_id,session_id,source,order_type,status,scheduled_for,contact_phone,payment_status,notes')
        .eq('id', orderId)
        .single(),
      `${flow.id}: ordem ausente`,
    ),
    requireResult(
      adminSupabase
        .from('appointments')
        .select('id,tenant_id,module_id,client_id,pet_id,service_type,scheduled_at,duration_min,price,status,source,customer_name,customer_phone,notes')
        .eq('id', appointmentId)
        .single(),
      `${flow.id}: agendamento ausente`,
    ),
    requireResult(
      adminSupabase
        .from('petbot_order_commits')
        .select('tenant_id,idempotency_key,session_id,status,result')
        .eq('tenant_id', session.tenant_id)
        .eq('session_id', session.id),
      `${flow.id}: confirmação idempotente ausente`,
    ),
    requireResult(
      adminSupabase
        .from('sales')
        .select('id')
        .eq('tenant_id', session.tenant_id)
        .eq('module_id', MODULE_ID)
        .eq('customer_phone', session.customer_phone),
      `${flow.id}: falha ao contar vendas`,
    ),
    requireResult(
      adminSupabase
        .from('service_delivery_orders')
        .select('id')
        .eq('tenant_id', session.tenant_id)
        .eq('module_id', MODULE_ID)
        .eq('session_id', session.id),
      `${flow.id}: falha ao contar ordens`,
    ),
    requireResult(
      adminSupabase
        .from('appointments')
        .select('id')
        .eq('tenant_id', session.tenant_id)
        .eq('module_id', MODULE_ID)
        .eq('customer_phone', session.customer_phone),
      `${flow.id}: falha ao contar agendamentos`,
    ),
  ])

  assert(salesByPhone.length === 1, `${flow.id}: esperado 1 venda, encontrado ${salesByPhone.length}.`)
  assert(ordersBySession.length === 1, `${flow.id}: esperado 1 ordem, encontrado ${ordersBySession.length}.`)
  assert(appointmentsByPhone.length === 1,
    `${flow.id}: esperado 1 agendamento, encontrado ${appointmentsByPhone.length}.`)
  assert(commits.length === 1, `${flow.id}: esperado 1 commit idempotente, encontrado ${commits.length}.`)
  assert(commits[0].status === 'completed', `${flow.id}: commit transacional não terminou.`)
  assert(clean(commits[0].result?.sale_id) === saleId, `${flow.id}: commit aponta para outra venda.`)
  assert(clean(commits[0].result?.order_id) === orderId, `${flow.id}: commit aponta para outra ordem.`)
  assert(clean(commits[0].result?.appointment_id) === appointmentId,
    `${flow.id}: commit aponta para outro agendamento.`)

  assert(sale.source === 'whatsapp' && sale.fulfillment_type === 'servico',
    `${flow.id}: venda não foi registrada como serviço do WhatsApp.`)
  assert(Number(sale.total_price) === Number(pending.order.total),
    `${flow.id}: total salvo diverge do resumo confirmado.`)
  assert(order.sale_id === saleId && order.session_id === session.id,
    `${flow.id}: ordem não está ligada à venda e conversa corretas.`)
  assert(order.source === 'whatsapp' && order.order_type === 'servico' && order.status === 'agendado',
    `${flow.id}: ordem não chegou à área operacional como serviço agendado.`)
  assert(appointment.source === 'whatsapp' && appointment.status === 'agendado',
    `${flow.id}: agenda não recebeu um agendamento ativo do WhatsApp.`)
  assert(sameInstant(appointment.scheduled_at, pending.order.scheduled_at),
    `${flow.id}: horário da agenda diverge do resumo.`)
  assert(sameInstant(order.scheduled_for, appointment.scheduled_at),
    `${flow.id}: horário da ordem diverge da agenda.`)
  assert(clean(appointment.service_type) === clean(pending.order.service_type),
    `${flow.id}: tipo de serviço na agenda diverge do resumo.`)
  assert(flow.expectedServicePattern.test(clean(appointment.service_type)),
    `${flow.id}: agendamento foi salvo na categoria de serviço errada.`)

  return {
    sale,
    order,
    appointment,
    commit: commits[0],
  }
}

async function countArtifacts(session) {
  const [sales, orders, appointments, commits] = await Promise.all([
    requireResult(
      adminSupabase
        .from('sales')
        .select('id')
        .eq('tenant_id', session.tenant_id)
        .eq('module_id', MODULE_ID)
        .eq('customer_phone', session.customer_phone),
      'Falha ao recontar vendas',
    ),
    requireResult(
      adminSupabase
        .from('service_delivery_orders')
        .select('id')
        .eq('tenant_id', session.tenant_id)
        .eq('module_id', MODULE_ID)
        .eq('session_id', session.id),
      'Falha ao recontar ordens',
    ),
    requireResult(
      adminSupabase
        .from('appointments')
        .select('id')
        .eq('tenant_id', session.tenant_id)
        .eq('module_id', MODULE_ID)
        .eq('customer_phone', session.customer_phone),
      'Falha ao recontar agendamentos',
    ),
    requireResult(
      adminSupabase
        .from('petbot_order_commits')
        .select('idempotency_key')
        .eq('tenant_id', session.tenant_id)
        .eq('session_id', session.id),
      'Falha ao recontar commits',
    ),
  ])
  return {
    sales: sales.length,
    orders: orders.length,
    appointments: appointments.length,
    commits: commits.length,
  }
}

async function runFlow({ flow, tenantId, marker, phone }) {
  const transcript = []
  const createdSession = await createTestSession({ tenantId, marker, flow, phone })
  const { session: preparedSession, pending } = await reachPendingOrder(
    flow,
    createdSession,
    marker,
    transcript,
  )

  const committedSession = await sendTurn(
    flow,
    preparedSession.id,
    flow.confirmation,
    marker,
    transcript,
  )
  const rows = await verifyCommittedRows({ flow, session: committedSession, pending })
  const beforeDuplicate = await countArtifacts(committedSession)

  const afterDuplicateSession = await sendTurn(
    flow,
    committedSession.id,
    'sim, confirmo novamente, por favor',
    marker,
    transcript,
  )
  const afterDuplicate = await countArtifacts(afterDuplicateSession)
  assert(JSON.stringify(afterDuplicate) === JSON.stringify(beforeDuplicate),
    `${flow.id}: a confirmação repetida criou registros duplicados.`)
  assert(!extractPendingOrder(afterDuplicateSession.context),
    `${flow.id}: a confirmação repetida reabriu o resumo final.`)
  const duplicateReply = transcript.at(-1)?.assistant || ''
  assert(!/\bconfirma\b[^.?!]*\?/i.test(duplicateReply),
    `${flow.id}: a confirmação repetida voltou a pedir confirmação.`)

  return {
    id: flow.id,
    session_id: committedSession.id,
    client_id: committedSession.client_id,
    pet_id: rows.appointment.pet_id,
    sale_id: rows.sale.id,
    order_id: rows.order.id,
    appointment_id: rows.appointment.id,
    scheduled_at: rows.appointment.scheduled_at,
    service_type: rows.appointment.service_type,
    counts: afterDuplicate,
    evidence: {
      sale: {
        id: rows.sale.id,
        source: rows.sale.source,
        fulfillment_type: rows.sale.fulfillment_type,
        status: rows.sale.status,
      },
      order: {
        id: rows.order.id,
        sale_id: rows.order.sale_id,
        session_id: rows.order.session_id,
        order_type: rows.order.order_type,
        status: rows.order.status,
        scheduled_for: rows.order.scheduled_for,
      },
      appointment: {
        id: rows.appointment.id,
        service_type: rows.appointment.service_type,
        status: rows.appointment.status,
        scheduled_at: rows.appointment.scheduled_at,
      },
      commit: {
        idempotency_key: rows.commit.idempotency_key,
        status: rows.commit.status,
      },
    },
    transcript,
  }
}

async function deleteExactRows(table, column, ids, label) {
  const uniqueIds = [...new Set(ids.filter(Boolean))]
  if (!uniqueIds.length) return 0
  const deleted = await requireResult(
    adminSupabase
      .from(table)
      .delete()
      .in(column, uniqueIds)
      .select(column),
    label,
  )
  return deleted.length
}

async function cleanupArtifacts({ tenantId, sessionIds, phones, knownResults }) {
  const [currentSessions, ordersBySession, salesByPhone, appointmentsByPhone, clientsByPhone] = await Promise.all([
    sessionIds.length
      ? requireResult(
      adminSupabase
        .from('chat_sessions')
        .select('id,client_id,context')
        .eq('tenant_id', tenantId)
        .in('id', sessionIds),
      'Falha ao localizar sessões para limpeza',
      )
      : [],
    sessionIds.length
      ? requireResult(
        adminSupabase
          .from('service_delivery_orders')
          .select('id,sale_id')
          .eq('tenant_id', tenantId)
          .in('session_id', sessionIds),
        'Falha ao localizar ordens para limpeza',
      )
      : [],
    phones.length
      ? requireResult(
        adminSupabase
          .from('sales')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('module_id', MODULE_ID)
          .in('customer_phone', phones),
        'Falha ao localizar vendas para limpeza',
      )
      : [],
    phones.length
      ? requireResult(
        adminSupabase
          .from('appointments')
          .select('id,pet_id')
          .eq('tenant_id', tenantId)
          .eq('module_id', MODULE_ID)
          .in('customer_phone', phones),
        'Falha ao localizar agendamentos para limpeza',
      )
      : [],
    phones.length
      ? requireResult(
        adminSupabase
          .from('clients')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('module_id', MODULE_ID)
          .in('phone', phones),
        'Falha ao localizar clientes para limpeza',
      )
      : [],
  ])
  const contexts = currentSessions.map((session) => session.context || {})
  const saleIds = [
    ...knownResults.map((result) => result.sale_id),
    ...contexts.map((context) => context.last_sale_id),
    ...ordersBySession.map((order) => order.sale_id),
    ...salesByPhone.map((sale) => sale.id),
  ]
  const orderIds = [
    ...knownResults.map((result) => result.order_id),
    ...contexts.map((context) => context.last_order_id),
    ...ordersBySession.map((order) => order.id),
  ]
  const appointmentIds = [
    ...knownResults.map((result) => result.appointment_id),
    ...contexts.map((context) => context.last_appointment_id),
    ...appointmentsByPhone.map((appointment) => appointment.id),
  ]
  const clientIds = [
    ...knownResults.map((result) => result.client_id),
    ...currentSessions.map((session) => session.client_id),
    ...clientsByPhone.map((client) => client.id),
  ]

  const appointments = appointmentIds.filter(Boolean).length
    ? await requireResult(
      adminSupabase
        .from('appointments')
        .select('id,pet_id')
        .eq('tenant_id', tenantId)
        .in('id', [...new Set(appointmentIds.filter(Boolean))]),
      'Falha ao localizar pets fictícios para limpeza',
    )
    : []
  const petIds = [
    ...knownResults.map((result) => result.pet_id),
    ...appointments.map((appointment) => appointment.pet_id),
    ...appointmentsByPhone.map((appointment) => appointment.pet_id),
  ]

  const report = {}
  report.events = await deleteExactRows('petbot_events', 'session_id', sessionIds, 'Falha ao apagar eventos de teste')
  report.orders = await deleteExactRows('service_delivery_orders', 'id', orderIds, 'Falha ao apagar ordens de teste')
  report.appointments = await deleteExactRows('appointments', 'id', appointmentIds, 'Falha ao apagar agenda de teste')
  report.stock_movements = await deleteExactRows('stock_movements', 'sale_id', saleIds, 'Falha ao apagar movimentos de teste')
  report.sale_items = await deleteExactRows('sale_items', 'sale_id', saleIds, 'Falha ao apagar itens de teste')
  report.sales = await deleteExactRows('sales', 'id', saleIds, 'Falha ao apagar vendas de teste')
  report.commits = await deleteExactRows('petbot_order_commits', 'session_id', sessionIds, 'Falha ao apagar commits de teste')
  report.messages = await deleteExactRows('chat_messages', 'session_id', sessionIds, 'Falha ao apagar mensagens de teste')
  report.sessions = await deleteExactRows('chat_sessions', 'id', sessionIds, 'Falha ao apagar sessões de teste')
  report.pets = await deleteExactRows('pets', 'id', petIds, 'Falha ao apagar pets fictícios')
  report.clients = await deleteExactRows('clients', 'id', clientIds, 'Falha ao apagar clientes fictícios')

  const [remainingSessions, remainingOrders, remainingSales, remainingAppointments, remainingClients] = await Promise.all([
    sessionIds.length
      ? requireResult(adminSupabase.from('chat_sessions').select('id').in('id', sessionIds), 'Falha na auditoria de sessões')
      : [],
    sessionIds.length
      ? requireResult(adminSupabase.from('service_delivery_orders').select('id').in('session_id', sessionIds), 'Falha na auditoria de ordens')
      : [],
    phones.length
      ? requireResult(adminSupabase.from('sales').select('id').eq('tenant_id', tenantId).in('customer_phone', phones), 'Falha na auditoria de vendas')
      : [],
    phones.length
      ? requireResult(adminSupabase.from('appointments').select('id').eq('tenant_id', tenantId).in('customer_phone', phones), 'Falha na auditoria da agenda')
      : [],
    phones.length
      ? requireResult(adminSupabase.from('clients').select('id').eq('tenant_id', tenantId).in('phone', phones), 'Falha na auditoria de clientes')
      : [],
  ])
  report.remaining = {
    sessions: remainingSessions.length,
    orders: remainingOrders.length,
    sales: remainingSales.length,
    appointments: remainingAppointments.length,
    clients: remainingClients.length,
  }
  assert(Object.values(report.remaining).every((count) => count === 0),
    `A limpeza deixou artefatos: ${JSON.stringify(report.remaining)}.`)
  return report
}

export async function runPetbotLiveConversations({ tenantId = '', onProgress = null } = {}) {
  const startedAt = new Date()
  const notify = typeof onProgress === 'function' ? onProgress : () => {}
  const settings = await loadTestSettings(tenantId)
  const slots = await findSafeAppointmentSlots(settings, 3)
  const marker = `PETBOT_LIVE_E2E_${Date.now()}`
  const phoneSuffix = String(Date.now()).slice(-8)
  const flows = createFlowDefinitions(slots)
  const sessionIds = []
  const phones = []
  const results = []
  let executionError = null
  let cleanupError = null
  let cleanupReport = null
  let activeFlowId = null

  notify({ stage: 'started', marker, total: flows.length })
  process.stdout.write(`Suíte ${marker}: iniciando ${flows.length} conversas no runtime real.\n`)
  process.stdout.write(`Horários isolados: ${slots.map((slot) => slot.toFormat('dd/MM/yyyy HH:mm')).join(', ')}.\n`)

  try {
    for (const [index, flow] of flows.entries()) {
      activeFlowId = flow.id
      notify({ stage: 'flow_started', flow: flow.id, index: index + 1, total: flows.length })
      const phone = `5599${phoneSuffix}${index + 1}`
      phones.push(phone)
      const result = await runFlow({
        flow,
        tenantId: settings.tenant_id,
        marker,
        phone,
      })
      sessionIds.push(result.session_id)
      results.push(result)
      notify({ stage: 'flow_passed', flow: flow.id, index: index + 1, total: flows.length })
    }
  } catch (error) {
    executionError = error
    notify({
      stage: 'flow_failed',
      flow: activeFlowId,
      error: error instanceof Error ? error.message : String(error),
    })
    try {
      const markerSessions = await requireResult(
        adminSupabase
          .from('chat_sessions')
          .select('id')
          .eq('tenant_id', settings.tenant_id)
          .like('external_id', `${marker}:%`),
        'Falha ao recuperar sessões parciais da suíte',
      )
      for (const session of markerSessions) {
        if (!sessionIds.includes(session.id)) sessionIds.push(session.id)
      }
    } catch (recoveryError) {
      process.stderr.write(`Falha adicional ao recuperar sessões parciais: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}\n`)
    }
  } finally {
    notify({ stage: 'cleanup_started' })
    try {
      cleanupReport = await cleanupArtifacts({
        tenantId: settings.tenant_id,
        sessionIds,
        phones,
        knownResults: results,
      })
      notify({ stage: 'cleanup_passed' })
    } catch (error) {
      cleanupError = error
      notify({
        stage: 'cleanup_failed',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const failedCount = executionError ? 1 : 0
  const finishedAt = new Date()
  return {
    suite: 'petbot_live_conversations',
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
    marker,
    tenant_id: settings.tenant_id,
    total: flows.length,
    passed: results.length,
    failed: failedCount,
    not_run: Math.max(0, flows.length - results.length - failedCount),
    failed_flow: executionError ? activeFlowId : null,
    error: executionError instanceof Error ? executionError.message : executionError ? String(executionError) : null,
    results: results.map((result) => ({
      flow: result.id,
      messages: result.transcript.length,
      service_type: result.service_type,
      scheduled_at: result.scheduled_at,
      records_before_cleanup: result.counts,
      saved_in_agenda: true,
      saved_in_orders: true,
      duplicate_confirmation_safe: true,
      evidence: result.evidence,
    })),
    cleanup: cleanupReport,
    cleanup_error: cleanupError instanceof Error ? cleanupError.message : cleanupError ? String(cleanupError) : null,
  }
}

async function main() {
  assert(process.argv.includes('--run'),
    'Este teste usa o runtime e o Supabase reais. Execute novamente com --run.')

  const report = await runPetbotLiveConversations()
  const reportArg = process.argv.find((arg) => arg.startsWith('--report='))
  const reportPath = resolve(process.cwd(), clean(reportArg?.slice('--report='.length)) || `artifacts/petbot-live-e2e-${report.marker}.json`)
  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  process.stdout.write(`\n${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`Relatório salvo em ${reportPath}.\n`)

  if (report.cleanup_error) throw new Error(report.cleanup_error)
  if (report.error) throw new Error(report.error)
}

const isDirectRun = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(`\nFALHA NA SUÍTE: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
