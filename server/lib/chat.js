import { HttpError } from './http.js'
import { serverEnv } from './env.js'
import { logger } from './logger.js'

const SUPPORTED_MODULES = new Set(['petshop'])
const PRODUCT_CONTEXT_LIMIT = 18
const PRODUCT_STOP_WORDS = new Set([
  'aqui',
  'algum',
  'alguma',
  'alguns',
  'algumas',
  'comprar',
  'disponivel',
  'disponiveis',
  'gostaria',
  'para',
  'pode',
  'produto',
  'produtos',
  'queria',
  'quero',
  'qual',
  'quais',
  'tem',
  'tenho',
  'vcs',
  'voces',
])

const DEFAULT_BOT_MODEL = serverEnv.openAiModel
const DEFAULT_BOT_TEMPERATURE = 0.2
const DEFAULT_DELIVERY_FEE = 10
const AVAILABLE_STATUSES = new Set(['available', 'livre', 'disponivel', 'aberto', 'open'])
const BUSY_STATUSES = new Set(['agendado', 'confirmado', 'em_andamento', 'booked', 'ocupado', 'blocked', 'bloqueado'])

const PETBOT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'update_customer_profile',
      description: 'Atualiza o cadastro do cliente/pet quando o cliente informou dados novos na conversa.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          customer_name: { type: 'string' },
          pet_name: { type: 'string' },
          species: { type: 'string', enum: ['dog', 'cat', 'other', ''] },
          size: { type: 'string' },
          breed: { type: 'string' },
          symptom: { type: 'string' },
          address: { type: 'string' },
          neighborhood: { type: 'string' },
          city: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_confirmed_petshop_order',
      description: 'Registra venda, ordem operacional e/ou agendamento somente depois do cliente confirmar o resumo final.',
      parameters: {
        type: 'object',
        required: ['customer_name', 'order_type', 'items', 'total', 'payment_method', 'fulfillment_type'],
        additionalProperties: false,
        properties: {
          customer_name: { type: 'string' },
          pet_name: { type: 'string' },
          species: { type: 'string' },
          size: { type: 'string' },
          order_type: { type: 'string', enum: ['produto', 'banho_tosa', 'veterinaria'] },
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'quantity', 'unit_price'],
              additionalProperties: false,
              properties: {
                product_id: { type: 'string' },
                name: { type: 'string' },
                quantity: { type: 'number' },
                unit_price: { type: 'number' },
                upsell: { type: 'boolean' },
              },
            },
          },
          service_type: { type: 'string' },
          scheduled_at: { type: 'string' },
          total: { type: 'number' },
          payment_method: { type: 'string', enum: ['pix', 'dinheiro', 'cartao'] },
          change_for: { type: 'number' },
          fulfillment_type: { type: 'string', enum: ['entrega', 'retirada', 'servico'] },
          delivery_address: { type: 'string' },
          delivery_neighborhood: { type: 'string' },
          delivery_city: { type: 'string' },
          delivery_reference: { type: 'string' },
          notes: { type: 'string' },
        },
      },
    },
  },
]

function detectIntent(message = '') {
  const lower = normalizeSearchText(message)

  if (/racao|petisc|brinquedo|shampoo|coleira|comprar|preco|estoque|tem |tem\?|voces tem/i.test(lower)) {
    return 'produto'
  }

  if (/banho|tosa|vet(erinario|erinaria)?|agend|consult|vacina/i.test(lower)) {
    return 'servico'
  }

  return 'duvida'
}

function normalizeSearchText(value = '') {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function normalizePhone(value = '') {
  return String(value || '').replace(/\D/g, '')
}

function cleanText(value = '') {
  return String(value || '').trim()
}

function isPlaceholderName(value = '') {
  const name = cleanText(value).toLowerCase()
  return !name || ['cliente', 'cliente whatsapp', 'whatsapp', 'sem nome'].includes(name) || /^cliente[-\s]?\d+/i.test(name)
}

function normalizeSpecies(value = '') {
  const lower = cleanText(value).toLowerCase()
  if (lower.includes('cach') || lower.includes('dog')) return 'dog'
  if (lower.includes('gat') || lower.includes('cat')) return 'cat'
  return lower || ''
}

function buildSearchTerms(message = '') {
  return normalizeSearchText(message)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !PRODUCT_STOP_WORDS.has(term))
    .slice(0, 6)
}

function isMissingTenantColumnError(error) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('tenant_id') && (
    message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('column')
  )
}

