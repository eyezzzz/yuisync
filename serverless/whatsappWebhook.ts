import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_MODULE_ID = 'petshop'
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'
const DEFAULT_OPENAI_TIMEOUT_MS = 12_000
const DEFAULT_WHATSAPP_REPLY_DEBOUNCE_MS = 8_000
const GRAPH_BASE_URL = 'https://graph.facebook.com'
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024
const MAX_WHATSAPP_TEXT_CHARS = 4096
const RECENT_HISTORY_LIMIT = 14
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
  'ola',
  'opa',
  'bom',
  'boa',
  'dia',
  'tarde',
  'noite',
])
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
          species: { type: 'string' },
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

type LooseRecord = Record<string, any>

type WebhookEnv = {
  supabaseUrl: string
  supabaseServiceRoleKey: string
  openAiApiKey: string
  openAiModel: string
  openAiTimeoutMs: number
  whatsappAccessToken: string
  whatsappVerifyToken: string
  whatsappPhoneNumberId: string
  whatsappAppSecret: string
  whatsappGraphVersion: string
  whatsappTenantId: string
  whatsappModuleId: string
  whatsappReplyDebounceMs: number
}

type WhatsappEvent = {
  phoneNumberId: string
  from: string
  messageId: string
  timestamp: string
  type: string
  text: string
  isSupportedText: boolean
  profileName: string
}

type ChatSession = {
  id: string
  tenant_id: string
  module_id: string
  customer_phone: string
  customer_name: string | null
  status: string
  client_id?: string | null
  context?: unknown
  csat_score?: number | null
}

type SavedMessage = {
  id: string
  role: string
  content: string
  metadata: LooseRecord | null
  tokens_used?: number | null
  sent_at: string
}

type StoreContext = {
  storeName: string
  storePhone: string
  storeAddress: string
  storeNeighborhood: string
  storeCity: string
  botPrompt: string
  deliveryFee: number
  customerContext: string
  examplesContext: string
  modelName: string
  temperature: number
  productContext: string
  appointmentsContext: string
}

class WebhookHttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function fail(status: number, message: string): never {
  throw new WebhookHttpError(status, message)
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseJsonObject(value: unknown): LooseRecord {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value as LooseRecord
  try {
    const parsed = JSON.parse(String(value))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as LooseRecord : {}
  } catch {
    return {}
  }
}

function isUuid(value: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(value))
}

function parseRating(value: unknown): number | null {
  const text = clean(value)
  if (!/^(10|[0-9])$/.test(text)) return null
  return Number(text)
}

function hasConfirmedOrderContext(session: ChatSession): boolean {
  const context = parseJsonObject(session.context)
  return Boolean(context.last_sale_id || context.last_order_id || context.last_appointment_id)
}

function normalizePhone(value: unknown): string {
  return clean(value).replace(/\D/g, '')
}

function isPlaceholderName(value: unknown): boolean {
  const name = clean(value).toLowerCase()
  return !name || ['cliente', 'cliente whatsapp', 'whatsapp', 'sem nome'].includes(name) || /^cliente[-\s]?\d+/i.test(name)
}

function normalizeSpecies(value: unknown): string {
  const lower = clean(value).toLowerCase()
  if (lower.includes('cach') || lower.includes('dog')) return 'dog'
  if (lower.includes('gat') || lower.includes('cat')) return 'cat'
  return lower
}

function record(value: unknown): LooseRecord {
  return value && typeof value === 'object' ? value as LooseRecord : {}
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function optionalEnv(name: string, fallback = ''): string {
  return clean(process.env[name]) || fallback
}

function requireEnv(name: string): string {
  const value = optionalEnv(name)
  if (!value) fail(500, `Missing required environment variable: ${name}`)
  return value
}

function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseNonNegativeInt(value: string, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getWebhookEnv(): WebhookEnv {
  return {
    supabaseUrl: requireEnv('SUPABASE_URL'),
    supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    openAiApiKey: requireEnv('OPENAI_API_KEY'),
    openAiModel: optionalEnv('OPENAI_MODEL', DEFAULT_OPENAI_MODEL),
    openAiTimeoutMs: parsePositiveInt(optionalEnv('OPENAI_TIMEOUT_MS'), DEFAULT_OPENAI_TIMEOUT_MS),
    whatsappAccessToken: requireEnv('WHATSAPP_ACCESS_TOKEN'),
    whatsappVerifyToken: requireEnv('WHATSAPP_VERIFY_TOKEN'),
    whatsappPhoneNumberId: normalizePhoneIdentifier(requireEnv('WHATSAPP_PHONE_NUMBER_ID')),
    whatsappAppSecret: optionalEnv('WHATSAPP_APP_SECRET'),
    whatsappGraphVersion: optionalEnv('WHATSAPP_GRAPH_VERSION', 'v25.0').replace(/^\/+/, ''),
    whatsappTenantId: optionalEnv('WHATSAPP_TENANT_ID'),
    whatsappModuleId: optionalEnv('WHATSAPP_MODULE_ID', DEFAULT_MODULE_ID).toLowerCase(),
    whatsappReplyDebounceMs: parseNonNegativeInt(
      optionalEnv('WHATSAPP_REPLY_DEBOUNCE_MS'),
      DEFAULT_WHATSAPP_REPLY_DEBOUNCE_MS,
    ),
  }
}

function createAdminClient(env: WebhookEnv) {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function normalizePhoneIdentifier(value: unknown): string {
  const raw = clean(value)
  const digits = raw.replace(/\D/g, '')
  return digits || raw
}

function timestampToIso(value: unknown): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return new Date().toISOString()
  return new Date(numeric * 1000).toISOString()
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(JSON.stringify(payload))
}

function sendText(res: ServerResponse, status: number, text: string) {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(text)
}

function extractMessageText(message: LooseRecord): string {
  const type = clean(message.type)
  if (type === 'text') return clean(record(message.text).body)
  if (type === 'button') return clean(record(message.button).text)
  if (type === 'interactive') {
    const interactive = record(message.interactive)
    return clean(record(interactive.button_reply).title || record(interactive.list_reply).title)
  }

  return clean(
    record(message.image).caption
      || record(message.document).caption
      || record(message.video).caption,
  )
}

function extractWhatsappEvents(body: unknown): WhatsappEvent[] {
  const events: WhatsappEvent[] = []

  for (const entryValue of list(record(body).entry)) {
    const entry = record(entryValue)
    for (const changeValue of list(entry.changes)) {
      const change = record(changeValue)
      if (change.field && clean(change.field) !== 'messages') continue

      const value = record(change.value)
      const metadata = record(value.metadata)
      const phoneNumberId = normalizePhoneIdentifier(metadata.phone_number_id)
      const contacts = new Map<string, LooseRecord>()

      for (const contactValue of list(value.contacts)) {
        const contact = record(contactValue)
        const waId = normalizePhoneIdentifier(contact.wa_id)
        if (waId) contacts.set(waId, contact)
      }

      for (const messageValue of list(value.messages)) {
        const message = record(messageValue)
        const from = normalizePhoneIdentifier(message.from)
        const text = extractMessageText(message)
        const contact = contacts.get(from) || {}
        const profile = record(contact.profile)

        events.push({
          phoneNumberId,
          from,
          messageId: clean(message.id),
          timestamp: clean(message.timestamp),
          type: clean(message.type || 'unknown'),
          text,
          isSupportedText: Boolean(text),
          profileName: clean(profile.name) || 'Cliente WhatsApp',
        })
      }
    }
  }

  return events
}

function summarizeWebhook(body: unknown) {
  let changes = 0
  let messages = 0
  let statuses = 0
  let phoneNumberId = ''

  for (const entryValue of list(record(body).entry)) {
    const entry = record(entryValue)
    for (const changeValue of list(entry.changes)) {
      changes += 1
      const value = record(record(changeValue).value)
      phoneNumberId ||= normalizePhoneIdentifier(record(value.metadata).phone_number_id)
      messages += list(value.messages).length
      statuses += list(value.statuses).length
    }
  }

  return {
    object: clean(record(body).object),
    entries: list(record(body).entry).length,
    changes,
    messages,
    statuses,
    phoneNumberId,
  }
}

async function readRequestBody(req: IncomingMessage): Promise<{ body: unknown; rawBody: string }> {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_WEBHOOK_BODY_BYTES) fail(413, 'Payload too large.')
    chunks.push(buffer)
  }

  const rawBody = Buffer.concat(chunks).toString('utf8')
  if (!rawBody) return { body: {}, rawBody }

  try {
    return { body: JSON.parse(rawBody), rawBody }
  } catch {
    fail(400, 'Invalid JSON payload.')
  }
}

