import { DateTime } from 'luxon'
import { respondToChatMessage } from '../server/lib/chat.js'
import { adminSupabase } from '../server/lib/supabase.js'

const MODULE_ID = 'petshop'
const SUITE_VERSION = '2026-07-24.2'
const CATEGORY_ORDER = ['banho', 'servicos', 'produtos', 'racao', 'veterinaria']
const CATEGORY_LABELS = {
  banho: 'Banho',
  servicos: 'Tosa e outros serviços',
  produtos: 'Produtos',
  racao: 'Ração',
  veterinaria: 'Veterinária',
}
const ACTIVE_APPOINTMENT_STATUSES = new Set([
  'agendado', 'confirmado', 'em_andamento', 'booked', 'ocupado', 'blocked', 'bloqueado', 'scheduled', 'pendente',
])
const CANCELLED_APPOINTMENT_STATUSES = new Set([
  'cancelado', 'cancelled', 'concluido', 'concluído', 'completed', 'finalizado',
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

function compact(value, max = 180) {
  const text = clean(value).replace(/\s+/g, ' ')
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
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

function extractFacts(context) {
  const agent = extractAgentContext(context)
  return {
    ...(agent.product_facts && typeof agent.product_facts === 'object' ? agent.product_facts : {}),
    ...(agent.facts && typeof agent.facts === 'object' ? agent.facts : {}),
  }
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

function isColumnCompatibilityError(error) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('schema cache')
    || message.includes('column')
    || message.includes('does not exist')
    || message.includes('could not find')
}

async function queryWithColumnFallback({ table, columnSets, apply, label }) {
  let lastError = null
  for (const columns of columnSets) {
    const result = await apply(adminSupabase.from(table).select(columns))
    if (!result.error) return result.data || []
    lastError = result.error
    if (!isColumnCompatibilityError(result.error)) break
  }
  throw new Error(`${label}: ${lastError?.message || 'falha desconhecida'}`)
}

async function loadSettings(tenantId) {
  const rows = await requireResult(
    adminSupabase
      .from('settings')
      .select('tenant_id,module_id,petbot_autonomy_mode,petbot_timezone,petbot_business_hours,petbot_slot_interval_min,petbot_booking_lead_time_min,petbot_booking_capacity,pet_transport_options,delivery_fee')
      .eq('tenant_id', tenantId)
      .eq('module_id', MODULE_ID)
      .limit(2),
    'Não foi possível carregar as configurações do PetBot',
  )
  assert(rows.length === 1, 'Não existe uma configuração única do PetBot para o negócio informado.')
  assert(clean(rows[0].petbot_autonomy_mode) === 'enabled', 'O PetBot precisa estar com autonomia habilitada para o diagnóstico.')
  return rows[0]
}

function productText(item) {
  return normalize(`${item?.name || ''} ${item?.category || ''} ${item?.description || ''} ${JSON.stringify(item?.bot_metadata || {})}`)
}

function serviceText(item) {
  return normalize(`${item?.name || ''} ${item?.group_type || ''} ${item?.code || ''}`)
}

function uniqueById(rows = []) {
  const seen = new Set()
  return rows.filter((row) => {
    const id = clean(row?.id) || clean(row?.name)
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function firstMatching(rows, predicate, usedIds = new Set()) {
  return rows.find((row) => !usedIds.has(clean(row.id)) && predicate(row))
    || rows.find((row) => predicate(row))
    || null
}

const VETERINARY_EXCLUSION = /consulta|veterin|cirurg|anest|exame|analise|acompanhamento|piometra|castr|vacina|ultrassom|hemograma|internacao|retorno|coleta|sutura|laborat|raio|radiograf|eletro|hernia|masectomia|cistocentese/
const GROOMING_SIGNAL = /tosa|hidrat|escov|dental|unha|ouvido|desemb|trim|groom|higien/
const PRODUCT_SERVICE_SIGNAL = /servico|servicos|banho|tosa|consulta|veterin|escovacao|hidratacao/
const FEED_SIGNAL = /racao|alimento completo|bionatural|premier|golden|granplus|special dog|royal canin|pedigree|whiskas|friskies|formula natural|quatree|origens|magnus/
const FEED_EXCLUSION = /bifinho|petisco|snack|ossinho|biscoito|palito|pate|sache|bebida|agua mineral/

const SERVICE_INTENTS = [
  {
    key: 'tosa_maquina',
    label: 'Tosa na máquina',
    request: 'uma tosa na máquina',
    matches: (row) => /tosa/.test(serviceText(row)) && /maquin/.test(serviceText(row)),
  },
  {
    key: 'tosa_tesoura',
    label: 'Tosa na tesoura',
    request: 'uma tosa na tesoura',
    matches: (row) => /tosa/.test(serviceText(row)) && /tesour/.test(serviceText(row)),
  },
  {
    key: 'hidratacao',
    label: 'Hidratação do pelo',
    request: 'uma hidratação para o pelo',
    matches: (row) => /hidrat/.test(serviceText(row)),
  },
  {
    key: 'escovacao_dental',
    label: 'Escovação dental',
    request: 'uma escovação dos dentes',
    matches: (row) => /dental|escov.*dent|dent.*escov/.test(serviceText(row)),
  },
  {
    key: 'corte_unhas',
    label: 'Corte de unhas',
    request: 'um corte de unhas',
    matches: (row) => /unha/.test(serviceText(row)),
  },
  {
    key: 'limpeza_ouvidos',
    label: 'Limpeza de ouvidos',
    request: 'uma limpeza de ouvidos',
    matches: (row) => /ouvido/.test(serviceText(row)),
  },
  {
    key: 'desembolo',
    label: 'Desembolo do pelo',
    request: 'um desembolo do pelo',
    matches: (row) => /desemb/.test(serviceText(row)),
  },
]

const PRODUCT_INTENTS = [
  {
    key: 'antiparasitario',
    label: 'Antipulgas ou antiparasitário',
    noun: 'um antipulgas',
    matches: (row) => /antipul|antiparas|advocate|bravecto|simparic|nexgard|frontline/.test(productText(row)),
  },
  {
    key: 'shampoo',
    label: 'Shampoo',
    noun: 'um shampoo',
    matches: (row) => /shampoo|xampu/.test(productText(row)),
  },
  {
    key: 'condicionador',
    label: 'Condicionador',
    noun: 'um condicionador para o pelo',
    matches: (row) => /condicionador/.test(productText(row)),
  },
  {
    key: 'brinquedo',
    label: 'Brinquedo',
    noun: 'um brinquedo para cachorro',
    matches: (row) => /brinquedo|mordedor|bolinha|bola pet|corda/.test(productText(row)),
  },
  {
    key: 'higiene',
    label: 'Produto de higiene',
    noun: 'um produto de higiene para pet',
    matches: (row) => /tapete higien|areia|granulado|limpador|afasta|desinfet|eliminador de odor/.test(productText(row)),
  },
  {
    key: 'petisco',
    label: 'Petisco',
    noun: 'um petisco para cachorro',
    matches: (row) => /petisco|bifinho|snack|ossinho|biscoito|palito/.test(productText(row)),
  },
  {
    key: 'acessorio',
    label: 'Acessório',
    noun: 'um acessório para passeio',
    matches: (row) => /coleira|guia|peitoral|comedouro|bebedouro|escova/.test(productText(row)),
  },
]

function extractBrand(name = '') {
  const ignored = new Set(['racao', 'ração', 'pet', 'para', 'caes', 'cães', 'gatos', 'adulto', 'adultos', 'shampoo', 'condicionador'])
  const token = clean(name).split(/\s+/).find((part) => {
    const normalized = normalize(part).replace(/[^a-z0-9]/g, '')
    return normalized.length >= 3 && !ignored.has(normalized) && !/^\d/.test(normalized)
  })
  return token ? token.replace(/[^\p{L}\p{N}-]/gu, '') : ''
}

function extractPackageLabel(name = '') {
  const match = clean(name).match(/\b(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)\b/i)
  return match ? `${match[1]} ${match[2]}`.replace('.', ',') : ''
}

function productSemanticRequest(item, intent) {
  const text = productText(item)
  const brand = extractBrand(item?.name)
  const pack = extractPackageLabel(item?.name)
  const audience = /gato/.test(text)
    ? ' para gato'
    : /cachorro|cao|caes|dog/.test(text)
      ? ' para cachorro'
      : ''
  const weight = clean(item?.name).match(/(?:ate|até)\s*(\d+(?:[.,]\d+)?)\s*kg/i)
  const details = [brand ? `da ${brand}` : '', audience, weight ? ` de até ${weight[1]} kg` : '', pack ? `, embalagem de ${pack}` : '']
    .filter(Boolean)
    .join('')
  return `quero comprar ${intent.noun}${details}`.replace(/\s+/g, ' ').trim()
}

function feedSemanticRequest(item) {
  const text = productText(item)
  const brand = extractBrand(item?.name)
  const pack = extractPackageLabel(item?.name)
  const species = /gato/.test(text) ? 'gato' : 'cachorro'
  const age = /filhote|junior|puppy|kitten/.test(text) ? 'filhote' : /senior|sênior/.test(text) ? 'sênior' : 'adulto'
  const size = /pequen|small|rp\b/.test(text) ? ' de porte pequeno' : /medio|médio|grande|rg\b/.test(text) ? ' de porte médio ou grande' : ''
  const flavor = clean(item?.name).match(/\b(frango|cordeiro|carne|salm[aã]o|peixe|peru)\b/i)
  return [
    `quero uma ração${brand ? ` da ${brand}` : ''} para ${species} ${age}${size}`,
    flavor ? `sabor ${flavor[1]}` : '',
    pack ? `pacote de ${pack}` : '',
  ].filter(Boolean).join(', ')
}

async function loadCatalog(tenantId) {
  const [products, services] = await Promise.all([
    queryWithColumnFallback({
      table: 'products',
      columnSets: [
        'id,name,category,description,price,stock_quantity,active,bot_metadata,barcode',
        'id,name,category,description,price,stock_quantity,active,barcode',
        'id,name,category,price,stock_quantity,active',
      ],
      apply: (query) => query
        .eq('tenant_id', tenantId)
        .eq('module_id', MODULE_ID)
        .eq('active', true)
        .order('name')
        .limit(500),
      label: 'Não foi possível carregar os produtos ativos',
    }),
    queryWithColumnFallback({
      table: 'petshop_services',
      columnSets: [
        'id,code,name,group_type,default_price,default_duration_min,active,sort_order,source_product_id',
        'id,code,name,group_type,default_price,default_duration_min,active,sort_order',
        'id,code,name,group_type,default_price,active',
      ],
      apply: (query) => query
        .eq('tenant_id', tenantId)
        .eq('module_id', MODULE_ID)
        .eq('active', true)
        .order('sort_order')
        .order('name')
        .limit(300),
      label: 'Não foi possível carregar os serviços ativos',
    }).catch(() => []),
  ])

  const productRows = products.filter((item) => clean(item.name))
  const fallbackServices = productRows
    .filter((item) => PRODUCT_SERVICE_SIGNAL.test(productText(item)))
    .map((item, index) => ({
      id: item.id,
      code: `product_service_${index + 1}`,
      name: item.name,
      group_type: item.category || 'servico',
      default_price: item.price,
      default_duration_min: Number(item.bot_metadata?.duration_min || 60),
      active: item.active !== false,
      source_product_id: item.id,
    }))
  const serviceRows = uniqueById((services.length ? services : fallbackServices).filter((item) => clean(item.name)))
  const bathServices = serviceRows.filter((item) => /\bbanho\b/.test(serviceText(item)) && !VETERINARY_EXCLUSION.test(serviceText(item)))
  const groomingServices = serviceRows.filter((item) => GROOMING_SIGNAL.test(serviceText(item)) && !VETERINARY_EXCLUSION.test(serviceText(item)) && !/\bbanho\b/.test(serviceText(item)))
  const consultationService = serviceRows.find((item) => /consulta/.test(serviceText(item)) && /veterin/.test(serviceText(item)) && !/retorno|acompanhamento|cirurg|exame|analise/.test(serviceText(item)))
    || serviceRows.find((item) => /consulta/.test(serviceText(item)) && !/retorno|acompanhamento|cirurg|exame|analise/.test(serviceText(item)))
    || null

  const sellableProducts = productRows.filter((item) => {
    const text = productText(item)
    return !PRODUCT_SERVICE_SIGNAL.test(text) && Number(item.stock_quantity || 0) > 0
  })
  const feedProducts = sellableProducts.filter((item) => FEED_SIGNAL.test(productText(item)) && !FEED_EXCLUSION.test(productText(item)))
  const generalProducts = sellableProducts.filter((item) => !feedProducts.some((feed) => feed.id === item.id))

  const serviceIntents = SERVICE_INTENTS.map((intent) => ({
    ...intent,
    item: firstMatching(groomingServices, intent.matches),
  })).filter((intent) => intent.item)
  const productIntents = PRODUCT_INTENTS.map((intent) => ({
    ...intent,
    item: firstMatching(generalProducts, intent.matches),
  })).filter((intent) => intent.item)

  return {
    products: productRows,
    services: serviceRows,
    bathServices,
    groomingServices,
    consultationService,
    generalProducts,
    feedProducts,
    serviceIntents,
    productIntents,
  }
}

function cycle(rows, index) {
  if (!rows.length) return null
  return rows[index % rows.length]
}

function scenarioBase(category, index, title, extra = {}) {
  return {
    id: `${category}_${String(index + 1).padStart(2, '0')}`,
    category,
    category_label: CATEGORY_LABELS[category],
    index: index + 1,
    title,
    ...extra,
  }
}

function buildScenarioPlan(catalog) {
  assert(catalog.bathServices.length > 0, 'Nenhum serviço de banho ativo foi encontrado no catálogo.')
  assert(catalog.serviceIntents.length > 0, 'Nenhum serviço comum de tosa, hidratação ou cuidados foi encontrado no catálogo.')
  assert(catalog.productIntents.length > 0, 'Nenhuma categoria segura de produto geral com estoque foi encontrada.')
  assert(catalog.feedProducts.length > 0, 'Nenhuma ração ativa com estoque foi encontrada.')
  assert(catalog.consultationService, 'Nenhuma consulta veterinária ativa e inequívoca foi encontrada no catálogo.')

  const addServiceA = catalog.serviceIntents.find((intent) => intent.key === 'hidratacao') || catalog.serviceIntents[0]
  const addServiceB = catalog.serviceIntents.find((intent) => intent.key === 'escovacao_dental')
    || catalog.serviceIntents.find((intent) => intent.key !== addServiceA?.key)
    || addServiceA
  const addProductA = catalog.productIntents.find((intent) => intent.key === 'petisco') || catalog.productIntents[0]
  const addProductB = catalog.productIntents.find((intent) => intent.key === 'brinquedo')
    || catalog.productIntents.find((intent) => intent.key !== addProductA?.key)
    || addProductA

  const baths = Array.from({ length: 10 }, (_, index) => scenarioBase('banho', index, [
    'Banho direto com retirada na loja',
    'Banho com MotoDog e endereço',
    'Dados do pet em mensagens separadas',
    'Peso informado por último',
    'Pergunta sobre o que o banho inclui',
    'Alteração de horário antes da confirmação',
    'Observação sem perfume antes de confirmar',
    'Pergunta sobre MotoDog e escolha de levar à loja',
    'Inclusão de hidratação antes da confirmação',
    'Inclusão de outro cuidado antes da confirmação',
  ][index], {
    outcome: 'booking',
    order_type: 'banho_tosa',
    request_label: 'banho por porte e pelagem',
    add_service_intent: index === 8 ? addServiceA : index === 9 ? addServiceB : null,
    pre_confirmation_note: index === 6 ? 'sem perfume' : null,
    test_duplicate_confirmation: index === 0,
    variation: index,
  }))

  const services = Array.from({ length: 10 }, (_, index) => {
    const intent = cycle(catalog.serviceIntents, index)
    return scenarioBase('servicos', index, [
      'Serviço direto por intenção',
      'Serviço com observação simples',
      'Serviço com MotoDog',
      'Peso informado depois',
      'Pedido em linguagem natural',
      'Alteração de horário',
      'Confirmação curta',
      'Escolha de levar à loja',
      'Dados do pet em mensagens separadas',
      'Variação sem copiar o nome do catálogo',
    ][index], {
      outcome: 'booking',
      order_type: 'banho_tosa',
      service_intent: intent,
      service: intent.item,
      request_label: intent.label,
      test_duplicate_confirmation: index === 0,
      variation: index,
    })
  })

  const products = Array.from({ length: 10 }, (_, index) => {
    const intent = cycle(catalog.productIntents, index)
    const preferredAddition = index === 3 ? addProductA : index === 8 ? addProductB : null
    const additionIntent = preferredAddition && preferredAddition.item?.id !== intent.item?.id
      ? preferredAddition
      : [3, 8].includes(index)
        ? catalog.productIntents.find((candidate) => candidate.item?.id !== intent.item?.id) || null
        : null
    return scenarioBase('produtos', index, [
      'Produto com retirada',
      'Produto com entrega e Pix',
      'Produto com entrega e cartão',
      'Inclusão de segundo produto antes da confirmação',
      'Duas unidades com retirada',
      'Produto com entrega e dinheiro',
      'Pedido por categoria e característica',
      'Retirada com pagamento na loja',
      'Inclusão de outro produto antes da confirmação',
      'Endereço informado em uma frase',
    ][index], {
      outcome: 'product_order',
      order_type: 'produto',
      product_intent: intent,
      product: intent.item,
      request_phrase: productSemanticRequest(intent.item, intent),
      request_label: intent.label,
      add_product_intent: additionIntent,
      add_product: additionIntent?.item || null,
      test_duplicate_confirmation: index === 0,
      variation: index,
    })
  })

  const dogFeeds = catalog.feedProducts.filter((item) => !/gato/.test(productText(item)))
  const catFeeds = catalog.feedProducts.filter((item) => /gato/.test(productText(item)))
  const feeds = Array.from({ length: 10 }, (_, index) => {
    const preferred = index === 4 && catFeeds.length ? cycle(catFeeds, index) : cycle(dogFeeds.length ? dogFeeds : catalog.feedProducts, index)
    return scenarioBase('racao', index, [
      'Ração com retirada',
      'Ração com entrega',
      'Duas unidades de ração',
      'Ração para cachorro por perfil',
      'Ração para gato por perfil',
      'Ração com Pix',
      'Ração com cartão',
      'Ração com pagamento em dinheiro',
      'Pedido por espécie, idade e embalagem',
      'Ração com endereço completo',
    ][index], {
      outcome: 'product_order',
      order_type: 'produto',
      product: preferred,
      request_phrase: feedSemanticRequest(preferred),
      request_label: 'ração por espécie, idade, porte e embalagem',
      test_duplicate_confirmation: index === 0,
      variation: index,
    })
  })

  const veterinary = Array.from({ length: 10 }, (_, index) => scenarioBase('veterinaria', index, [
    'Pergunta de preço e agendamento',
    'Pergunta se existe consulta',
    'Vômitos e pergunta objetiva de preço',
    'Pedido de dose e aceite da consulta',
    'Pedido de diagnóstico e aceite da consulta',
    'Pedido de tratamento e aceite da consulta',
    'Sintoma com pedido direto de agendamento',
    'Emergência explícita',
    'Recusa da consulta e aceite do atendente',
    'Consulta comum com dados em mensagens separadas',
  ][index], {
    outcome: index === 7 ? 'emergency' : index === 8 ? 'human_handoff' : 'booking',
    order_type: 'veterinaria',
    service: catalog.consultationService,
    request_label: 'consulta veterinária',
    test_duplicate_confirmation: index === 0,
    variation: index,
  }))

  return [...baths, ...services, ...products, ...feeds, ...veterinary]
}

function publicScenario(scenario) {
  return {
    id: scenario.id,
    category: scenario.category,
    category_label: scenario.category_label,
    index: scenario.index,
    title: scenario.title,
    request_label: clean(scenario.request_label) || null,
    service_name: clean(scenario.service?.name) || null,
    product_name: clean(scenario.product?.name) || null,
    addition_name: clean(scenario.add_service_intent?.label || scenario.add_product_intent?.label) || null,
    expected_outcome: scenario.outcome,
  }
}

export async function getPetbotDiagnosticPlan({ tenantId }) {
  const started = Date.now()
  await loadSettings(tenantId)
  const catalog = await loadCatalog(tenantId)
  const scenarios = buildScenarioPlan(catalog)
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    total: scenarios.filter((scenario) => scenario.category === category).length,
  }))
  return {
    suite: 'petbot_diagnostic_50',
    version: SUITE_VERSION,
    generated_at: new Date().toISOString(),
    tenant_id: tenantId,
    total: scenarios.length,
    groups,
    scenarios: scenarios.map(publicScenario),
    catalog_summary: {
      baths: catalog.bathServices.length,
      services: catalog.groomingServices.length,
      service_intents: catalog.serviceIntents.length,
      products: catalog.generalProducts.length,
      product_intents: catalog.productIntents.length,
      feeds: catalog.feedProducts.length,
      veterinary_consultation: catalog.consultationService ? 1 : 0,
    },
    duration_ms: Date.now() - started,
  }
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

async function findSafeAppointmentSlots(settings, total = 1) {
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
    for (const period of periods) {
      const open = DateTime.fromFormat(`${date.toFormat('yyyy-MM-dd')} ${clean(period.open)}`, 'yyyy-MM-dd HH:mm', { zone })
      const close = DateTime.fromFormat(`${date.toFormat('yyyy-MM-dd')} ${clean(period.close)}`, 'yyyy-MM-dd HH:mm', { zone })
      if (!open.isValid || !close.isValid || close <= open) continue
      const preferredStart = date.set({ hour: 10, minute: 0 })
      const offsetMinutes = Math.max(0, preferredStart.diff(open, 'minutes').minutes)
      let candidate = open.plus({ minutes: ceilToInterval(offsetMinutes, interval) })
      while (candidate.plus({ minutes: 180 }) <= close && selected.length < total) {
        const candidateEnd = candidate.plus({ minutes: 180 })
        const respectsLead = candidate > now.plus({ minutes: lead + 30 })
        const separatedFromSelected = selected.every((slot) => Math.abs(slot.diff(candidate, 'hours').hours) >= 3)
        const isFree = !appointments.some((appointment) => appointmentOccupiesCandidate(appointment, candidate, candidateEnd))
        if (respectsLead && separatedFromSelected && isFree) selected.push(candidate)
        candidate = candidate.plus({ minutes: Math.max(interval, 180) })
      }
    }
  }
  assert(selected.length === total, `Não foram encontrados ${total} horários livres e isolados na agenda.`)
  return selected
}

function formatRequestedSlot(slot) {
  return `pode ser dia ${slot.toFormat('dd/MM/yyyy')} às ${slot.toFormat('HH:mm')}?`
}

function addressMessage() {
  return 'Rua Teste Automatizado 123, Centro, Muriaé, ao lado da escola'
}

function scenarioMessages(scenario, slots) {
  const slot = slots[0]
  const alternateSlot = slots[1] || slot
  const index = scenario.variation

  if (scenario.category === 'banho') {
    const common = {
      pet: ['Nina', 'Thor', 'Mel', 'Toby', 'Luna', 'Bob', 'Belinha', 'Fred', 'Maya', 'Pipoca'][index],
      breed: ['Yorkshire', 'Shih Tzu', 'Maltês', 'Poodle', 'Lhasa Apso', 'SRD', 'Yorkshire', 'Shih Tzu', 'Poodle', 'Maltês'][index],
      weight: [4, 8, 5, 7, 6, 9, 4, 8, 6, 5][index],
    }
    if (index === 0) return [`Olá, quero agendar um banho para ${common.pet}, minha ${common.breed} de ${common.weight} kg.`, formatRequestedSlot(slot), 'vou levar até a loja']
    if (index === 1) return [`Quero agendar um banho para ${common.pet}, ${common.breed}, ${common.weight} kg.`, formatRequestedSlot(slot), 'vocês conseguem buscar aqui?', 'buscar e levar', addressMessage()]
    if (index === 2) return ['Boa tarde, quero marcar um banho.', `o nome dela é ${common.pet}`, 'é cachorro', `a raça é ${common.breed}`, `ela tem ${common.weight} kg`, formatRequestedSlot(slot), 'vou levar']
    if (index === 3) return [`Quero banho para ${common.pet}, meu ${common.breed}.`, formatRequestedSlot(slot), 'vou levar', 'sem perfume', `ele tem ${common.weight} kg`]
    if (index === 4) return ['O banho inclui tosa higiênica?', `Então quero agendar um banho para ${common.pet}, ${common.breed}, ${common.weight} kg.`, formatRequestedSlot(slot), 'vou levar']
    if (index === 5) return [`Quero agendar banho para ${common.pet}, ${common.breed}, ${common.weight} kg.`, formatRequestedSlot(slot), `Antes de confirmar, prefiro ${alternateSlot.toFormat('dd/MM/yyyy')} às ${alternateSlot.toFormat('HH:mm')}.`, 'vou levar']
    if (index === 6) return [`Quero banho para ${common.pet}, ${common.breed}, ${common.weight} kg.`, formatRequestedSlot(slot), 'vou levar']
    if (index === 7) return [`Quero agendar banho para ${common.pet}, ${common.breed}, ${common.weight} kg.`, formatRequestedSlot(slot), 'tem como buscar aqui?', 'na verdade eu vou levar até a loja']
    return [`Quero agendar um banho para ${common.pet}, ${common.breed}, ${common.weight} kg.`, formatRequestedSlot(slot), 'vou levar']
  }

  if (scenario.category === 'servicos') {
    const pet = ['Bento', 'Lola', 'Zeca', 'Amora', 'Max', 'Cacau', 'Luke', 'Meg', 'Theo', 'Jade'][index]
    const breed = ['Shih Tzu', 'Yorkshire', 'Poodle', 'Maltês', 'Lhasa Apso', 'SRD', 'Shih Tzu', 'Yorkshire', 'Poodle', 'Maltês'][index]
    const weight = [6, 4, 7, 5, 8, 9, 6, 4, 7, 5][index]
    const request = clean(scenario.service_intent?.request) || 'um cuidado para o pelo'
    if (index === 2) return [`Quero agendar ${request} para ${pet}, ${breed}, ${weight} kg.`, formatRequestedSlot(slot), 'quero usar o MotoDog', 'somente buscar', addressMessage()]
    if (index === 3) return [`Quero marcar ${request} para ${pet}, meu ${breed}.`, formatRequestedSlot(slot), 'vou levar', `ele pesa ${weight} kg`]
    if (index === 5) return [`Quero agendar ${request} para ${pet}, ${breed}, ${weight} kg.`, formatRequestedSlot(slot), `prefiro mudar para ${alternateSlot.toFormat('dd/MM/yyyy')} às ${alternateSlot.toFormat('HH:mm')}`, 'vou levar']
    if (index === 8) return [`Quero marcar ${request}.`, `o pet é ${pet}`, 'é cachorro', `raça ${breed}`, `${weight} kg`, formatRequestedSlot(slot), 'vou levar']
    return [`Quero agendar ${request} para ${pet}, ${breed}, ${weight} kg.`, formatRequestedSlot(slot), 'vou levar', ...(index === 1 ? ['faça com bastante cuidado'] : [])]
  }

  if (scenario.category === 'produtos' || scenario.category === 'racao') {
    const requestedQuantity = [1, 1, 2, 1, 2, 1, 1, 1, 1, 1][index]
    const availableUnits = Math.max(1, Math.floor(Number(scenario.product?.stock_quantity || 1)))
    const quantity = Math.min(requestedQuantity, availableUnits)
    const opening = `${scenario.request_phrase}. Quero ${quantity} unidade${quantity > 1 ? 's' : ''}.`
    if ([1, 2, 5, 9].includes(index)) {
      const payment = index === 1 ? 'vou pagar por Pix' : index === 2 ? 'vou pagar no cartão' : index === 5 ? 'vou pagar em dinheiro e não preciso de troco' : 'Pix'
      return [opening, 'quero entrega', addressMessage(), payment]
    }
    return [opening, 'vou retirar na loja']
  }

  if (scenario.category === 'veterinaria') {
    if (index === 7) return ['Meu cachorro está inconsciente e com dificuldade para respirar.']
    if (index === 8) return ['Qual remédio posso dar para meu cachorro?', 'não quero consulta', 'sim, pode chamar um atendente']
    const slotMessage = formatRequestedSlot(slot)
    if (index === 0) return ['Quanto custa a consulta veterinária de vocês?', 'sim, quero agendar', 'é para o Bob, um cachorro sem raça definida de 9 kg', slotMessage, 'vou levar']
    if (index === 1) return ['Vocês têm consulta veterinária?', 'sim, pode marcar', 'é para a Nina, uma Yorkshire de 4 kg', slotMessage, 'vou levar']
    if (index === 2) return ['Meu cachorro está vomitando bastante, quanto é a consulta veterinária?', 'sim, quero agendar o quanto antes', 'o nome dele é Thor, Shih Tzu, 8 kg', slotMessage, 'vou levar']
    if (index === 3) return ['Qual dose de dipirona posso dar para meu cachorro?', 'sim, quero marcar a consulta', 'é para o Bob, cachorro sem raça definida, 9 kg', slotMessage, 'vou levar']
    if (index === 4) return ['Meu cachorro está coçando muito, o que ele tem?', 'sim, quero agendar uma consulta', 'o nome dele é Fred, Shih Tzu, 8 kg', slotMessage, 'vou levar']
    if (index === 5) return ['Que tratamento eu faço para meu cachorro que está sem comer?', 'sim, quero marcar uma consulta', 'o nome dela é Mel, Maltês, 5 kg', slotMessage, 'vou levar']
    if (index === 6) return ['Minha cachorra está com dor e quero agendar uma consulta veterinária.', 'o nome dela é Luna, Lhasa Apso, 6 kg', slotMessage, 'vou levar']
    return ['Quero agendar uma consulta veterinária.', 'o pet é a Jade', 'é uma gata sem raça definida, 4 kg', 'ela está sem comer desde ontem, mas está consciente e respirando normalmente', slotMessage, 'vou levar']
  }

  return []
}

async function createTestSession({ tenantId, suiteId, scenario, phone }) {
  const existingClients = await requireResult(
    adminSupabase
      .from('clients')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('module_id', MODULE_ID)
      .eq('phone', phone),
    `Falha ao verificar o telefone fictício de ${scenario.id}`,
  )
  assert(existingClients.length === 0, `O telefone fictício de ${scenario.id} já existe.`)

  return requireResult(
    adminSupabase
      .from('chat_sessions')
      .insert({
        tenant_id: tenantId,
        module_id: MODULE_ID,
        customer_phone: phone,
        customer_name: `Teste ${scenario.category_label} ${scenario.index}`,
        status: 'bot',
        channel: 'whatsapp',
        intent: 'geral',
        context: {
          e2e_test: {
            marker: suiteId,
            scenario: scenario.id,
            suite_version: SUITE_VERSION,
          },
        },
        external_id: `${suiteId}:${scenario.id}`,
      })
      .select('id,tenant_id,module_id,customer_phone,customer_name,status,client_id,context')
      .single(),
    `Falha ao criar a conversa ${scenario.id}`,
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

async function sendTurn({ scenario, sessionId, message, suiteId, transcript }) {
  const startedAt = Date.now()
  const result = await respondToChatMessage(adminSupabase, sessionId, message, {
    source: 'diagnostic_suite_fast',
    userMetadata: { e2e_marker: suiteId, e2e_scenario: scenario.id, fast_mode: true },
    assistantMetadata: { e2e_marker: suiteId, e2e_scenario: scenario.id, fast_mode: true },
  })
  const reply = clean(result.reply)
  transcript.push({
    role: 'turn',
    customer: message,
    assistant: reply,
    duration_ms: Date.now() - startedAt,
  })
  return loadSession(sessionId)
}

function stateFingerprint(session) {
  const facts = extractFacts(session?.context)
  const agent = extractAgentContext(session?.context)
  return JSON.stringify({
    pet_name: facts.pet_name || '',
    species: facts.species || '',
    breed: facts.breed || '',
    weight_kg: facts.weight_kg || null,
    service_type: facts.service_type || '',
    service_date: facts.service_date || '',
    service_time: facts.service_preferred_time || facts.service_time_preference || '',
    service_transport_mode: facts.service_transport_mode || '',
    service_transport_address: facts.service_transport_address || '',
    service_notes: facts.service_notes || '',
    fulfillment_type: facts.fulfillment_type || '',
    payment_method: facts.payment_method || '',
    delivery_address: facts.delivery_address || '',
    pending_id: agent.pending_order?.id || '',
    status: session?.status || '',
    intent: session?.intent || '',
  })
}

function isUnavailableReply(reply) {
  return /nao (?:encontrei|consegui|temos)|não (?:encontrei|consegui|temos)|indisponivel|indisponível|revise o catalogo|revise o catálogo|servico nao esta disponivel|serviço não está disponível|produto nao esta disponivel|produto não está disponível/i.test(clean(reply))
}

function isRepeatedReply(transcript) {
  if (transcript.length < 2) return false
  const last = normalize(transcript.at(-1)?.assistant)
  const previous = normalize(transcript.at(-2)?.assistant)
  return Boolean(last && previous && last === previous)
}

function assistantRequestsSimpleConfirmation(reply) {
  return /(?:confirma|posso adicionar|deseja adicionar|quer adicionar|pode incluir|você quer incluir|voce quer incluir)/i.test(clean(reply))
}

function nextServiceSupplement(scenario, session, slot) {
  const facts = extractFacts(session.context)
  if (!clean(facts.pet_name)) return 'o nome do pet é Teste'
  if (!clean(facts.species)) return 'é cachorro'
  if (!clean(facts.breed) && !clean(facts.size)) return 'é sem raça definida e porte pequeno'
  if (!(Number(facts.weight_kg || 0) > 0)) return 'ele pesa 7 kg'
  if (!clean(facts.service_date) || !clean(facts.service_preferred_time || facts.service_time_preference)) return formatRequestedSlot(slot)
  if (!clean(facts.service_type)) {
    if (scenario.category === 'servicos') return `quero ${clean(scenario.service_intent?.request) || 'o serviço de cuidados'}`
    if (scenario.category === 'veterinaria') return 'quero agendar a consulta veterinária'
    return 'quero agendar o banho'
  }
  if (!clean(facts.service_transport_mode)) return 'vou levar até a loja'
  if (normalize(facts.service_transport_mode) === 'motodog') return 'buscar e levar'
  if (/buscar|levar/.test(normalize(facts.service_transport_mode)) && !clean(facts.service_transport_address)) return addressMessage()
  if (!facts.service_notes_resolved) return scenario.category === 'veterinaria' ? 'é uma avaliação geral' : 'sem observações'
  return null
}

function nextProductSupplement(scenario, session) {
  const facts = extractAgentContext(session.context).product_facts || {}
  if (!clean(facts.fulfillment_type)) return [1, 2, 5, 9].includes(scenario.variation) ? 'quero entrega' : 'vou retirar na loja'
  if (clean(facts.fulfillment_type) === 'entrega') {
    if (!clean(facts.delivery_address)) return addressMessage()
    if (!clean(facts.payment_method)) return scenario.variation === 2 ? 'cartão' : scenario.variation === 5 ? 'dinheiro, sem troco' : 'Pix'
  }
  if (!(Number(facts.quantity || 0) > 0)) return `quero ${scenario.variation === 4 ? 2 : 1} unidade`
  return null
}

function pendingOrderText(pending) {
  return normalize((pending?.order?.items || []).map((item) => `${item.name || ''} ${item.description || ''}`).join(' '))
}


function pendingMatchesIntent(pending, intent) {
  if (!intent?.matches) return false
  return intent.matches({ name: pendingOrderText(pending), category: '', description: '' })
}

function feedSemanticMatch(pending, target) {
  const pendingText = pendingOrderText(pending)
  const targetText = productText(target)
  const brand = normalize(extractBrand(target?.name))
  const pack = normalize(extractPackageLabel(target?.name))
  const speciesSignal = /gato/.test(targetText)
    ? /gato/.test(pendingText)
    : /cachorro|cao|caes/.test(targetText)
      ? /cachorro|cao|caes/.test(pendingText)
      : ''
  const signals = [
    brand && pendingText.includes(brand),
    pack && pendingText.includes(pack),
    speciesSignal,
  ].filter((value) => value !== '')
  return FEED_SIGNAL.test(pendingText) && signals.filter(Boolean).length >= Math.min(2, signals.length)
}

function assertRequestedItemResolved(scenario, pending) {
  if (scenario.category === 'banho') return
  if (scenario.category === 'servicos') {
    assert(pendingMatchesIntent(pending, scenario.service_intent), `${scenario.id}: o resumo não corresponde à intenção de serviço solicitada.`)
  }
  if (scenario.category === 'veterinaria') {
    assert(/consulta|veterin/.test(pendingOrderText(pending)), `${scenario.id}: o resumo não corresponde a uma consulta veterinária.`)
  }
  if (scenario.category === 'produtos') {
    assert(pendingMatchesIntent(pending, scenario.product_intent), `${scenario.id}: o resumo não corresponde à categoria de produto solicitada.`)
  }
  if (scenario.category === 'racao') {
    assert(feedSemanticMatch(pending, scenario.product), `${scenario.id}: o resumo não corresponde ao perfil de ração solicitado.`)
  }
}

async function reachPendingOrder({ scenario, session, suiteId, transcript, slots }) {
  let current = session
  const messages = scenarioMessages(scenario, slots)
  for (const message of messages) {
    if (extractPendingOrder(current.context) && !scenario.pre_confirmation_note && !scenario.add_service_intent && !scenario.add_product_intent) break
    const before = stateFingerprint(current)
    current = await sendTurn({ scenario, sessionId: session.id, message, suiteId, transcript })
    if (scenario.outcome === 'emergency' || scenario.outcome === 'human_handoff') continue
    if (extractPendingOrder(current.context)) break
    if (isUnavailableReply(transcript.at(-1)?.assistant)) {
      throw new Error(`${scenario.id}: o catálogo não resolveu a solicitação semântica. Última resposta: ${compact(transcript.at(-1)?.assistant, 240)}`)
    }
    if (isRepeatedReply(transcript)) {
      throw new Error(`${scenario.id}: a Luna repetiu a mesma resposta; o cenário foi encerrado para não gastar créditos.`)
    }
    const after = stateFingerprint(current)
    if (before === after && transcript.length >= 2 && normalize(transcript.at(-1)?.assistant) === normalize(transcript.at(-2)?.assistant)) break
  }

  if (scenario.outcome === 'emergency' || scenario.outcome === 'human_handoff') return { session: current, pending: null }

  const sentSupplements = new Set(messages.map(normalize))
  for (let attempt = 0; attempt < 2 && !extractPendingOrder(current.context); attempt += 1) {
    const supplement = scenario.order_type === 'produto'
      ? nextProductSupplement(scenario, current)
      : nextServiceSupplement(scenario, current, slots[0])
    if (!supplement || sentSupplements.has(normalize(supplement))) break
    sentSupplements.add(normalize(supplement))
    const before = stateFingerprint(current)
    current = await sendTurn({ scenario, sessionId: session.id, message: supplement, suiteId, transcript })
    if (extractPendingOrder(current.context)) break
    if (isUnavailableReply(transcript.at(-1)?.assistant) || isRepeatedReply(transcript) || before === stateFingerprint(current)) break
  }

  let pending = extractPendingOrder(current.context)
  assert(pending, `${scenario.id}: o chat não chegou ao resumo final após ${transcript.length} mensagens; nenhuma frase foi repetida automaticamente.`)
  assert(clean(pending.order.order_type) === scenario.order_type,
    `${scenario.id}: tipo preparado incorreto (${clean(pending.order.order_type) || 'vazio'}).`)
  assertRequestedItemResolved(scenario, pending)

  if (scenario.pre_confirmation_note) {
    current = await sendTurn({
      scenario,
      sessionId: session.id,
      message: `Antes de confirmar, deixe ${scenario.pre_confirmation_note}.`,
      suiteId,
      transcript,
    })
    pending = extractPendingOrder(current.context)
    assert(pending, `${scenario.id}: a observação removeu o pedido pendente antes da confirmação.`)
    const facts = extractFacts(current.context)
    assert(normalize(facts.service_notes).includes(normalize(scenario.pre_confirmation_note)), `${scenario.id}: a observação não ficou salva na memória.`)
  }

  const additionIntent = scenario.add_service_intent || scenario.add_product_intent
  const additionItem = scenario.add_service_intent?.item || scenario.add_product_intent?.item
  if (additionIntent && additionItem) {
    const naturalRequest = scenario.add_service_intent
      ? `Antes de confirmar, pode acrescentar ${additionIntent.request}?`
      : `Antes de confirmar, acrescente também ${productSemanticRequest(additionItem, additionIntent)}.`
    current = await sendTurn({ scenario, sessionId: session.id, message: naturalRequest, suiteId, transcript })
    pending = extractPendingOrder(current.context)
    let additionResolved = scenario.add_service_intent
      ? pendingMatchesIntent(pending, scenario.add_service_intent)
      : pendingMatchesIntent(pending, scenario.add_product_intent)

    if ((!pending || !additionResolved) && assistantRequestsSimpleConfirmation(transcript.at(-1)?.assistant) && !isUnavailableReply(transcript.at(-1)?.assistant)) {
      current = await sendTurn({ scenario, sessionId: session.id, message: 'sim, pode acrescentar', suiteId, transcript })
      pending = extractPendingOrder(current.context)
      additionResolved = scenario.add_service_intent
        ? pendingMatchesIntent(pending, scenario.add_service_intent)
        : pendingMatchesIntent(pending, scenario.add_product_intent)
    }

    assert(!isUnavailableReply(transcript.at(-1)?.assistant), `${scenario.id}: o adicional semântico não está disponível no catálogo.`)
    assert(pending && additionResolved, `${scenario.id}: o adicional não apareceu no resumo após no máximo duas mensagens.`)
  }

  return { session: current, pending }
}

async function countArtifacts(session) {
  const [sales, orders, appointments, commits] = await Promise.all([
    requireResult(adminSupabase.from('sales').select('id').eq('tenant_id', session.tenant_id).eq('module_id', MODULE_ID).eq('customer_phone', session.customer_phone), 'Falha ao contar vendas'),
    requireResult(adminSupabase.from('service_delivery_orders').select('id').eq('tenant_id', session.tenant_id).eq('module_id', MODULE_ID).eq('session_id', session.id), 'Falha ao contar ordens'),
    requireResult(adminSupabase.from('appointments').select('id').eq('tenant_id', session.tenant_id).eq('module_id', MODULE_ID).eq('customer_phone', session.customer_phone), 'Falha ao contar agendamentos'),
    requireResult(adminSupabase.from('petbot_order_commits').select('idempotency_key').eq('tenant_id', session.tenant_id).eq('session_id', session.id), 'Falha ao contar commits'),
  ])
  return { sales: sales.length, orders: orders.length, appointments: appointments.length, commits: commits.length }
}

async function verifyCommittedRows({ scenario, session, pending }) {
  const context = session.context || {}
  const saleId = clean(context.last_sale_id)
  const orderId = clean(context.last_order_id)
  const appointmentId = clean(context.last_appointment_id)
  assert(saleId && orderId, `${scenario.id}: venda ou ordem não foi gravada no contexto.`)
  if (scenario.order_type !== 'produto') assert(appointmentId, `${scenario.id}: agendamento não foi gravado no contexto.`)
  assert(extractAgentContext(context).order_saved === true, `${scenario.id}: order_saved não ficou verdadeiro.`)
  assert(!extractPendingOrder(context), `${scenario.id}: o pedido continuou pendente depois da confirmação.`)

  const [sale, order, appointmentRows, commits] = await Promise.all([
    requireResult(adminSupabase.from('sales').select('id,total_price,status,payment_status,source,fulfillment_type,notes').eq('id', saleId).single(), `${scenario.id}: venda ausente`),
    requireResult(adminSupabase.from('service_delivery_orders').select('id,sale_id,session_id,source,order_type,status,scheduled_for,payment_status,notes').eq('id', orderId).single(), `${scenario.id}: ordem ausente`),
    appointmentId
      ? requireResult(adminSupabase.from('appointments').select('id,pet_id,service_type,scheduled_at,price,status,source,notes').eq('id', appointmentId), `${scenario.id}: agenda ausente`)
      : [],
    requireResult(adminSupabase.from('petbot_order_commits').select('idempotency_key,status,result').eq('tenant_id', session.tenant_id).eq('session_id', session.id), `${scenario.id}: commit ausente`),
  ])
  const appointment = appointmentRows[0] || null
  assert(commits.length === 1 && commits[0].status === 'completed', `${scenario.id}: confirmação idempotente inválida.`)
  assert(order.sale_id === saleId && order.session_id === session.id, `${scenario.id}: ordem não está ligada à venda e conversa.`)
  assert(Number(sale.total_price) === Number(pending.order.total), `${scenario.id}: total salvo diverge do resumo.`)
  if (scenario.order_type === 'produto') {
    assert(!appointment, `${scenario.id}: compra de produto criou agendamento indevido.`)
    assert(order.order_type === 'produto', `${scenario.id}: ordem de produto foi salva com tipo incorreto.`)
  } else {
    assert(appointment, `${scenario.id}: agendamento não foi encontrado.`)
    assert(order.order_type === 'servico', `${scenario.id}: serviço foi salvo com tipo operacional incorreto.`)
    assert(appointment.status === 'agendado' && appointment.source === 'whatsapp', `${scenario.id}: agenda não recebeu o atendimento corretamente.`)
    assert(sameInstant(order.scheduled_for, appointment.scheduled_at), `${scenario.id}: ordem e agenda têm horários diferentes.`)
  }
  return { sale, order, appointment, commit: commits[0] }
}

async function runBookingScenario({ scenario, session, suiteId, transcript, slots }) {
  const { pending } = await reachPendingOrder({ scenario, session, suiteId, transcript, slots })
  let finalSession = await sendTurn({ scenario, sessionId: session.id, message: 'sim, confirmo', suiteId, transcript })
  const rows = await verifyCommittedRows({ scenario, session: finalSession, pending })
  let counts = await countArtifacts(finalSession)
  let duplicateConfirmationSafe = null

  // Uma confirmação duplicada por categoria é suficiente para validar idempotência
  // sem gastar uma chamada adicional de LLM em todos os 50 cenários.
  if (scenario.test_duplicate_confirmation) {
    const beforeDuplicate = counts
    finalSession = await sendTurn({ scenario, sessionId: session.id, message: 'sim, confirmo novamente', suiteId, transcript })
    counts = await countArtifacts(finalSession)
    assert(JSON.stringify(beforeDuplicate) === JSON.stringify(counts), `${scenario.id}: a confirmação repetida criou duplicidade.`)
    duplicateConfirmationSafe = true
  }

  return {
    session: finalSession,
    pending,
    rows,
    counts,
    assertions: {
      pending_order_created: true,
      persisted: true,
      duplicate_confirmation_tested: Boolean(scenario.test_duplicate_confirmation),
      duplicate_confirmation_safe: duplicateConfirmationSafe,
    },
  }
}

async function runNonBookingVeterinaryScenario({ scenario, session, suiteId, transcript, slots }) {
  const { session: finalSession } = await reachPendingOrder({ scenario, session, suiteId, transcript, slots })
  const combinedReplies = normalize(transcript.map((turn) => turn.assistant).join(' '))
  if (scenario.outcome === 'emergency') {
    assert(/emerg|imediat|urgente|veterin/.test(combinedReplies), `${scenario.id}: a emergência não recebeu orientação imediata.`)
    assert(!extractPendingOrder(finalSession.context), `${scenario.id}: emergência criou resumo de agendamento indevido.`)
  } else {
    assert(finalSession.status === 'human' || /atendente|transfer/.test(combinedReplies), `${scenario.id}: a recusa não chegou ao atendimento humano.`)
  }
  const counts = await countArtifacts(finalSession)
  assert(counts.sales === 0 && counts.orders === 0 && counts.appointments === 0, `${scenario.id}: fluxo sem confirmação criou registros indevidos.`)
  return {
    session: finalSession,
    pending: null,
    rows: null,
    counts,
    assertions: {
      safe_veterinary_response: true,
      no_unconfirmed_records: true,
      handoff_or_emergency_guidance: true,
    },
  }
}

async function deleteExactRows(table, column, ids, label) {
  const uniqueIds = [...new Set(ids.filter(Boolean))]
  if (!uniqueIds.length) return 0
  const deleted = await requireResult(adminSupabase.from(table).delete().in(column, uniqueIds).select(column), label)
  return deleted.length
}

async function cleanupCase({ tenantId, sessionId, phone, known = {}, productSnapshots = [] }) {
  const sessions = sessionId
    ? await requireResult(adminSupabase.from('chat_sessions').select('id,client_id,context').eq('tenant_id', tenantId).eq('id', sessionId), 'Falha ao localizar sessão para limpeza')
    : []
  const orders = sessionId
    ? await requireResult(adminSupabase.from('service_delivery_orders').select('id,sale_id').eq('tenant_id', tenantId).eq('session_id', sessionId), 'Falha ao localizar ordem para limpeza')
    : []
  const sales = phone
    ? await requireResult(adminSupabase.from('sales').select('id').eq('tenant_id', tenantId).eq('module_id', MODULE_ID).eq('customer_phone', phone), 'Falha ao localizar venda para limpeza')
    : []
  const appointments = phone
    ? await requireResult(adminSupabase.from('appointments').select('id,pet_id').eq('tenant_id', tenantId).eq('module_id', MODULE_ID).eq('customer_phone', phone), 'Falha ao localizar agenda para limpeza')
    : []
  const clients = phone
    ? await requireResult(adminSupabase.from('clients').select('id').eq('tenant_id', tenantId).eq('module_id', MODULE_ID).eq('phone', phone), 'Falha ao localizar cliente para limpeza')
    : []
  const contexts = sessions.map((row) => row.context || {})
  const saleIds = [known.sale_id, ...sales.map((row) => row.id), ...orders.map((row) => row.sale_id), ...contexts.map((row) => row.last_sale_id)]
  const orderIds = [known.order_id, ...orders.map((row) => row.id), ...contexts.map((row) => row.last_order_id)]
  const appointmentIds = [known.appointment_id, ...appointments.map((row) => row.id), ...contexts.map((row) => row.last_appointment_id)]
  const clientIds = [known.client_id, ...clients.map((row) => row.id), ...sessions.map((row) => row.client_id)]
  const petIds = [known.pet_id, ...appointments.map((row) => row.pet_id)]
  const sessionIds = sessionId ? [sessionId] : []
  const report = {}
  report.events = await deleteExactRows('petbot_events', 'session_id', sessionIds, 'Falha ao apagar eventos')
  report.orders = await deleteExactRows('service_delivery_orders', 'id', orderIds, 'Falha ao apagar ordens')
  report.appointments = await deleteExactRows('appointments', 'id', appointmentIds, 'Falha ao apagar agenda')
  report.stock_movements = await deleteExactRows('stock_movements', 'sale_id', saleIds, 'Falha ao apagar movimentos')
  report.sale_items = await deleteExactRows('sale_items', 'sale_id', saleIds, 'Falha ao apagar itens')
  report.sales = await deleteExactRows('sales', 'id', saleIds, 'Falha ao apagar vendas')
  report.stock_restored = 0
  for (const snapshot of productSnapshots) {
    const { error } = await adminSupabase
      .from('products')
      .update({ stock_quantity: snapshot.stock_quantity })
      .eq('tenant_id', tenantId)
      .eq('module_id', MODULE_ID)
      .eq('id', snapshot.id)
    if (error) throw new Error(`Falha ao restaurar estoque de ${snapshot.name}: ${error.message}`)
    report.stock_restored += 1
  }
  report.commits = await deleteExactRows('petbot_order_commits', 'session_id', sessionIds, 'Falha ao apagar commits')
  report.messages = await deleteExactRows('chat_messages', 'session_id', sessionIds, 'Falha ao apagar mensagens')
  report.sessions = await deleteExactRows('chat_sessions', 'id', sessionIds, 'Falha ao apagar sessão')
  report.pets = await deleteExactRows('pets', 'id', petIds, 'Falha ao apagar pets')
  report.clients = await deleteExactRows('clients', 'id', clientIds, 'Falha ao apagar clientes')

  const [remainingSessions, remainingOrders, remainingSales, remainingAppointments, remainingClients] = await Promise.all([
    sessionId ? requireResult(adminSupabase.from('chat_sessions').select('id').eq('id', sessionId), 'Auditoria de sessão') : [],
    sessionId ? requireResult(adminSupabase.from('service_delivery_orders').select('id').eq('session_id', sessionId), 'Auditoria de ordem') : [],
    phone ? requireResult(adminSupabase.from('sales').select('id').eq('tenant_id', tenantId).eq('customer_phone', phone), 'Auditoria de venda') : [],
    phone ? requireResult(adminSupabase.from('appointments').select('id').eq('tenant_id', tenantId).eq('customer_phone', phone), 'Auditoria de agenda') : [],
    phone ? requireResult(adminSupabase.from('clients').select('id').eq('tenant_id', tenantId).eq('phone', phone), 'Auditoria de cliente') : [],
  ])
  report.remaining = {
    sessions: remainingSessions.length,
    orders: remainingOrders.length,
    sales: remainingSales.length,
    appointments: remainingAppointments.length,
    clients: remainingClients.length,
  }
  assert(Object.values(report.remaining).every((count) => Number(count) === 0), `A limpeza deixou artefatos: ${JSON.stringify(report.remaining)}.`)
  return report
}

export async function runPetbotDiagnosticCase({ tenantId, scenarioId, suiteId = '' }) {
  const startedAt = Date.now()
  const settings = await loadSettings(tenantId)
  const catalog = await loadCatalog(tenantId)
  const scenarios = buildScenarioPlan(catalog)
  const scenario = scenarios.find((item) => item.id === scenarioId)
  assert(scenario, `Cenário desconhecido: ${scenarioId}`)
  const marker = clean(suiteId) || `PETBOT_DIAGNOSTIC_${Date.now()}`
  const phone = `5598${String(Date.now()).slice(-8)}${String(scenario.index).padStart(2, '0')}`
  const transcript = []
  const slots = scenario.order_type === 'produto' || ['emergency', 'human_handoff'].includes(scenario.outcome)
    ? []
    : await findSafeAppointmentSlots(settings, scenario.variation === 5 ? 2 : 1)
  const productIds = [...new Set([scenario.product?.id, scenario.add_product?.id].filter(Boolean))]
  const productSnapshots = productIds.length
    ? await requireResult(
      adminSupabase
        .from('products')
        .select('id,name,stock_quantity')
        .eq('tenant_id', tenantId)
        .eq('module_id', MODULE_ID)
        .in('id', productIds),
      'Não foi possível registrar o estoque antes do teste',
    )
    : []
  let session = null
  let execution = null
  let error = null
  let cleanup = null
  let cleanupError = null

  try {
    session = await createTestSession({ tenantId, suiteId: marker, scenario, phone })
    execution = ['emergency', 'human_handoff'].includes(scenario.outcome)
      ? await runNonBookingVeterinaryScenario({ scenario, session, suiteId: marker, transcript, slots })
      : await runBookingScenario({ scenario, session, suiteId: marker, transcript, slots })
    session = execution.session
  } catch (caught) {
    error = caught instanceof Error ? caught : new Error(String(caught))
    if (session?.id) {
      try { session = await loadSession(session.id) } catch { /* preserve partial report */ }
    }
  } finally {
    const known = {
      sale_id: clean(session?.context?.last_sale_id || execution?.rows?.sale?.id),
      order_id: clean(session?.context?.last_order_id || execution?.rows?.order?.id),
      appointment_id: clean(session?.context?.last_appointment_id || execution?.rows?.appointment?.id),
      client_id: clean(session?.client_id),
      pet_id: clean(execution?.rows?.appointment?.pet_id),
    }
    try {
      cleanup = await cleanupCase({ tenantId, sessionId: session?.id, phone, known, productSnapshots })
    } catch (caught) {
      cleanupError = caught instanceof Error ? caught : new Error(String(caught))
    }
  }

  const facts = session?.context ? extractFacts(session.context) : {}
  const agent = session?.context ? extractAgentContext(session.context) : {}
  const success = !error && !cleanupError && Object.values(cleanup?.remaining || {}).every((value) => Number(value) === 0)
  return {
    success,
    suite: 'petbot_diagnostic_50',
    version: SUITE_VERSION,
    suite_id: marker,
    scenario: publicScenario(scenario),
    started_at: new Date(startedAt).toISOString(),
    finished_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    error: error?.message || null,
    cleanup_error: cleanupError?.message || null,
    transcript,
    memory: {
      facts,
      last_turn_semantics: agent.last_turn_semantics || null,
      pending_order: extractPendingOrder(session?.context) ? {
        id: extractPendingOrder(session.context).id,
        order_type: extractPendingOrder(session.context).order?.order_type,
        total: extractPendingOrder(session.context).order?.total,
      } : null,
      session_status: session?.status || null,
      intent: session?.intent || null,
    },
    evidence: execution ? {
      counts_before_cleanup: execution.counts,
      assertions: execution.assertions,
      sale_id: execution.rows?.sale?.id || null,
      order_id: execution.rows?.order?.id || null,
      appointment_id: execution.rows?.appointment?.id || null,
      service_type: execution.rows?.appointment?.service_type || execution.pending?.order?.service_type || null,
      total: execution.rows?.sale?.total_price || execution.pending?.order?.total || null,
    } : null,
    cleanup,
  }
}

export function summarizeDiagnosticResults(results = []) {
  const rows = Array.isArray(results) ? results : []
  const categories = CATEGORY_ORDER.map((category) => {
    const categoryRows = rows.filter((row) => row?.scenario?.category === category)
    const passed = categoryRows.filter((row) => row.success).length
    return {
      category,
      label: CATEGORY_LABELS[category],
      total: categoryRows.length,
      passed,
      failed: categoryRows.length - passed,
      pass_rate: categoryRows.length ? Math.round((passed / categoryRows.length) * 1000) / 10 : 0,
      average_duration_ms: categoryRows.length
        ? Math.round(categoryRows.reduce((sum, row) => sum + Number(row.duration_ms || 0), 0) / categoryRows.length)
        : 0,
    }
  })
  const passed = rows.filter((row) => row.success).length
  return {
    total: rows.length,
    passed,
    failed: rows.length - passed,
    pass_rate: rows.length ? Math.round((passed / rows.length) * 1000) / 10 : 0,
    average_duration_ms: rows.length
      ? Math.round(rows.reduce((sum, row) => sum + Number(row.duration_ms || 0), 0) / rows.length)
      : 0,
    categories,
  }
}