function buildStockContext(products) {
  if (!products?.length) {
    return 'Nenhum produto disponivel confirmado no cadastro para esta busca.'
  }

  return products
    .filter(isSellableProduct)
    .map((product) => [
      `ID: ${product.id}`,
      `NOME: ${product.name}`,
      `CAT: ${product.category || 'Sem categoria'}`,
      `PRECO: R$ ${Number(product.price || 0).toFixed(2)}`,
      `QTD: ${product.stock_quantity}`,
    ].join(' | '))
    .join('\n')
}

function isSellableProduct(product) {
  const name = String(product?.name || '').trim()
  return Boolean(product?.active)
    && name.toLowerCase() !== 'produto importado'
    && Number(product?.stock_quantity) > 0
    && Number(product?.price) > 0
}

function productSearchText(product) {
  return normalizeSearchText([
    product?.name,
    product?.category,
    product?.description,
    product?.species_target,
  ].filter(Boolean).join(' '))
}

function rankProduct(product, terms) {
  const searchable = productSearchText(product)
  const category = normalizeSearchText(product?.category)
  let score = 0

  for (const term of terms) {
    if (category.includes(term)) score += 6
    if (searchable.includes(term)) score += 3
  }

  if (category.includes('racao')) score += 2
  score += Math.min(Number(product?.stock_quantity || 0), 20) / 20
  return score
}

function selectRelevantProducts(products, message) {
  const available = (products || []).filter(isSellableProduct)
  const searchTerms = buildSearchTerms(message)
  const intent = detectIntent(message)

  if (!available.length) return []

  const matched = searchTerms.length
    ? available
      .map((product) => ({ product, score: rankProduct(product, searchTerms) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.product)
    : []

  const source = matched.length ? matched : (intent === 'produto' ? available : matched)

  return source
    .sort((a, b) => {
      const aCategory = normalizeSearchText(a?.category)
      const bCategory = normalizeSearchText(b?.category)
      if (aCategory.includes('racao') !== bCategory.includes('racao')) {
        return aCategory.includes('racao') ? -1 : 1
      }
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'pt-BR')
    })
    .slice(0, PRODUCT_CONTEXT_LIMIT)
}

function buildAppointmentsContext(appointments) {
  if (!appointments?.length) {
    return 'Nenhum horario cadastrado na agenda para os proximos dias. Nao prometa horario; pergunte se deseja falar com atendente.'
  }

  const lines = appointments
    .slice(0, 30)
    .map((appointment) => {
      const time = new Date(appointment.scheduled_at).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      })
      const date = new Date(appointment.scheduled_at).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'America/Sao_Paulo',
      })
      const status = cleanText(appointment.status).toLowerCase()
      const availability = AVAILABLE_STATUSES.has(status)
        ? 'DISPONIVEL'
        : BUSY_STATUSES.has(status)
          ? 'OCUPADO'
          : `STATUS ${status || 'nao informado'}`
      const price = Number(appointment.price || 0) > 0 ? ` | R$ ${Number(appointment.price).toFixed(2)}` : ''
      return `${date} ${time} - ${appointment.service_type || 'Atendimento'} | ${availability}${price}`
    })

  if (!lines.some((line) => line.includes('DISPONIVEL'))) {
    lines.push('Nao ha horario explicitamente disponivel no contexto. Ofereca consultar outros horarios com a equipe.')
  }

  return lines.join('\n')
}

function buildCustomerContext(customer) {
  if (!customer?.client) {
    return [
      'Cliente nao encontrado no cadastro pelo telefone.',
      `Telefone: ${customer?.phone || 'Nao informado'}`,
      'Nome confirmado: nao. Pergunte o nome antes de vender.',
    ].join('\n')
  }

  const details = customer.client.details || {}
  const nameConfirmed = !isPlaceholderName(customer.client.name) && details.name_confirmed !== false
  return [
    `Cliente cadastrado pelo telefone: sim`,
    `Nome: ${nameConfirmed ? customer.client.name : 'nao confirmado'}`,
    `Telefone: ${customer.client.phone || customer.phone || 'Nao informado'}`,
    `Pet: ${details.pet_name || 'Nao informado'}`,
    `Especie: ${details.species || 'Nao informado'}`,
    `Porte/peso: ${details.size || details.weight_kg || 'Nao informado'}`,
    `Raca: ${details.breed || 'Nao informado'}`,
    `Endereco cadastrado: ${[customer.client.address, customer.client.neighborhood, customer.client.city].filter(Boolean).join(' - ') || 'Nao informado'}`,
    `Nome confirmado: ${nameConfirmed ? 'sim' : 'nao'}`,
  ].join('\n')
}