function assertWebhookSignature(env: WebhookEnv, rawBody: string, headers: IncomingHttpHeaders) {
  if (!env.whatsappAppSecret) return

  const signature = clean(headers['x-hub-signature-256'])
  if (!signature.startsWith('sha256=')) fail(401, 'Missing WhatsApp webhook signature.')

  const received = signature.slice('sha256='.length)
  const expected = createHmac('sha256', env.whatsappAppSecret).update(rawBody, 'utf8').digest('hex')
  const receivedBuffer = Buffer.from(received, 'hex')
  const expectedBuffer = Buffer.from(expected, 'hex')

  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) {
    fail(401, 'Invalid WhatsApp webhook signature.')
  }
}

function validateMetaPayload(body: unknown, env: WebhookEnv) {
  const metaObject = clean(record(body).object)
  if (metaObject && metaObject !== 'whatsapp_business_account') {
    fail(400, 'Invalid WhatsApp webhook object.')
  }

  const summary = summarizeWebhook(body)
  if (summary.phoneNumberId && summary.phoneNumberId !== env.whatsappPhoneNumberId) {
    fail(403, 'Webhook phone_number_id does not match WHATSAPP_PHONE_NUMBER_ID.')
  }
}

async function resolveTenantId(supabase: SupabaseClient, env: WebhookEnv): Promise<string> {
  if (env.whatsappTenantId) return env.whatsappTenantId

  const activeTenant = await supabase
    .from('tenants')
    .select('id')
    .eq('active', true)
    .limit(2)

  if (!activeTenant.error && (activeTenant.data || []).length === 1) {
    return String(activeTenant.data[0].id)
  }

  const fallbackTenant = await supabase
    .from('tenants')
    .select('id')
    .limit(2)

  if (fallbackTenant.error) {
    fail(500, 'Unable to resolve WhatsApp tenant. Set WHATSAPP_TENANT_ID in Vercel.')
  }

  if ((fallbackTenant.data || []).length === 1) {
    return String(fallbackTenant.data[0].id)
  }

  fail(500, 'Multiple tenants found. Set WHATSAPP_TENANT_ID in Vercel for this WhatsApp number.')
}

async function getOrCreateSession(
  supabase: SupabaseClient,
  env: WebhookEnv,
  event: WhatsappEvent,
): Promise<ChatSession> {
  const tenantId = await resolveTenantId(supabase, env)
  const now = new Date().toISOString()

  const existing = await supabase
    .from('chat_sessions')
    .select('id, tenant_id, module_id, customer_phone, customer_name, status, client_id, context, csat_score')
    .eq('tenant_id', tenantId)
    .eq('module_id', env.whatsappModuleId)
    .eq('customer_phone', event.from)
    .maybeSingle()

  if (existing.error) fail(500, 'Unable to load WhatsApp chat session.')

  if (existing.data) {
    const patch = {
      channel: 'whatsapp',
      last_message_at: now,
      ...(!existing.data.customer_name && event.profileName ? { customer_name: event.profileName } : {}),
      ...(existing.data.status === 'closed' ? { status: 'bot', closed_at: null, opened_at: now } : {}),
    }

    const updated = await supabase
      .from('chat_sessions')
      .update(patch)
      .eq('id', existing.data.id)
      .select('id, tenant_id, module_id, customer_phone, customer_name, status, client_id, context, csat_score')
      .single()

    if (updated.error) fail(500, 'Unable to update WhatsApp chat session.')
    return updated.data as ChatSession
  }

  const created = await supabase
    .from('chat_sessions')
    .insert({
      tenant_id: tenantId,
      module_id: env.whatsappModuleId,
      customer_phone: event.from,
      customer_name: event.profileName,
      channel: 'whatsapp',
      status: 'bot',
      last_message_at: now,
      opened_at: now,
    })
    .select('id, tenant_id, module_id, customer_phone, customer_name, status, client_id, context, csat_score')
    .single()

  if (created.error) fail(500, 'Unable to create WhatsApp chat session.')
  return created.data as ChatSession
}

async function findIncomingMessage(
  supabase: SupabaseClient,
  sessionId: string,
  whatsappMessageId: string,
): Promise<SavedMessage | null> {
  if (!whatsappMessageId) return null

  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, metadata, tokens_used, sent_at')
    .eq('session_id', sessionId)
    .contains('metadata', { whatsapp_message_id: whatsappMessageId })
    .limit(1)

  if (error) return null
  return (data?.[0] as SavedMessage | undefined) || null
}

async function hasAssistantReply(
  supabase: SupabaseClient,
  sessionId: string,
  whatsappMessageId: string,
): Promise<boolean> {
  if (!whatsappMessageId) return false

  const { data, error } = await supabase
    .from('chat_messages')
    .select('id')
    .eq('session_id', sessionId)
    .eq('role', 'assistant')
    .contains('metadata', { whatsapp_reply_to_message_id: whatsappMessageId })
    .limit(1)

  if (error) return false
  return Boolean(data?.length)
}

