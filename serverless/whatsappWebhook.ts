import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { runOrderBotTurn } from '../server/lib/orderBot/orchestrator.js'

const DEFAULT_MODULE_ID = 'petshop'
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'
const DEFAULT_OPENAI_TIMEOUT_MS = 12_000
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
])

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
  companyPrompt: string
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
    .select('id, tenant_id, module_id, customer_phone, customer_name, status')
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
      .select('id, tenant_id, module_id, customer_phone, customer_name, status')
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
    .select('id, tenant_id, module_id, customer_phone, customer_name, status')
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

function buildSearchTerms(message: string): string[] {
  return normalizeSearchText(message)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !PRODUCT_STOP_WORDS.has(term))
    .slice(0, 6)
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
  if (!appointments?.length) return 'Agenda de hoje sem horarios ocupados confirmados no contexto.'

  return appointments
    .map((appointment) => {
      const time = new Date(appointment.scheduled_at).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      })
      return `${time} - ${clean(appointment.service_type) || 'Atendimento'} (${clean(appointment.status) || 'status nao informado'})`
    })
    .join('\n')
    .slice(0, 3000)
}

async function loadStoreContext(
  supabase: SupabaseClient,
  session: ChatSession,
  latestUserMessage: string,
  env: WebhookEnv,
): Promise<StoreContext> {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

  const [settingsResult, companyResult, productsResult, appointmentsResult] = await Promise.all([
    supabase
      .from('settings')
      .select('store_name')
      .eq('tenant_id', session.tenant_id)
      .eq('module_id', session.module_id)
      .maybeSingle(),
    supabase
      .from('companies')
      .select('name, bot_name, model_name, temperature, system_prompt')
      .eq('tenant_id', session.tenant_id)
      .eq('module_id', session.module_id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('products')
      .select('name, category, description, species_target, price, stock_quantity, active')
      .eq('tenant_id', session.tenant_id)
      .eq('module_id', session.module_id)
      .eq('active', true)
      .order('stock_quantity', { ascending: false })
      .limit(120),
    supabase
      .from('appointments')
      .select('service_type, scheduled_at, status')
      .eq('tenant_id', session.tenant_id)
      .eq('module_id', session.module_id)
      .gte('scheduled_at', `${today}T00:00:00-03:00`)
      .lte('scheduled_at', `${today}T23:59:59-03:00`)
      .in('status', ['agendado', 'confirmado', 'em_andamento'])
      .order('scheduled_at')
      .limit(20),
  ])

  return {
    storeName: clean(settingsResult.data?.store_name) || clean(companyResult.data?.name) || 'Petshop Quatro Patas',
    companyPrompt: clean(companyResult.data?.system_prompt),
    modelName: clean(companyResult.data?.model_name) || env.openAiModel,
    temperature: Number(companyResult.data?.temperature ?? 0.2),
    productContext: productsResult.error
      ? 'Catalogo indisponivel no momento.'
      : buildProductsContext(selectRelevantProducts(productsResult.data, latestUserMessage)),
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

function buildSystemPrompt(context: StoreContext): string {
  const basePrompt = context.companyPrompt || [
    `Voce e o atendente virtual oficial do ${context.storeName}.`,
    'Atenda clientes do Petshop Quatro Patas em portugues do Brasil.',
    'Seja cordial, objetivo e prestativo. Responda como atendimento de WhatsApp.',
  ].join('\n')

  return [
    basePrompt,
    '',
    'Regras de producao:',
    '- Use somente informacoes confirmadas no contexto abaixo.',
    '- Nao invente precos, horarios, estoque, procedimentos veterinarios ou promessas de disponibilidade.',
    '- Se o catalogo listar produtos, cite nomes, precos e estoque desses itens quando o cliente perguntar sobre produtos.',
    '- Nao diga que nao ha produto ou racao quando houver itens listados no catalogo/estoque relevante.',
    '- Quando faltar dado essencial, peca o dado de forma simples.',
    '- Se o cliente pedir algo sensivel ou fora do contexto, encaminhe para atendimento humano.',
    '- Mantenha respostas curtas, naturais e adequadas para WhatsApp.',
    '',
    'Contexto do Petshop Quatro Patas:',
    `Loja: ${context.storeName}`,
    '',
    'Catalogo/estoque relevante:',
    context.productContext,
    '',
    'Agenda de hoje:',
    context.appointmentsContext,
  ].join('\n')
}

async function callOpenAi(context: StoreContext, history: Array<{ role: string; content: string }>, env: WebhookEnv) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), env.openAiTimeoutMs)

  try {
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
        messages: [
          { role: 'system', content: buildSystemPrompt(context) },
          ...history,
        ],
      }),
    })

    const payload = await response.json().catch(() => ({})) as LooseRecord
    if (!response.ok) {
      const detail = clean(record(payload.error).message) || `HTTP ${response.status}`
      fail(502, `OpenAI request failed: ${detail}`)
    }

    const reply = clean(payload.choices?.[0]?.message?.content)
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

  await saveIncomingMessage(supabase, session.id, event, incomingContent)
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

  if (session.status === 'human') {
    return { sessionId: session.id, handedToHuman: true }
  }

  const history = await loadRecentHistory(supabase, session.id)
  const botTurn = await runOrderBotTurn({
    supabase,
    chatSession: session,
    message: event.text,
    recentMessages: history,
  })

  const savedReply = await saveAssistantMessage(supabase, session.id, event, botTurn.reply, 0, botTurn.metadata)
  await sendAndMarkDelivered(supabase, env, event, savedReply)

  await supabase
    .from('chat_sessions')
    .update({
      intent: botTurn.intent,
      ...(!session.customer_name && botTurn.orderSession?.customerName ? { customer_name: botTurn.orderSession.customerName } : {}),
      last_message_at: new Date().toISOString(),
    })
    .eq('id', session.id)

  return { sessionId: session.id, ai: true, intent: botTurn.intent }
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