function buildSystemPrompt({
  storeName,
  storePhone,
  storeAddress,
  storeNeighborhood,
  storeCity,
  deliveryFee,
  customerContext,
  stockContext,
  appointmentsContext,
  examplesContext,
  botPrompt,
}) {
  const customInstructions = String(botPrompt || '').trim()
  const storeLocation = [
    storeAddress,
    storeNeighborhood,
    storeCity,
  ].filter(Boolean).join(' - ') || 'Nao informado'

  return [
    `Voce e o atendente virtual oficial de ${storeName || 'esta loja'}.`,
    'Responda em portugues do Brasil, com tom cordial, claro e objetivo.',
    'Use somente os dados confirmados no contexto operacional abaixo.',
    'Nunca invente preco, estoque, horario, disponibilidade, endereco, politica comercial ou procedimento veterinario.',
    'Se o cliente pedir algo fora do contexto, peca os dados necessarios ou encaminhe para atendimento humano.',
    'Para agendamentos, nao confirme disponibilidade sem haver horario confirmado no contexto de agenda.',
    'Nunca aplique desconto. Se pedirem desconto, responda gentilmente: "Infelizmente nao conseguimos aplicar desconto nesse pedido."',
    'Mantenha respostas curtas e naturais para conversa de WhatsApp.',
    'Seu foco e vender, mas sem pressionar: se o cliente recusar o upsell, continue o pedido normalmente.',
    'Sempre pesquise no contexto do banco abaixo. Se o dado nao estiver no contexto, diga que vai consultar a equipe.',
    '',
    'Fluxo obrigatorio:',
    '1. Saudacao + nome; 2. Intencao; 3. dados minimos do pet; 4. opcoes/horarios reais; 5. valor antes de confirmar; 6. um upsell; 7. resumo parcial; 8. pagamento; 9. troco se dinheiro; 10. entrega/retirada; 11. endereco se entrega; 12. resumo final; 13. confirmar separacao/agendamento; 14. avaliacao 0-10.',
    'Se o dado ja estiver no cadastro/contexto, nao pergunte de novo.',
    'Dados minimos produto: cliente, especie, porte/peso ou categoria, marca se mencionada.',
    'Dados minimos banho/tosa: cliente, nome do pet, especie, porte/raca e horario real disponivel.',
    'Dados minimos veterinaria: cliente, nome do pet, especie/tamanho, problema principal e horario real disponivel.',
    'Upsell: ofereca 1 item ou servico relacionado; se o cliente recusar, continue o pedido normalmente.',
    'Se produto sem estoque, mostre alternativas similares do contexto. Se horario indisponivel, ofereca os proximos horarios disponiveis do contexto.',
    'Depois do cliente confirmar o resumo final, use a ferramenta create_confirmed_petshop_order antes de responder a avaliacao.',
    '',
    'Configuracao customizada deste tenant:',
    customInstructions || 'Nenhuma instrucao customizada cadastrada.',
    '',
    'Contexto operacional do banco de dados:',
    `Loja: ${storeName || 'Nao informado'}`,
    `Telefone da loja: ${storePhone || 'Nao informado'}`,
    `Endereco: ${storeLocation}`,
    `Taxa de entrega: R$ ${Number(deliveryFee ?? DEFAULT_DELIVERY_FEE).toFixed(2)}`,
    '',
    'Cliente atual:',
    customerContext || 'Cliente nao carregado.',
    '',
    'Estoque relevante:',
    stockContext || 'Nenhum produto confirmado para esta busca.',
    '',
    'Agenda dos proximos dias:',
    appointmentsContext || 'Agenda indisponivel no momento.',
    '',
    'Exemplos aprovados de conversa:',
    examplesContext || 'Nenhum exemplo cadastrado para este contexto.',
    'Use os exemplos apenas como modelo de estilo e fluxo. Nunca copie precos, estoque, horarios, nomes ou enderecos dos exemplos.',
    '',
    'Formato do resumo parcial:',
    '**Pedido em andamento:**\n• Cliente: [NOME]\n• Pet: [NOME/ESPECIE/PORTE]\n• [PRODUTO/SERVICO]: [DETALHE]\n• Extra: [UPSELL OU "nao adicionado"]\n• Total parcial: R$ [VALOR]\n• Pagamento: aguardando\n• Entrega/retirada: aguardando',
    '',
    'Pagamento: pergunte exatamente "Qual forma prefere? pix, dinheiro ou cartão?"',
    'Entrega/retirada: pergunte exatamente "Será entrega ou retirada na loja?"',
    'Resumo final: termine perguntando "Confirma para separação?" ou, para servico, "Confirma o agendamento?"',
    'Apos confirmar e registrar com a ferramenta, responda: "Pedido confirmado! 🎉\\n\\nDe 0 a 10, como avalia o atendimento?"',
  ].join('\n')
}