async function saveIncomingMessage(
  supabase: SupabaseClient,
  sessionId: string,
  event: WhatsappEvent,
  content: string,
): Promise<SavedMessage> {
  const existing = await findIncomingMessage(supabase, sessionId, event.messageId)
  if (existing) return existing

  const inserted = await supabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      role: 'user',
      content,
      sent_at: timestampToIso(event.timestamp),
      metadata: {
        channel: 'whatsapp',
        whatsapp_message_id: event.messageId,
        whatsapp_from: event.from,
        whatsapp_phone_number_id: event.phoneNumberId,
        whatsapp_type: event.type,
        whatsapp_timestamp: event.timestamp || null,
      },
    })
    .select('id, role, content, metadata, tokens_used, sent_at')
    .single()

  if (inserted.error) fail(500, 'Unable to save WhatsApp user message.')
  return inserted.data as SavedMessage
}

async function touchSession(supabase: SupabaseClient, sessionId: string, sentAt = new Date().toISOString()) {
  const { error } = await supabase
    .from('chat_sessions')
    .update({ last_message_at: sentAt })
    .eq('id', sessionId)

  if (error) fail(500, 'Unable to update chat session timestamp.')
}

function normalizeSearchText(value: unknown): string {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function detectProductIntent(message: string): boolean {
  const normalized = normalizeSearchText(message)
  return /\b(racao|petisco|brinquedo|shampoo|coleira|comprar|preco|estoque|produto|produtos|tem|voces tem|vcs tem)\b/.test(normalized)
}

function detectConversationIntent(message: string): string {
  const lower = normalizeSearchText(message)
  if (/racao|petisc|brinquedo|shampoo|coleira|comprar|preco|estoque|tem |tem\?|voces tem/i.test(lower)) {
    return 'produto'
  }
  if (/banho|tosa|agend/i.test(lower)) return 'banho_tosa'
  if (/vet(erinario|erinaria)?|consulta|vacina|sintoma|doente|vomit|diarre|machuc/i.test(lower)) return 'veterinaria'
  if (/desconto|barato|melhor preco/i.test(lower)) return 'desconto'
  return 'geral'
}

function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`)
}

function buildSearchTerms(message: string): string[] {
  return normalizeSearchText(message)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !PRODUCT_STOP_WORDS.has(term))
    .slice(0, 12)
}

function buildCatalogSearchText(
  history: Array<{ role: string; content: string }> = [],
  message = '',
): string {
  const recentUserText = history
    .filter((entry) => entry?.role === 'user')
    .slice(-6)
    .map((entry) => clean(entry.content))
    .filter(Boolean)
    .join(' ')
  return [recentUserText, message].filter(Boolean).join(' ')
}

function isSellableProduct(product: LooseRecord): boolean {
  const name = clean(product.name)
  return Boolean(product.active)
    && name.toLowerCase() !== 'produto importado'
    && Number(product.stock_quantity) > 0
    && Number(product.price) > 0
}

function productSearchText(product: LooseRecord): string {
  return normalizeSearchText([
    product.name,
    product.category,
    product.description,
    product.species_target,
  ].filter(Boolean).join(' '))
}

function rankProduct(product: LooseRecord, terms: string[]): number {
  const searchable = productSearchText(product)
  const category = normalizeSearchText(product.category)
  let score = 0

  for (const term of terms) {
    if (category.includes(term)) score += 6
    if (searchable.includes(term)) score += 3
  }

  if (category.includes('racao')) score += 2
  score += Math.min(Number(product.stock_quantity || 0), 20) / 20
  return score
}

function selectRelevantProducts(products: LooseRecord[] | null | undefined, latestUserMessage: string): LooseRecord[] {
  const available = (products || []).filter(isSellableProduct)
  const terms = buildSearchTerms(latestUserMessage)
  const isProductIntent = detectProductIntent(latestUserMessage)

  if (!available.length) return []

  const matched = terms.length
    ? available
      .map((product) => ({ product, score: rankProduct(product, terms) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.product)
    : []

  const source = matched.length ? matched : (isProductIntent ? available : matched)

  return source
    .sort((a, b) => {
      const aCategory = normalizeSearchText(a.category)
      const bCategory = normalizeSearchText(b.category)
      if (aCategory.includes('racao') !== bCategory.includes('racao')) {
        return aCategory.includes('racao') ? -1 : 1
      }
      return clean(a.name).localeCompare(clean(b.name), 'pt-BR')
    })
    .slice(0, PRODUCT_CONTEXT_LIMIT)
}

function buildProductsContext(products: LooseRecord[] | null | undefined): string {
  const available = (products || []).filter(isSellableProduct)
  if (!available.length) return 'Nenhum produto disponivel confirmado no cadastro para esta busca.'

  return available
    .map((product) => [
      `Produto: ${clean(product.name) || 'sem nome'}`,
      `Categoria: ${clean(product.category) || 'sem categoria'}`,
      `Preco: R$ ${Number(product.price || 0).toFixed(2)}`,
      `Estoque: ${Number(product.stock_quantity || 0)}`,
    ].join(' | '))
    .join('\n')
    .slice(0, 6000)
}

function buildAppointmentsContext(appointments: LooseRecord[] | null | undefined): string {
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
      const status = clean(appointment.status).toLowerCase()
      const availability = AVAILABLE_STATUSES.has(status)
        ? 'DISPONIVEL'
        : BUSY_STATUSES.has(status)
          ? 'OCUPADO'
          : `STATUS ${status || 'nao informado'}`
      const price = Number(appointment.price || 0) > 0 ? ` | R$ ${Number(appointment.price).toFixed(2)}` : ''
      return `${date} ${time} - ${clean(appointment.service_type) || 'Atendimento'} | ${availability}${price}`
    })

  if (!lines.some((line) => line.includes('DISPONIVEL'))) {
    lines.push('Nao ha horario explicitamente disponivel no contexto. Ofereca consultar outros horarios com a equipe.')
  }

  return lines.join('\n').slice(0, 3000)
}

function buildCustomerContext(customer: { client: LooseRecord | null; phone: string; isKnown: boolean }): string {
  if (!customer.client) {
    return [
      'Cliente nao encontrado no cadastro pelo telefone.',
      `Telefone: ${customer.phone || 'Nao informado'}`,
      'Nome confirmado: nao. Pergunte o nome antes de vender.',
    ].join('\n')
  }

  const details = record(customer.client.details)
  const address = [customer.client.address, customer.client.neighborhood, customer.client.city].filter(Boolean).join(' - ')
  return [
    'Cliente cadastrado pelo telefone: sim',
    `Nome: ${customer.isKnown ? clean(customer.client.name) : 'nao confirmado'}`,
    `Telefone: ${clean(customer.client.phone) || customer.phone || 'Nao informado'}`,
    `Pet: ${clean(details.pet_name) || 'Nao informado'}`,
    `Especie: ${clean(details.species) || 'Nao informado'}`,
    `Porte/peso: ${clean(details.size || details.weight_kg) || 'Nao informado'}`,
    `Raca: ${clean(details.breed) || 'Nao informado'}`,
    `Endereco cadastrado: ${address || 'Nao informado'}`,
    `Nome confirmado: ${customer.isKnown ? 'sim' : 'nao'}`,
  ].join('\n')
}

async function findClientByPhone(
  supabase: SupabaseClient,
  moduleId: string,
  tenantId: string,
  phone: string,
): Promise<LooseRecord | null> {
  const digits = normalizePhone(phone)
  if (!digits) return null

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('module_id', moduleId)
    .eq('tenant_id', tenantId)
    .limit(200)

  if (error) return null
  return ((data || []) as LooseRecord[]).find((client) => normalizePhone(client.phone) === digits) || null
}

async function ensureCustomerProfile(
  supabase: SupabaseClient,
  session: ChatSession,
  patch: LooseRecord = {},
): Promise<{ client: LooseRecord | null; phone: string; isKnown: boolean }> {
  const phone = normalizePhone(session.customer_phone)
  let client: LooseRecord | null = null

  if (session.client_id) {
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('id', session.client_id)
      .maybeSingle()
    client = (data as LooseRecord | null) || null
  }

  if (!client) {
    client = await findClientByPhone(supabase, session.module_id, session.tenant_id, phone)
  }

  const customerName = clean(patch.customer_name) || clean(client?.name) || clean(session.customer_name)
  const hasConfirmedName = Boolean(clean(patch.customer_name)) || Boolean(client && !isPlaceholderName(client.name) && record(client.details).name_confirmed !== false)
  const nextDetails = {
    ...record(client?.details),
    ...(clean(patch.pet_name) ? { pet_name: clean(patch.pet_name) } : {}),
    ...(clean(patch.species) ? { species: normalizeSpecies(patch.species) } : {}),
    ...(clean(patch.size) ? { size: clean(patch.size) } : {}),
    ...(clean(patch.breed) ? { breed: clean(patch.breed) } : {}),
    ...(clean(patch.symptom) ? { last_symptom: clean(patch.symptom) } : {}),
    name_confirmed: hasConfirmedName,
  }

  if (!client) {
    const { data, error } = await supabase
      .from('clients')
      .insert({
        tenant_id: session.tenant_id,
        module_id: session.module_id,
        type: 'pet',
        name: customerName || `Cliente ${phone || 'WhatsApp'}`,
        phone: phone || session.customer_phone || null,
        active: true,
        details: nextDetails,
      })
      .select('*')
      .single()

    if (!error) client = data as LooseRecord
  }

  if (client?.id) {
    await supabase
      .from('chat_sessions')
      .update({
        client_id: client.id,
        customer_phone: phone || session.customer_phone,
        ...(hasConfirmedName && client.name ? { customer_name: client.name } : {}),
      })
      .eq('id', session.id)
  }

  return {
    client,
    phone: phone || session.customer_phone,
    isKnown: Boolean(hasConfirmedName),
  }
}

function isBotExamplesSchemaError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message || '').toLowerCase()
  return message.includes('bot_conversation_examples') && (
    message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('relation')
    || message.includes('column')
  )
}

function scoreConversationExample(example: LooseRecord, terms: string[], intent: string): number {
  let score = 0
  if (clean(example.intent).toLowerCase() === intent.toLowerCase()) score += 12
  if (clean(example.intent).toLowerCase() === 'geral') score += 3

  const tags = Array.isArray(example.tags) ? example.tags : []
  const haystack = [
    example.intent,
    example.stage,
    example.user_message,
    example.ideal_reply,
    example.notes,
    ...tags,
  ].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  for (const term of terms) {
    if (haystack.includes(term)) score += 2
  }

  return score
}

function buildExamplesContext(examples: LooseRecord[]): string {
  if (!examples?.length) return ''

  return examples
    .slice(0, 3)
    .map((example, index) => [
      `Exemplo ${index + 1} (${clean(example.intent) || 'geral'} / ${clean(example.stage) || 'geral'}):`,
      `Cliente: ${clean(example.user_message)}`,
      `PetBot: ${clean(example.ideal_reply)}`,
      clean(example.notes) ? `Notas: ${clean(example.notes)}` : null,
    ].filter(Boolean).join('\n'))
    .join('\n---\n')
}

async function loadConversationExamples(
  supabase: SupabaseClient,
  moduleId: string,
  tenantId: string,
  message: string,
  intent: string,
): Promise<string> {
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
    return ''
  }

  const terms = buildSearchTerms(message)
  const ranked = ((data || []) as LooseRecord[])
    .map((example) => ({
      example,
      score: scoreConversationExample(example, terms, intent),
    }))
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score > 0)
    .map((item) => item.example)

  const selected = ranked.length > 0 ? ranked : ((data || []) as LooseRecord[]).slice(0, 2)
  return buildExamplesContext(selected)
}

async function createConfirmedPetshopOrder(
  supabase: SupabaseClient,
  session: ChatSession,
  context: StoreContext,
  args: LooseRecord = {},
) {
  const sessionContext = parseJsonObject(session.context)
  if (sessionContext.last_sale_id) {
    return {
      sale_id: sessionContext.last_sale_id,
      order_id: sessionContext.last_order_id || null,
      appointment_id: sessionContext.last_appointment_id || null,
      total: Number(sessionContext.last_total || 0),
      duplicated: true,
    }
  }

  const customer = await ensureCustomerProfile(supabase, session, args)
  const items = Array.isArray(args.items) ? args.items as LooseRecord[] : []
  if (!items.length) throw new Error('Pedido sem itens para registrar.')

  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 1) * Number(item.unit_price || 0), 0)
  const deliveryFee = args.fulfillment_type === 'entrega' ? Number(context.deliveryFee ?? DEFAULT_DELIVERY_FEE) : 0
  const providedTotal = Number(args.total || 0)
  const total = args.fulfillment_type === 'entrega'
    ? Number((subtotal + deliveryFee).toFixed(2))
    : Number((providedTotal || subtotal).toFixed(2))
  const orderType = args.order_type === 'produto' ? 'entrega' : 'servico'
  const fulfillmentType = args.order_type === 'produto'
    ? (args.fulfillment_type === 'retirada' ? 'balcao' : 'entrega')
    : 'servico'

  const notes = [
    'Origem: PetBot WhatsApp',
    `Sessao: ${session.id}`,
    clean(args.notes),
    args.fulfillment_type === 'retirada' ? 'Retirada na loja' : null,
    clean(args.delivery_reference) ? `Referencia: ${clean(args.delivery_reference)}` : null,
    Number(args.change_for || 0) > 0 ? `Troco para R$ ${Number(args.change_for).toFixed(2)}` : null,
  ].filter(Boolean).join(' | ')

  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .insert({
      tenant_id: session.tenant_id,
      module_id: session.module_id,
      client_id: customer.client?.id || null,
      customer_name: clean(args.customer_name) || clean(customer.client?.name) || session.customer_name || 'Cliente',
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
    product_id: isUuid(item.product_id) ? clean(item.product_id) : null,
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

  let appointment: LooseRecord | null = null
  if (args.order_type !== 'produto' && clean(args.scheduled_at)) {
    const { data, error } = await supabase
      .from('appointments')
      .insert({
        tenant_id: session.tenant_id,
        module_id: session.module_id,
        client_id: customer.client?.id || null,
        pet_id: customer.client?.id || null,
        service_type: clean(args.service_type) || clean(args.order_type),
        scheduled_at: clean(args.scheduled_at),
        duration_min: 60,
        price: total,
        status: 'agendado',
        source: 'whatsapp',
        customer_name: clean(args.customer_name) || clean(customer.client?.name) || session.customer_name || 'Cliente',
        customer_phone: customer.phone,
        description: notes,
        notes,
      })
      .select('id,scheduled_at')
      .single()
    if (error) throw new Error(`Falha ao registrar agendamento: ${error.message}`)
    appointment = data as LooseRecord
  }

  const orderPayload = {
    tenant_id: session.tenant_id,
    module_id: session.module_id,
    sale_id: sale.id,
    client_id: customer.client?.id || null,
    session_id: session.id,
    source: 'whatsapp',
    order_type: orderType,
    status: orderType === 'servico' ? 'agendado' : 'separacao',
    scheduled_for: appointment?.scheduled_at || null,
    delivery_address: args.fulfillment_type === 'entrega' ? clean(args.delivery_address) || clean(customer.client?.address) || null : null,
    delivery_neighborhood: args.fulfillment_type === 'entrega' ? clean(args.delivery_neighborhood) || clean(customer.client?.neighborhood) || null : null,
    delivery_city: args.fulfillment_type === 'entrega' ? clean(args.delivery_city) || clean(customer.client?.city) || null : null,
    contact_phone: customer.phone,
    notes,
  }

  const initialOrderResult = await supabase
    .from('service_delivery_orders')
    .update(orderPayload)
    .eq('sale_id', sale.id)
    .select('id')
    .maybeSingle()
  let order = initialOrderResult.data as LooseRecord | null
  let orderError = initialOrderResult.error

  if (!order && !orderError) {
    const insertedOrder = await supabase
      .from('service_delivery_orders')
      .insert(orderPayload)
      .select('id')
      .single()
    order = insertedOrder.data as LooseRecord | null
    orderError = insertedOrder.error
  }

  if (orderError && String(orderError.message || '').includes('duplicate')) {
    const updatedOrder = await supabase
      .from('service_delivery_orders')
      .update({
        status: orderPayload.status,
        scheduled_for: orderPayload.scheduled_for,
        delivery_address: orderPayload.delivery_address,
        delivery_neighborhood: orderPayload.delivery_neighborhood,
        delivery_city: orderPayload.delivery_city,
        contact_phone: orderPayload.contact_phone,
        notes: orderPayload.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('sale_id', sale.id)
      .select('id')
      .maybeSingle()
    order = updatedOrder.data as LooseRecord | null
    orderError = updatedOrder.error
  }

  if (orderError) {
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
        last_total: total,
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

async function executePetbotTool(
  supabase: SupabaseClient,
  session: ChatSession,
  context: StoreContext,
  toolCall: LooseRecord,
) {
  const name = clean(record(toolCall.function).name)
  let args: LooseRecord = {}
  try {
    args = JSON.parse(clean(record(toolCall.function).arguments) || '{}')
  } catch {
    args = {}
  }

  if (name === 'update_customer_profile') {
    const customer = await ensureCustomerProfile(supabase, session, args)
    return {
      ok: true,
      action: name,
      client_id: customer.client?.id || null,
      name_confirmed: customer.isKnown,
    }
  }

  if (name === 'create_confirmed_petshop_order') {
    return {
      ok: true,
      action: name,
      ...await createConfirmedPetshopOrder(supabase, session, context, args),
    }
  }

  return { ok: false, error: `Ferramenta desconhecida: ${name}` }
}

async function saveSatisfactionRating(supabase: SupabaseClient, sessionId: string, rating: number) {
  const closedAt = new Date().toISOString()
  const { error } = await supabase
    .from('chat_sessions')
    .update({
      csat_score: rating,
      status: 'closed',
      intent: 'satisfacao_coletada',
      closed_at: closedAt,
      last_message_at: closedAt,
    })
    .eq('id', sessionId)

  if (error) fail(500, 'Unable to save satisfaction rating.')
}

async function loadStoreContext(
  supabase: SupabaseClient,
  session: ChatSession,
  latestUserMessage: string,
  env: WebhookEnv,
  history: Array<{ role: string; content: string }> = [],
): Promise<StoreContext> {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  const catalogSearchText = buildCatalogSearchText(history, latestUserMessage)
  const terms = buildSearchTerms(catalogSearchText)
  const intent = detectConversationIntent(latestUserMessage)

  let productsQuery = supabase
    .from('products')
    .select('name, category, price, stock_quantity, active')
    .eq('tenant_id', session.tenant_id)
    .eq('module_id', session.module_id)
    .eq('active', true)
    .limit(12)

  if (terms.length > 0) {
    const orQuery = terms
      .flatMap((term) => {
        const escaped = escapeIlike(term)
        return [`name.ilike.%${escaped}%`, `category.ilike.%${escaped}%`]
      })
      .join(',')
    productsQuery = productsQuery.or(orQuery)
  }

  const customer = await ensureCustomerProfile(supabase, session)

  const [settingsResult, companyResult, productsResult, appointmentsResult, examplesContext] = await Promise.all([
    supabase
      .from('settings')
      .select('*')
      .eq('tenant_id', session.tenant_id)
      .eq('module_id', session.module_id)
      .maybeSingle(),
    supabase
      .from('companies')
      .select('name, bot_name, model_name, temperature')
      .eq('tenant_id', session.tenant_id)
      .eq('module_id', session.module_id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    productsQuery,
    supabase
      .from('appointments')
      .select('service_type, scheduled_at, status, price')
      .eq('tenant_id', session.tenant_id)
      .eq('module_id', session.module_id)
      .gte('scheduled_at', `${today}T00:00:00-03:00`)
      .lte('scheduled_at', `${end}T23:59:59-03:00`)
      .order('scheduled_at')
      .limit(40),
    loadConversationExamples(supabase, session.module_id, session.tenant_id, latestUserMessage, intent),
  ])

  let productRows = productsResult.data || []
  if (!productsResult.error && productRows.length === 0 && terms.length > 0) {
    const fallback = await supabase
      .from('products')
      .select('name, category, price, stock_quantity, active')
      .eq('tenant_id', session.tenant_id)
      .eq('module_id', session.module_id)
      .eq('active', true)
      .gt('stock_quantity', 0)
      .order('stock_quantity', { ascending: false })
      .limit(8)
    productRows = fallback.data || []
  }

  return {
    storeName: clean(settingsResult.data?.store_name) || clean(companyResult.data?.name) || 'YuiSync',
    storePhone: clean(settingsResult.data?.store_phone),
    storeAddress: clean(settingsResult.data?.store_address),
    storeNeighborhood: clean(settingsResult.data?.store_neighborhood),
    storeCity: clean(settingsResult.data?.store_city),
    botPrompt: clean(settingsResult.data?.bot_prompt),
    deliveryFee: Number(settingsResult.data?.delivery_fee ?? DEFAULT_DELIVERY_FEE),
    customerContext: buildCustomerContext(customer),
    examplesContext,
    modelName: clean(companyResult.data?.model_name) || env.openAiModel,
    temperature: Number(companyResult.data?.temperature ?? 0.2),
    productContext: productsResult.error ? 'Catalogo indisponivel no momento.' : buildProductsContext(selectRelevantProducts(productRows, catalogSearchText)),
    appointmentsContext: appointmentsResult.error ? 'Agenda indisponivel no momento.' : buildAppointmentsContext(appointmentsResult.data),
  }
}

async function loadRecentHistory(supabase: SupabaseClient, sessionId: string) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, metadata, tokens_used, sent_at')
    .eq('session_id', sessionId)
    .order('sent_at', { ascending: false })
    .limit(40)

  if (error) fail(500, 'Unable to load conversation history.')

  return (data || []).reverse().map((message) => ({
    ...message,
    role: message.role === 'assistant' || message.role === 'human_agent' ? 'assistant' : 'user',
    content: String(message.content || ''),
    metadata: record(message.metadata),
  }))
}

async function hasNewerIncomingMessage(
  supabase: SupabaseClient,
  sessionId: string,
  savedMessage: SavedMessage,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, sent_at')
    .eq('session_id', sessionId)
    .eq('role', 'user')
    .gt('sent_at', savedMessage.sent_at)
    .order('sent_at', { ascending: true })
    .limit(1)

  if (error) return false
  return Boolean(data?.length)
}

function messageTimeMs(message: { sent_at?: string }) {
  const parsed = Date.parse(String(message.sent_at || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function buildDebouncedUserMessage(
  history: Array<{ role: string; content: string; sent_at?: string; metadata?: LooseRecord }>,
  event: WhatsappEvent,
  env: WebhookEnv,
) {
  const latestUserAt = history
    .filter((message) => message.role === 'user')
    .reduce((max, message) => Math.max(max, messageTimeMs(message)), 0)

  const windowMs = Math.max(env.whatsappReplyDebounceMs * 3, 30_000)
  const recentUserMessages = history.filter((message) => (
    message.role === 'user'
    && message.content
    && latestUserAt - messageTimeMs(message) <= windowMs
  ))

  if (!recentUserMessages.length) return event.text

  const lastAssistantIndex = history.reduce((lastIndex, message, index) => (
    message.role === 'assistant' ? index : lastIndex
  ), -1)

  const messagesAfterLastAssistant = recentUserMessages.filter((message) => history.indexOf(message) > lastAssistantIndex)
  const source = messagesAfterLastAssistant.length ? messagesAfterLastAssistant : recentUserMessages.slice(-3)

  return source
    .map((message) => clean(message.content))
    .filter(Boolean)
    .join('\n')
    || event.text
}

function buildSystemPrompt(context: StoreContext): string {
  const customInstructions = clean(context.botPrompt)
  const storeLocation = [
    context.storeAddress,
    context.storeNeighborhood,
    context.storeCity,
  ].filter(Boolean).join(' - ') || 'Nao informado'

  return [
    `Voce e o atendente virtual oficial de ${context.storeName || 'esta loja'}.`,
    'Responda em portugues do Brasil, com tom cordial, claro e objetivo.',
    'Use somente os dados confirmados no contexto operacional abaixo.',
    'Nunca invente preco, estoque, horario, disponibilidade, endereco, politica comercial ou procedimento veterinario.',
    'Se o cliente pedir algo fora do contexto, peca os dados necessarios ou encaminhe para atendimento humano.',
    'Para agendamentos, nao confirme disponibilidade sem haver horario confirmado no contexto de agenda.',
    'Nunca aplique desconto. Se pedirem desconto, responda gentilmente: "Infelizmente nao conseguimos aplicar desconto nesse pedido."',
    'Mantenha respostas curtas e naturais para conversa de WhatsApp.',
    'Seu foco e vender, mas sem pressionar: se o cliente recusar o upsell, continue o pedido normalmente.',
    'Sempre pesquise no contexto do banco abaixo. Se o dado nao estiver no contexto, diga que vai consultar a equipe.',
    'Se o cliente ainda nao tem nome confirmado, peca o nome antes de qualquer triagem ou oferta, inclusive em saudacao simples.',
    '',
    'Fluxo obrigatorio:',
    '1. Saudacao + nome; 2. Intencao; 3. dados minimos do pet; 4. opcoes/horarios reais; 5. valor antes de confirmar; 6. um upsell; 7. resumo parcial; 8. pagamento; 9. troco se dinheiro; 10. entrega/retirada; 11. endereco se entrega; 12. resumo final; 13. confirmar separacao/agendamento; 14. avaliacao 0-10.',
    'Se o dado ja estiver no cadastro/contexto, nao pergunte de novo.',
    'Dados minimos produto: cliente, especie, porte/peso ou categoria, marca se mencionada. Para produto, nome do pet e opcional; nao pergunte nome do pet antes de especie/porte.',
    'Dados minimos banho/tosa: cliente, nome do pet, especie, porte/raca e horario real disponivel.',
    'Dados minimos veterinaria: cliente, nome do pet, especie/tamanho, problema principal e horario real disponivel.',
    'Nunca assuma especie. Se o cliente nao disse cachorro/gato, pergunte. Nao diga "e cachorro, certo?".',
    'Upsell: ofereca 1 item ou servico relacionado; se o cliente recusar, continue o pedido normalmente.',
    'Se produto sem estoque, mostre alternativas similares do contexto. Se horario indisponivel, ofereca os proximos horarios disponiveis do contexto.',
    'Depois do cliente confirmar o resumo final, use a ferramenta create_confirmed_petshop_order antes de responder a avaliacao.',
    'Trate "sim", "s", "sm", "confirmo", "pode finalizar" e equivalentes como confirmacao final quando o resumo final ja foi exibido.',
    'Depois de responder "Pedido confirmado", se o cliente enviar uma nota de 0 a 10, nao registre pedido de novo; apenas agradeca a avaliacao.',
    'Faca uma pergunta operacional por vez: primeiro pagamento, depois entrega/retirada, depois endereco se for entrega.',
    'Se o cliente responder pagamento e entrega juntos, aceite os dois e siga para endereco.',
    'Entrega: informe explicitamente a taxa configurada antes do resumo final. Some a taxa ao total final. Nunca deixe a taxa de entrega fora do total.',
    'Endereco de entrega minimo: rua/avenida, numero, bairro e ponto de referencia. Se faltar bairro ou referencia, peca o dado faltante antes de confirmar.',
    '',
    'Configuracao customizada deste tenant:',
    customInstructions || 'Nenhuma instrucao customizada cadastrada.',
    '',
    'Contexto operacional do banco de dados:',
    `Loja: ${context.storeName}`,
    `Telefone da loja: ${context.storePhone || 'Nao informado'}`,
    `Endereco: ${storeLocation}`,
    `Taxa de entrega: R$ ${Number(context.deliveryFee ?? DEFAULT_DELIVERY_FEE).toFixed(2)}`,
    '',
    'Cliente atual:',
    context.customerContext,
    '',
    'Estoque relevante:',
    context.productContext,
    '',
    'Agenda dos proximos dias:',
    context.appointmentsContext,
    '',
    'Exemplos aprovados de conversa:',
    context.examplesContext || 'Nenhum exemplo cadastrado para este contexto.',
    'Use os exemplos apenas como modelo de estilo e fluxo. Nunca copie precos, estoque, horarios, nomes ou enderecos dos exemplos.',
    '',
    'Formato do resumo parcial:',
    '**Pedido em andamento:**\n• Cliente: [NOME]\n• Pet: [NOME/ESPECIE/PORTE]\n• [PRODUTO/SERVICO]: [DETALHE]\n• Extra: [UPSELL OU "nao adicionado"]\n• Total parcial: R$ [VALOR]\n• Pagamento: aguardando\n• Entrega/retirada: aguardando',
    '',
    'Pagamento: pergunte exatamente "Qual forma prefere? pix, dinheiro ou cartão?"',
    'Entrega/retirada: pergunte exatamente "Será entrega ou retirada na loja?"',
    'Se for entrega, antes do resumo final diga: "A taxa de entrega é R$ [TAXA]. O total com entrega fica R$ [TOTAL]."',
    'Resumo final de entrega deve mostrar subtotal, taxa de entrega e total final. Termine perguntando "Confirma para separação?" ou, para servico, "Confirma o agendamento?"',
    'Apos confirmar e registrar com a ferramenta, responda: "Pedido confirmado! 🎉\\n\\nDe 0 a 10, como avalia o atendimento?"',
  ].join('\n')
}

async function callOpenAi(
  supabase: SupabaseClient,
  session: ChatSession,
  context: StoreContext,
  history: Array<{ role: string; content: string }>,
  env: WebhookEnv,
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), env.openAiTimeoutMs)

  try {
    const messages = [
      { role: 'system', content: buildSystemPrompt(context) },
      ...history,
    ]

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: context.modelName || env.openAiModel,
        temperature: Number.isFinite(context.temperature) ? context.temperature : 0.2,
        max_tokens: 500,
        messages,
        tools: PETBOT_TOOLS,
        tool_choice: 'auto',
      }),
    })

    const payload = await response.json().catch(() => ({})) as LooseRecord
    if (!response.ok) {
      const detail = clean(record(payload.error).message) || `HTTP ${response.status}`
      fail(502, `OpenAI request failed: ${detail}`)
    }

    let assistantMessage = record(payload.choices?.[0]?.message)
    const toolCalls = Array.isArray(assistantMessage.tool_calls) ? assistantMessage.tool_calls as LooseRecord[] : []

    if (toolCalls.length > 0) {
      const toolResults = []
      for (const toolCall of toolCalls) {
        try {
          toolResults.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: record(toolCall.function).name,
            content: JSON.stringify(await executePetbotTool(supabase, session, context, toolCall)),
          })
        } catch (toolError) {
          toolResults.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: record(toolCall.function).name,
            content: JSON.stringify({ ok: false, error: toolError instanceof Error ? toolError.message : String(toolError) }),
          })
        }
      }

      const followUp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.openAiApiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: context.modelName || env.openAiModel,
          temperature: Number.isFinite(context.temperature) ? context.temperature : 0.2,
          max_tokens: 500,
          messages: [
            ...messages,
            assistantMessage,
            ...toolResults,
          ],
        }),
      })

      const followPayload = await followUp.json().catch(() => ({})) as LooseRecord
      if (!followUp.ok) {
        const detail = clean(record(followPayload.error).message) || `HTTP ${followUp.status}`
        fail(502, `OpenAI request failed: ${detail}`)
      }

      assistantMessage = record(followPayload.choices?.[0]?.message)
      payload.usage = followPayload.usage || payload.usage
    }

    const reply = clean(assistantMessage.content)
    if (!reply) fail(502, 'OpenAI response came back empty.')

    return {
      reply,
      tokensUsed: Number(payload.usage?.total_tokens || 0),
    }
  } catch (error) {
    if (error instanceof WebhookHttpError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      fail(504, 'OpenAI response timed out.')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function saveAssistantMessage(
  supabase: SupabaseClient,
  sessionId: string,
  event: WhatsappEvent,
  content: string,
  tokensUsed = 0,
  metadata: LooseRecord = {},
): Promise<SavedMessage> {
  const sentAt = new Date().toISOString()
  const inserted = await supabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      role: 'assistant',
      content,
      tokens_used: tokensUsed,
      sent_at: sentAt,
      metadata: {
        ...metadata,
        channel: 'whatsapp',
        delivery_status: 'pending',
        whatsapp_reply_to_message_id: event.messageId,
        whatsapp_phone_number_id: event.phoneNumberId,
      },
    })
    .select('id, role, content, metadata, tokens_used, sent_at')
    .single()

  if (inserted.error) fail(500, 'Unable to save assistant response.')
  await touchSession(supabase, sessionId, sentAt)
  return inserted.data as SavedMessage
}

async function updateMessageMetadata(supabase: SupabaseClient, message: SavedMessage, metadata: LooseRecord) {
  await supabase
    .from('chat_messages')
    .update({ metadata })
    .eq('id', message.id)
}

async function sendWhatsappText(env: WebhookEnv, event: WhatsappEvent, message: SavedMessage) {
  const text = clean(message.content).slice(0, MAX_WHATSAPP_TEXT_CHARS)
  if (!event.from || !text) fail(400, 'WhatsApp recipient and text are required.')

  const url = `${GRAPH_BASE_URL}/${env.whatsappGraphVersion}/${encodeURIComponent(env.whatsappPhoneNumberId)}/messages`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.whatsappAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: event.from,
      type: 'text',
      context: event.messageId ? { message_id: event.messageId } : undefined,
      text: {
        preview_url: false,
        body: text,
      },
    }),
  })

  const payload = await response.json().catch(() => ({})) as LooseRecord
  if (!response.ok) {
    const detail = clean(record(payload.error).message) || `HTTP ${response.status}`
    fail(502, `Unable to send WhatsApp message: ${detail}`)
  }

  return payload
}

async function sendAndMarkDelivered(
  supabase: SupabaseClient,
  env: WebhookEnv,
  event: WhatsappEvent,
  message: SavedMessage,
) {
  try {
    const delivery = await sendWhatsappText(env, event, message)
    await updateMessageMetadata(supabase, message, {
      ...(message.metadata || {}),
      channel: 'whatsapp',
      delivery_status: 'sent',
      whatsapp_outbound_message_id: delivery.messages?.[0]?.id || null,
      whatsapp_delivery_payload: delivery,
    })
  } catch (error) {
    await updateMessageMetadata(supabase, message, {
      ...(message.metadata || {}),
      channel: 'whatsapp',
      delivery_status: 'failed',
      delivery_error: error instanceof Error ? error.message : 'Unknown WhatsApp delivery error.',
    })
    throw error
  }
}

async function processWhatsappEvent(supabase: SupabaseClient, env: WebhookEnv, event: WhatsappEvent) {
  if (!event.from || !event.messageId) {
    return { ignored: true, reason: 'missing_sender_or_message_id' }
  }

  if (event.phoneNumberId && event.phoneNumberId !== env.whatsappPhoneNumberId) {
    return { ignored: true, reason: 'phone_number_mismatch' }
  }

  const session = await getOrCreateSession(supabase, env, event)
  const existingIncoming = await findIncomingMessage(supabase, session.id, event.messageId)
  if (existingIncoming) {
    return { sessionId: session.id, duplicate: true }
  }

  const incomingContent = event.isSupportedText
    ? event.text
    : `[Mensagem ${event.type || 'nao textual'} recebida no WhatsApp]`

  const savedIncoming = await saveIncomingMessage(supabase, session.id, event, incomingContent)
  await touchSession(supabase, session.id)

  if (await hasAssistantReply(supabase, session.id, event.messageId)) {
    return { sessionId: session.id, duplicate: true }
  }

  if (!event.isSupportedText) {
    if (session.status === 'human') return { sessionId: session.id, handedToHuman: true, unsupported: true }

    const fallback = 'Recebi sua mensagem, mas por enquanto consigo responder melhor por texto aqui. Pode me enviar sua duvida em texto?'
    const savedFallback = await saveAssistantMessage(supabase, session.id, event, fallback, 0)
    await sendAndMarkDelivered(supabase, env, event, savedFallback)
    return { sessionId: session.id, unsupported: true }
  }

  const rating = parseRating(event.text)
  if (rating !== null && hasConfirmedOrderContext(session)) {
    await saveSatisfactionRating(supabase, session.id, rating)
    const reply = `Obrigado pela nota ${rating}! Atendimento encerrado.`
    const savedRatingReply = await saveAssistantMessage(supabase, session.id, event, reply, 0, { csat_score: rating })
    await sendAndMarkDelivered(supabase, env, event, savedRatingReply)
    return { sessionId: session.id, ai: true, intent: 'satisfacao_coletada', csatScore: rating }
  }

  if (session.status === 'human') {
    return { sessionId: session.id, handedToHuman: true }
  }

  if (env.whatsappReplyDebounceMs > 0) {
    await sleep(env.whatsappReplyDebounceMs)

    if (await hasNewerIncomingMessage(supabase, session.id, savedIncoming)) {
      return { sessionId: session.id, debounced: true }
    }

    if (await hasAssistantReply(supabase, session.id, event.messageId)) {
      return { sessionId: session.id, duplicate: true }
    }
  }

  const history = await loadRecentHistory(supabase, session.id)
  const debouncedMessage = buildDebouncedUserMessage(history, event, env)
  const context = await loadStoreContext(supabase, session, debouncedMessage, env, history)
  const completion = await callOpenAi(supabase, session, context, history, env)
  const savedReply = await saveAssistantMessage(supabase, session.id, event, completion.reply, completion.tokensUsed)
  await sendAndMarkDelivered(supabase, env, event, savedReply)

  const intent = detectConversationIntent(debouncedMessage)
  await supabase
    .from('chat_sessions')
    .update({
      intent,
      last_message_at: new Date().toISOString(),
    })
    .eq('id', session.id)

  return { sessionId: session.id, ai: true, intent }
}

async function handleGet(req: IncomingMessage, res: ServerResponse) {
  const verifyToken = requireEnv('WHATSAPP_VERIFY_TOKEN')
  const url = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`)
  const mode = url.searchParams.get('hub.mode') || ''
  const token = url.searchParams.get('hub.verify_token') || ''
  const challenge = url.searchParams.get('hub.challenge') || ''

  if (mode === 'subscribe' && token && token === verifyToken && challenge) {
    sendText(res, 200, challenge)
    return
  }

  fail(403, 'WhatsApp webhook verify token rejected.')
}