async function loadStoreSettings(supabase, moduleId, tenantId) {
  let query = supabase
    .from('settings')
    .select('*')
    .eq('module_id', moduleId)

  if (tenantId) {
    query = query.eq('tenant_id', tenantId)
  }

  const { data, error } = await query.maybeSingle()
  if (error) {
    if (tenantId && isMissingTenantColumnError(error)) {
      throw new HttpError(500, 'Tenant isolation is not enabled in settings table.')
    }
    throw new HttpError(500, 'Unable to load store configuration.')
  }

  return {
    storeName: data?.store_name || 'YuiSync',
    storePhone: data?.store_phone || '',
    storeAddress: data?.store_address || '',
    storeNeighborhood: data?.store_neighborhood || '',
    storeCity: data?.store_city || '',
    botPrompt: data?.bot_prompt || '',
    deliveryFee: Number(data?.delivery_fee ?? DEFAULT_DELIVERY_FEE),
  }
}

async function loadProducts(supabase, moduleId, tenantId, message) {
  let query = supabase
    .from('products')
    .select('id, name, category, description, species_target, price, stock_quantity, active')
    .eq('module_id', moduleId)
    .eq('active', true)

  if (tenantId) {
    query = query.eq('tenant_id', tenantId)
  }

  const { data, error } = await query
    .order('stock_quantity', { ascending: false })
    .limit(120)

  if (error) {
    if (tenantId && isMissingTenantColumnError(error)) {
      throw new HttpError(500, 'Tenant isolation is not enabled in products table.')
    }
    throw new HttpError(500, 'Unable to load product context.')
  }

  const searchTerms = buildSearchTerms(message)
  const selected = selectRelevantProducts(data || [], message)
  if (selected.length > 0 || searchTerms.length === 0) return selected

  let fallbackQuery = supabase
    .from('products')
    .select('id, name, category, price, stock_quantity, active')
    .eq('module_id', moduleId)
    .eq('active', true)
    .gt('stock_quantity', 0)
    .order('stock_quantity', { ascending: false })
    .limit(8)

  if (tenantId) {
    fallbackQuery = fallbackQuery.eq('tenant_id', tenantId)
  }

  const fallback = await fallbackQuery
  if (fallback.error) return []
  return fallback.data || []
}

async function loadAppointments(supabase, moduleId, tenantId) {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  let query = supabase
    .from('appointments')
    .select('id, service_type, scheduled_at, status, price')
    .eq('module_id', moduleId)
    .gte('scheduled_at', `${today}T00:00:00-03:00`)
    .lte('scheduled_at', `${end}T23:59:59-03:00`)
    .order('scheduled_at')
    .limit(40)

  if (tenantId) {
    query = query.eq('tenant_id', tenantId)
  }

  const { data, error } = await query

  if (error) {
    if (tenantId && isMissingTenantColumnError(error)) {
      throw new HttpError(500, 'Tenant isolation is not enabled in appointments table.')
    }
    throw new HttpError(500, 'Unable to load appointment context.')
  }

  return data || []
}

function isBotExamplesSchemaError(error) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('bot_conversation_examples') && (
    message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('relation')
    || message.includes('column')
  )
}

function scoreConversationExample(example, terms, intent) {
  let score = 0
  if (String(example.intent || '').toLowerCase() === String(intent || '').toLowerCase()) score += 12
  if (String(example.intent || '').toLowerCase() === 'geral') score += 3

  const haystack = [
    example.intent,
    example.stage,
    example.user_message,
    example.ideal_reply,
    example.notes,
    ...(Array.isArray(example.tags) ? example.tags : []),
  ].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  for (const term of terms) {
    if (haystack.includes(term)) score += 2
  }

  return score
}

function buildExamplesContext(examples) {
  if (!examples?.length) return ''

  return examples
    .slice(0, 3)
    .map((example, index) => [
      `Exemplo ${index + 1} (${example.intent || 'geral'} / ${example.stage || 'geral'}):`,
      `Cliente: ${cleanText(example.user_message)}`,
      `PetBot: ${cleanText(example.ideal_reply)}`,
      cleanText(example.notes) ? `Notas: ${cleanText(example.notes)}` : null,
    ].filter(Boolean).join('\n'))
    .join('\n---\n')
}

async function loadConversationExamples(supabase, moduleId, tenantId, message, intent) {
  let query = supabase
    .from('bot_conversation_examples')
    .select('intent,stage,user_message,ideal_reply,notes,tags,created_at')
    .eq('module_id', moduleId)
    .eq('active', true)
    .limit(80)

  if (tenantId) {
    query = query.or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
  }

  const { data, error } = await query
  if (error) {
    if (isBotExamplesSchemaError(error)) return ''
    logger.warn('Conversation examples load failed', { tenantId, moduleId, error: error.message })
    return ''
  }

  const terms = buildSearchTerms(message)
  const ranked = (data || [])
    .map((example) => ({
      example,
      score: scoreConversationExample(example, terms, intent),
    }))
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score > 0)
    .map((item) => item.example)

  const selected = ranked.length > 0 ? ranked : (data || []).slice(0, 2)
  return buildExamplesContext(selected)
}

async function loadRecentMessages(supabase, sessionId) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, metadata, tokens_used, sent_at')
    .eq('session_id', sessionId)
    .order('sent_at', { ascending: false })
    .limit(40)

  if (error) {
    throw new HttpError(500, 'Unable to load conversation history.')
  }

  return (data || []).reverse().map((message) => ({
    ...message,
    role: message.role === 'human_agent' ? 'assistant' : message.role,
    content: message.content,
    metadata: message.metadata || {},
  }))
}

async function findClientByPhone(supabase, moduleId, tenantId, phone) {
  const digits = normalizePhone(phone)
  if (!digits) return null

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('module_id', moduleId)
    .eq('tenant_id', tenantId)
    .limit(200)

  if (error) {
    if (isMissingTenantColumnError(error)) {
      throw new HttpError(500, 'Tenant isolation is not enabled in clients table.')
    }
    throw new HttpError(500, 'Unable to load customer profile.')
  }

  return (data || []).find((client) => normalizePhone(client.phone) === digits) || null
}

async function ensureCustomerProfile(supabase, session, patch = {}) {
  const moduleId = String(session.module_id || '').trim().toLowerCase()
  const tenantId = session.tenant_id
  const phone = normalizePhone(session.customer_phone)
  let client = session.client_id ? null : await findClientByPhone(supabase, moduleId, tenantId, phone)

  if (session.client_id) {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', session.client_id)
      .maybeSingle()
    if (error) throw new HttpError(500, 'Unable to load linked customer profile.')
    client = data || null
  }

  const customerName = cleanText(patch.customer_name) || cleanText(client?.name) || cleanText(session.customer_name)
  const hasConfirmedName = Boolean(cleanText(patch.customer_name)) || Boolean(client && !isPlaceholderName(client.name) && client.details?.name_confirmed !== false)
  const nextDetails = {
    ...(client?.details || {}),
    ...(cleanText(patch.pet_name) ? { pet_name: cleanText(patch.pet_name) } : {}),
    ...(cleanText(patch.species) ? { species: normalizeSpecies(patch.species) } : {}),
    ...(cleanText(patch.size) ? { size: cleanText(patch.size) } : {}),
    ...(cleanText(patch.breed) ? { breed: cleanText(patch.breed) } : {}),
    ...(cleanText(patch.symptom) ? { last_symptom: cleanText(patch.symptom) } : {}),
    name_confirmed: hasConfirmedName,
  }

  const payload = {
    module_id: moduleId,
    tenant_id: tenantId,
    type: 'pet',
    name: customerName || `Cliente ${phone || 'WhatsApp'}`,
    phone: phone || session.customer_phone || null,
    address: cleanText(patch.address) || client?.address || null,
    neighborhood: cleanText(patch.neighborhood) || client?.neighborhood || null,
    city: cleanText(patch.city) || client?.city || null,
    active: true,
    details: nextDetails,
  }

  if (!client) {
    const { data, error } = await supabase
      .from('clients')
      .insert(payload)
      .select('*')
      .single()

    if (error) throw new HttpError(500, 'Unable to create customer profile.')
    client = data
  } else if (Object.keys(patch || {}).length > 0 || session.client_id !== client.id) {
    const { data, error } = await supabase
      .from('clients')
      .update(payload)
      .eq('id', client.id)
      .select('*')
      .single()

    if (error) throw new HttpError(500, 'Unable to update customer profile.')
    client = data
  }

  const sessionPatch = {
    client_id: client.id,
    customer_phone: phone || session.customer_phone,
    ...(hasConfirmedName && client.name ? { customer_name: client.name } : {}),
  }

  await supabase
    .from('chat_sessions')
    .update(sessionPatch)
    .eq('id', session.id)

  return {
    client,
    phone: phone || session.customer_phone,
    isKnown: hasConfirmedName,
  }
}