async function handlePost(req: IncomingMessage, res: ServerResponse) {
  const env = getWebhookEnv()
  const { body, rawBody } = await readRequestBody(req)

  assertWebhookSignature(env, rawBody, req.headers)
  validateMetaPayload(body, env)

  const events = extractWhatsappEvents(body)
  if (events.length === 0) {
    sendJson(res, 200, { ok: true, processed: 0, summary: summarizeWebhook(body) })
    return
  }

  const supabase = createAdminClient(env)
  const results = []

  for (const event of events) {
    try {
      results.push(await processWhatsappEvent(supabase, env, event))
    } catch (error) {
      results.push({
        error: error instanceof Error ? error.message : 'Unknown WhatsApp processing error.',
        messageId: event.messageId,
      })
    }
  }

  sendJson(res, 200, { ok: true, processed: results.length, results })
}

export async function handleWhatsappWebhook(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method === 'GET') {
      await handleGet(req, res)
      return
    }

    if (req.method === 'POST') {
      await handlePost(req, res)
      return
    }

    res.setHeader('Allow', 'GET, POST')
    sendJson(res, 405, { error: 'Method not allowed.' })
  } catch (error) {
    const status = error instanceof WebhookHttpError ? error.status : 500
    const message = error instanceof Error ? error.message : 'Unexpected webhook error.'
    sendJson(res, status, { error: message })
  }
}