async function createConfirmedPetshopOrder(supabase, session, settings, args = {}) {
  const customer = await ensureCustomerProfile(supabase, session, args)
  const items = Array.isArray(args.items) ? args.items : []
  if (!items.length) throw new Error('Pedido sem itens para registrar.')

  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 1) * Number(item.unit_price || 0), 0)
  const deliveryFee = args.fulfillment_type === 'entrega' ? Number(settings.deliveryFee ?? DEFAULT_DELIVERY_FEE) : 0
  const total = Number(args.total || 0) || subtotal + deliveryFee
  const orderType = args.order_type === 'produto' ? 'entrega' : 'servico'
  const fulfillmentType = args.order_type === 'produto'
    ? (args.fulfillment_type === 'retirada' ? 'balcao' : 'entrega')
    : 'servico'

  const notes = [
    `Origem: PetBot WhatsApp`,
    `Sessao: ${session.id}`,
    cleanText(args.notes),
    args.fulfillment_type === 'retirada' ? 'Retirada na loja' : null,
    cleanText(args.delivery_reference) ? `Referencia: ${cleanText(args.delivery_reference)}` : null,
    Number(args.change_for || 0) > 0 ? `Troco para R$ ${Number(args.change_for).toFixed(2)}` : null,
  ].filter(Boolean).join(' | ')

  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .insert({
      tenant_id: session.tenant_id,
      module_id: session.module_id,
      client_id: customer.client.id,
      customer_name: cleanText(args.customer_name) || customer.client.name,
      customer_phone: customer.phone,
      payment_method: args.payment_method || null,
      subtotal,
      discount: 0,
      total_price: total,
      status: 'concluido',
      source: 'whatsapp',
      fulfillment_type: fulfillmentType,
      notes,
    })
    .select('id,total_price')
    .single()

  if (saleError) throw new Error(`Falha ao registrar venda: ${saleError.message}`)

  const saleItems = items.map((item) => ({
    tenant_id: session.tenant_id,
    sale_id: sale.id,
    product_id: cleanText(item.product_id) || null,
    quantity: Number(item.quantity || 1),
    unit_price: Number(item.unit_price || 0),
    subtotal: Number(item.quantity || 1) * Number(item.unit_price || 0),
    upsell: Boolean(item.upsell),
  }))

  const { error: itemsError } = await supabase.from('sale_items').insert(saleItems)
  if (itemsError) throw new Error(`Falha ao registrar itens: ${itemsError.message}`)

  for (const item of saleItems) {
    if (!item.product_id) continue
    const { data: product } = await supabase
      .from('products')
      .select('stock_quantity')
      .eq('id', item.product_id)
      .maybeSingle()
    if (!product) continue
    const nextStock = Math.max(0, Number(product.stock_quantity || 0) - Number(item.quantity || 0))
    await supabase.from('products').update({ stock_quantity: nextStock }).eq('id', item.product_id)
  }

  let appointment = null
  if (args.order_type !== 'produto' && cleanText(args.scheduled_at)) {
    const { data, error } = await supabase
      .from('appointments')
      .insert({
        tenant_id: session.tenant_id,
        module_id: session.module_id,
        client_id: customer.client.id,
        pet_id: customer.client.id,
        service_type: cleanText(args.service_type) || args.order_type,
        scheduled_at: cleanText(args.scheduled_at),
        duration_min: 60,
        price: total,
        status: 'agendado',
        source: 'whatsapp',
        customer_name: cleanText(args.customer_name) || customer.client.name,
        customer_phone: customer.phone,
        description: notes,
        notes,
      })
      .select('id,scheduled_at')
      .single()
    if (error) throw new Error(`Falha ao registrar agendamento: ${error.message}`)
    appointment = data
  }

  const deliveryAddress = cleanText(args.delivery_address) || customer.client.address || null
  const deliveryNeighborhood = cleanText(args.delivery_neighborhood) || customer.client.neighborhood || null
  const deliveryCity = cleanText(args.delivery_city) || customer.client.city || null

  const { data: order, error: orderError } = await supabase
    .from('service_delivery_orders')
    .insert({
      tenant_id: session.tenant_id,
      module_id: session.module_id,
      sale_id: sale.id,
      client_id: customer.client.id,
      session_id: session.id,
      source: 'whatsapp',
      order_type: orderType,
      status: orderType === 'servico' ? 'agendado' : 'separacao',
      scheduled_for: appointment?.scheduled_at || null,
      delivery_address: args.fulfillment_type === 'entrega' ? deliveryAddress : null,
      delivery_neighborhood: args.fulfillment_type === 'entrega' ? deliveryNeighborhood : null,
      delivery_city: args.fulfillment_type === 'entrega' ? deliveryCity : null,
      contact_phone: customer.phone,
      notes,
    })
    .select('id')
    .single()

  if (orderError && !String(orderError.message || '').includes('duplicate')) {
    throw new Error(`Falha ao registrar ordem operacional: ${orderError.message}`)
  }

  await supabase
    .from('chat_sessions')
    .update({
      intent: 'pedido_confirmado',
      context: {
        last_sale_id: sale.id,
        last_order_id: order?.id || null,
        last_appointment_id: appointment?.id || null,
      },
      last_message_at: new Date().toISOString(),
    })
    .eq('id', session.id)

  return {
    sale_id: sale.id,
    order_id: order?.id || null,
    appointment_id: appointment?.id || null,
    total,
  }
}

async function executePetbotTool(supabase, session, settings, toolCall) {
  const name = toolCall?.function?.name
  let args = {}
  try {
    args = JSON.parse(toolCall?.function?.arguments || '{}')
  } catch {
    args = {}
  }

  if (name === 'update_customer_profile') {
    const customer = await ensureCustomerProfile(supabase, session, args)
    return {
      ok: true,
      action: name,
      client_id: customer.client.id,
      name_confirmed: customer.isKnown,
    }
  }

  if (name === 'create_confirmed_petshop_order') {
    const result = await createConfirmedPetshopOrder(supabase, session, settings, args)
    return {
      ok: true,
      action: name,
      ...result,
    }
  }

  return { ok: false, error: `Ferramenta desconhecida: ${name}` }
}

async function loadBotRuntimeConfig(supabase, tenantId, moduleId) {
  try {
    const { data: company, error: companyErr } = await supabase
      .from('companies')
      .select('id, model_name, temperature')
      .eq('module_id', moduleId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (companyErr || !company) return { modelName: DEFAULT_BOT_MODEL, temperature: DEFAULT_BOT_TEMPERATURE }

    return {
      modelName: company.model_name || DEFAULT_BOT_MODEL,
      temperature: Number(company.temperature ?? DEFAULT_BOT_TEMPERATURE),
    }
  } catch (err) {
    logger.warn('Bot runtime config load failed', { tenantId, moduleId, error: err.message })
    return { modelName: DEFAULT_BOT_MODEL, temperature: DEFAULT_BOT_TEMPERATURE }
  }
}

async function callOpenAIWithTimeout(params, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${serverEnv.openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const detail = payload?.error?.message || `HTTP ${response.status}`
      throw new HttpError(502, `OpenAI request failed: ${detail}`)
    }

    return payload
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new HttpError(504, 'AI response timed out. Please try again.')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function respondToChatMessage(supabase, sessionId, message, options = {}) {
  const trimmedMessage = typeof message === 'string' ? message.trim() : ''

  if (!trimmedMessage) {
    throw new HttpError(400, 'Message cannot be empty.')
  }

  if (trimmedMessage.length > 4000) {
    throw new HttpError(400, 'Message is too long.')
  }

  const { data: session, error: sessionError } = await supabase
    .from('chat_sessions')
    .select('id, module_id, tenant_id, customer_phone, customer_name, status, client_id')
    .eq('id', sessionId)
    .maybeSingle()

  if (sessionError || !session) {
    throw new HttpError(404, 'Chat session not found.')
  }

  if (!session.tenant_id) {
    throw new HttpError(500, 'Chat session is missing tenant_id.')
  }

  if (session.status === 'human' && !options.allowBotWhenHuman) {
    throw new HttpError(409, 'Chat is currently assigned to a human agent.')
  }

  const moduleId = String(session.module_id || '').trim().toLowerCase()
  if (!SUPPORTED_MODULES.has(moduleId)) {
    throw new HttpError(400, `Unsupported module_id "${session.module_id}".`)
  }

  const intent = detectIntent(trimmedMessage)
  const [storeSettings, products, appointments, examplesContext, history, botConfig] = await Promise.all([
    loadStoreSettings(supabase, moduleId, session.tenant_id),
    loadProducts(supabase, moduleId, session.tenant_id, trimmedMessage),
    loadAppointments(supabase, moduleId, session.tenant_id),
    loadConversationExamples(supabase, moduleId, session.tenant_id, trimmedMessage, intent),
    loadRecentMessages(supabase, sessionId),
    loadBotRuntimeConfig(supabase, session.tenant_id, moduleId),
  ])
  const customer = await ensureCustomerProfile(supabase, session)

  const systemPrompt = buildSystemPrompt({
    ...storeSettings,
    customerContext: buildCustomerContext(customer),
    stockContext: buildStockContext(products),
    appointmentsContext: buildAppointmentsContext(appointments),
    examplesContext,
  })

  const userSentAt = new Date().toISOString()
  const { error: userInsertError } = await supabase.from('chat_messages').insert({
    session_id: sessionId,
    role: 'user',
    content: trimmedMessage,
    metadata: {
      source: options.source || 'dashboard_simulation',
      ...(options.userMetadata || {}),
    },
    sent_at: userSentAt,
  })

  if (userInsertError) {
    throw new HttpError(500, 'Unable to save user message.')
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: trimmedMessage },
  ]

  let completion = await callOpenAIWithTimeout({
    model: botConfig.modelName || serverEnv.openAiModel,
    temperature: Number.isFinite(botConfig.temperature) ? botConfig.temperature : DEFAULT_BOT_TEMPERATURE,
    max_tokens: 500,
    messages,
    tools: PETBOT_TOOLS,
    tool_choice: 'auto',
  }, serverEnv.openAiTimeoutMs)

  let assistantMessage = completion.choices[0]?.message || {}
  const toolCalls = assistantMessage.tool_calls || []

  if (toolCalls.length > 0) {
    const toolResults = []
    for (const toolCall of toolCalls) {
      try {
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolCall.function?.name,
          content: JSON.stringify(await executePetbotTool(supabase, session, storeSettings, toolCall)),
        })
      } catch (error) {
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolCall.function?.name,
          content: JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
        })
      }
    }

    completion = await callOpenAIWithTimeout({
      model: botConfig.modelName || serverEnv.openAiModel,
      temperature: Number.isFinite(botConfig.temperature) ? botConfig.temperature : DEFAULT_BOT_TEMPERATURE,
      max_tokens: 500,
      messages: [
        ...messages,
        assistantMessage,
        ...toolResults,
      ],
    }, serverEnv.openAiTimeoutMs)
    assistantMessage = completion.choices[0]?.message || {}
  }

  const reply = assistantMessage.content?.trim()
  if (!reply) {
    throw new HttpError(502, 'The AI response came back empty.')
  }

  const botSentAt = new Date().toISOString()
  const { data: savedReply, error: replyInsertError } = await supabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      role: 'assistant',
      content: reply,
      metadata: {
        ...(options.assistantMetadata || {}),
      },
      tokens_used: completion?.usage?.total_tokens || 0,
      sent_at: botSentAt,
    })
    .select('id, role, content, metadata, tokens_used, sent_at')
    .single()

  if (replyInsertError) {
    throw new HttpError(500, 'Unable to save assistant response.')
  }

  const { error: sessionUpdateError } = await supabase
    .from('chat_sessions')
    .update({
      intent,
      last_message_at: botSentAt,
    })
    .eq('id', sessionId)

  if (sessionUpdateError) {
    throw new HttpError(500, 'Unable to update chat session.')
  }

  logger.info('Chat response generated', {
    sessionId,
    moduleId,
    intent,
    engine: 'petbot_structured_prompt_v1',
  })

  return {
    reply,
    savedMessage: savedReply,
  }
}
