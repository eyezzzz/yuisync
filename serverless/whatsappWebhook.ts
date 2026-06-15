import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
// @ts-ignore Shared runtime guard is authored as ESM JavaScript for the Node API too.
import * as petbotGuard from '../server/lib/petbotGuard.js'

const {
  buildPetbotConfirmationReply,
  buildPetbotSearchText,
  markPetbotOrderError,
  markPetbotOrderSaved,
  mergePetbotContext,
  recoverPetbotContextFromHistory,
  runPetbotGuard,
  snapshotPetbotState,
} = petbotGuard as any
// @ts-ignore Shared AI helper is authored as ESM JavaScript for the Node API too.
import {
  buildInterpretedPetbotSearchText,
  interpretPetbotMessageWithLlm,
  redraftPetbotReplyWithLlm,
} from '../server/lib/petbotAi.js'
// @ts-ignore Shared catalog helper is authored as ESM JavaScript for the Node API too.
import { detectCatalogRequest, rankCatalogProducts } from '../server/lib/petbotCatalog.js'

const DEFAULT_MODULE_ID = 'petshop'
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'
const DEFAULT_OPENAI_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe'
const DEFAULT_OPENAI_TIMEOUT_MS = 12_000
const DEFAULT_WHATSAPP_REPLY_DEBOUNCE_MS = 0
const MAX_BLOCKING_WHATSAPP_REPLY_DEBOUNCE_MS = 1_500
const GRAPH_BASE_URL = 'https://graph.facebook.com'
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024
const MAX_WHATSAPP_TEXT_CHARS = 4096
const RECENT_HISTORY_LIMIT = 14
const PRODUCT_CONTEXT_LIMIT = 18
const PRODUCT_CATALOG_CACHE_MS = 5 * 60 * 1000
const STORE_CONTEXT_CACHE_MS = 60 * 1000
const APPOINTMENTS_CACHE_MS = 30 * 1000
const MAX_CACHED_PRODUCTS = 1500
const CLIENT_PROFILE_SELECT = 'id,name,phone,address,neighborhood,city,details'
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
  'ela',
  'ele',
  'ja',
  'meu',
  'minha',
  'nao',
  'tarde',
  'noite',
  'pra',
  'pro',
  'racao',
  'racoes',
  'sei',
  'ser',
  'seu',
  'sua',
  'um',
  'uma',
])
const DEFAULT_DELIVERY_FEE = 10
const AVAILABLE_STATUSES = new Set(['available', 'livre', 'disponivel', 'aberto', 'open'])
const BUSY_STATUSES = new Set(['agendado', 'confirmado', 'em_andamento', 'booked', 'ocupado', 'blocked', 'bloqueado'])
const KNOWN_BREED_TERMS = new Set([
  'akita',
  'beagle',
  'border',
  'boxer',
  'buldogue',
  'bulldog',
  'chihuahua',
  'collie',
  'dachshund',
  'doberman',
  'golden',
  'husky',
  'labrador',
  'lhasa',
  'maltese',
  'pastor',
  'pinscher',
  'pitbull',
  'poodle',
  'pug',
  'rottweiler',
  'schnauzer',
  'shih',
  'spitz',
  'tzu',
  'vira',
  'york',
  'yorkshire',
])
const AGE_CATEGORY_TERMS = new Set([
  'adulto',
  'adultos',
  'adulta',
  'adultas',
  'filhote',
  'filhotes',
  'puppy',
  'junior',
  'senior',
  'idoso',
  'castrado',
  'castrada',
  'castrados',
  'indoor',
  'light',
])
const SIZE_CATEGORY_TERMS = new Set([
  'mini',
  'pequeno',
  'pequenos',
  'pequena',
  'pequenas',
  'medio',
  'medios',
  'media',
  'medias',
  'grande',
  'grandes',
  'gigante',
  'gigantes',
])
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
        required: ['customer_name', 'order_type', 'items', 'total'],
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

const productCatalogCache = new Map<string, { loadedAt: number; value: LooseRecord[] }>()
const settingsCache = new Map<string, { loadedAt: number; value: LooseRecord }>()
const appointmentsCache = new Map<string, { loadedAt: number; value: LooseRecord[] }>()

type LooseRecord = Record<string, any>

type WebhookEnv = {
  supabaseUrl: string
  supabaseServiceRoleKey: string
  openAiApiKey: string
  openAiModel: string
  openAiTranscriptionModel: string
  openAiVisionModel: string
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
  media?: LooseRecord | null
  mediaProcessing?: LooseRecord | null
}

type ChatSession = {
  id: string
  tenant_id: string
  module_id: string
  customer_phone: string
  customer_name: string | null
  status: string
  client_id?: string | null
  context?: LooseRecord | null
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
  petTransportFee: number
  pixKey: string
  pixHolderName: string
  messageTemplates: LooseRecord
  petTransportOptions: LooseRecord[]
  customerContext: string
  examplesContext: string
  modelName: string
  temperature: number
  productContext: string
  appointmentsContext: string
  products: LooseRecord[]
  appointments: LooseRecord[]
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

function appointmentDateIso(row: LooseRecord = {}): string {
  if (row.service_date) return String(row.service_date).slice(0, 10)
  if (!row.scheduled_at) return ''
  return new Date(String(row.scheduled_at)).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

function appointmentTimeText(row: LooseRecord = {}): string {
  if (row.start_time) return String(row.start_time).slice(0, 5)
  if (!row.scheduled_at) return ''
  return new Date(String(row.scheduled_at)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

function normalizeAppointmentRows(rows: LooseRecord[] = []): LooseRecord[] {
  const byId = new Map<string, LooseRecord>()
  for (const row of rows || []) {
    if (!row) continue
    const date = appointmentDateIso(row)
    const time = appointmentTimeText(row)
    const scheduledAt = row.scheduled_at || (date && time ? `${date}T${time}:00-03:00` : null)
    byId.set(String(row.id || `${date}-${time}-${row.service_type}`), {
      ...row,
      scheduled_at: scheduledAt,
      service_date: row.service_date || date || null,
      start_time: row.start_time || (time ? `${time}:00` : null),
    })
  }
  return [...byId.values()].filter((row) => row.scheduled_at)
}

function appointmentDurationMs(row: LooseRecord = {}): number {
  const minutes = Number(row.duration_min || row.durationMin || 60)
  return Math.max(15, Number.isFinite(minutes) ? minutes : 60) * 60 * 1000
}

function appointmentStartMs(row: LooseRecord = {}): number | null {
  const scheduledAt = row.scheduled_at || normalizeAppointmentRows([row])[0]?.scheduled_at
  const time = scheduledAt ? new Date(String(scheduledAt)).getTime() : NaN
  return Number.isFinite(time) ? time : null
}

function appointmentsOverlap(left: LooseRecord = {}, right: LooseRecord = {}): boolean {
  const leftStart = appointmentStartMs(left)
  const rightStart = appointmentStartMs(right)
  if (leftStart === null || rightStart === null) return false
  return leftStart < rightStart + appointmentDurationMs(right)
    && rightStart < leftStart + appointmentDurationMs(left)
}

async function hasBusyAppointmentConflict(
  supabase: SupabaseClient,
  session: LooseRecord,
  scheduledAt: string,
  durationMin = 60,
): Promise<boolean> {
  const dateIso = appointmentDateIso({ scheduled_at: scheduledAt })
  if (!dateIso) return false
  const { data, error } = await supabase
    .from('appointments')
    .select('id,status,scheduled_at,service_date,start_time,duration_min')
    .eq('tenant_id', session.tenant_id)
    .eq('module_id', session.module_id)
    .gte('scheduled_at', `${dateIso}T00:00:00-03:00`)
    .lte('scheduled_at', `${dateIso}T23:59:59-03:00`)
    .limit(100)

  if (error) throw new Error(`Falha ao validar conflito de agenda: ${error.message}`)

  const candidate: LooseRecord = { scheduled_at: scheduledAt, duration_min: durationMin }
  return normalizeAppointmentRows((data || []) as LooseRecord[])
    .filter((row) => BUSY_STATUSES.has(clean(row.status).toLowerCase()))
    .some((row) => appointmentsOverlap(candidate, row))
}

function scopeCacheKey(moduleId: string, tenantId: string): string {
  return `${tenantId || ''}:${String(moduleId || '').toLowerCase()}`
}

async function cachedLoad<T>(
  cache: Map<string, { loadedAt: number; value: T }>,
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && now - cached.loadedAt < ttlMs) return cached.value

  try {
    const value = await loader()
    cache.set(key, { loadedAt: now, value })
    return value
  } catch (error) {
    if (cached) return cached.value
    throw error
  }
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

function hasPetbotState(context: unknown): boolean {
  const parsed = parseJsonObject(context)
  return Boolean(parsed.petbot && typeof parsed.petbot === 'object' && parsed.petbot.updatedAt)
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

function parseRegistrationUpdateFromMessage(message: unknown): LooseRecord {
  const text = clean(message)
  const details: LooseRecord = {}
  const document = text.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)?.[0] || ''
  const zip = text.match(/\b\d{5}-?\d{3}\b/)?.[0] || ''
  const birth = text.match(/\b(\d{2})[/-](\d{2})[/-](\d{4})\b/)
  const number = text.match(/\b(?:numero|n[uú]mero|nº|casa|apto|apartamento|ap)\s*[:\-]?\s*([a-z0-9-]+)\b/i)?.[1] || ''
  const reference = text.match(/\b(?:referencia|referência|ponto de referencia|perto de|ao lado de|em frente)\s*[:\-]?\s*(.+)$/i)?.[1] || ''
  if (zip) details.zip_code = zip
  if (birth) details.tutor_birth_date = `${birth[3]}-${birth[2]}-${birth[1]}`
  if (number) details.address_number = number
  if (reference) details.address_reference = reference.slice(0, 160)
  return { document, details }
}

async function updateCustomerRegistrationFromMessage(
  supabase: SupabaseClient,
  session: ChatSession,
  message: unknown,
): Promise<boolean> {
  if (!session.client_id) return false
  const parsed = parseRegistrationUpdateFromMessage(message)
  const detailsPatch = record(parsed.details)
  if (!clean(parsed.document) && !Object.keys(detailsPatch).length) return false

  const current = await supabase
    .from('clients')
    .select('document,details')
    .eq('id', session.client_id)
    .maybeSingle()

  const nextDetails = {
    ...parseJsonObject(current.data?.details),
    ...detailsPatch,
  }

  const response = await supabase
    .from('clients')
    .update({
      ...(clean(parsed.document) ? { document: clean(parsed.document) } : {}),
      details: {
        ...nextDetails,
        registration_status: nextDetails.tutor_birth_date && nextDetails.zip_code && nextDetails.address_number && nextDetails.address_reference && (clean(parsed.document) || current.data?.document)
          ? 'completo'
          : 'pendente',
      },
    })
    .eq('id', session.client_id)

  return !response.error
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
    openAiTranscriptionModel: optionalEnv('OPENAI_TRANSCRIPTION_MODEL', DEFAULT_OPENAI_TRANSCRIPTION_MODEL),
    openAiVisionModel: optionalEnv('OPENAI_VISION_MODEL', optionalEnv('OPENAI_MODEL', DEFAULT_OPENAI_MODEL)),
    openAiTimeoutMs: parsePositiveInt(optionalEnv('OPENAI_TIMEOUT_MS'), DEFAULT_OPENAI_TIMEOUT_MS),
    whatsappAccessToken: requireEnv('WHATSAPP_ACCESS_TOKEN'),
    whatsappVerifyToken: requireEnv('WHATSAPP_VERIFY_TOKEN'),
    whatsappPhoneNumberId: normalizePhoneIdentifier(requireEnv('WHATSAPP_PHONE_NUMBER_ID')),
    whatsappAppSecret: optionalEnv('WHATSAPP_APP_SECRET'),
    whatsappGraphVersion: optionalEnv('WHATSAPP_GRAPH_VERSION', 'v25.0').replace(/^\/+/, ''),
    whatsappTenantId: optionalEnv('WHATSAPP_TENANT_ID'),
    whatsappModuleId: optionalEnv('WHATSAPP_MODULE_ID', DEFAULT_MODULE_ID).toLowerCase(),
    whatsappReplyDebounceMs: Math.min(
      parseNonNegativeInt(optionalEnv('WHATSAPP_REPLY_DEBOUNCE_MS'), DEFAULT_WHATSAPP_REPLY_DEBOUNCE_MS),
      MAX_BLOCKING_WHATSAPP_REPLY_DEBOUNCE_MS,
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

function extractMessageMedia(message: LooseRecord): LooseRecord | null {
  const type = clean(message.type)
  const media = record(message[type])
  const id = clean(media.id)
  if (!id) return null

  return {
    id,
    type,
    mime_type: clean(media.mime_type),
    sha256: clean(media.sha256),
    caption: clean(media.caption),
  }
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
          media: extractMessageMedia(message),
          mediaProcessing: null,
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

function mediaExtension(mimeType = '', fallback = 'bin') {
  const lower = clean(mimeType).toLowerCase()
  if (lower.includes('ogg')) return 'ogg'
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3'
  if (lower.includes('mp4')) return 'mp4'
  if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpg'
  if (lower.includes('png')) return 'png'
  if (lower.includes('webp')) return 'webp'
  return fallback
}

async function downloadWhatsappMedia(env: WebhookEnv, mediaId: string) {
  const infoUrl = `${GRAPH_BASE_URL}/${env.whatsappGraphVersion}/${encodeURIComponent(mediaId)}`
  const infoResponse = await fetch(infoUrl, {
    headers: { Authorization: `Bearer ${env.whatsappAccessToken}` },
  })
  const info = await infoResponse.json().catch(() => ({})) as LooseRecord
  if (!infoResponse.ok || !clean(info.url)) {
    const detail = clean(record(info.error).message) || `HTTP ${infoResponse.status}`
    fail(502, `Unable to load WhatsApp media info: ${detail}`)
  }

  const mediaResponse = await fetch(clean(info.url), {
    headers: { Authorization: `Bearer ${env.whatsappAccessToken}` },
  })
  if (!mediaResponse.ok) fail(502, `Unable to download WhatsApp media: HTTP ${mediaResponse.status}`)

  const arrayBuffer = await mediaResponse.arrayBuffer()
  const mimeType = clean(mediaResponse.headers.get('content-type')) || clean(info.mime_type)
  return { bytes: Buffer.from(arrayBuffer), mimeType }
}

async function transcribeWhatsappAudio(env: WebhookEnv, media: LooseRecord) {
  const downloaded = await downloadWhatsappMedia(env, clean(media.id))
  const form = new FormData()
  const file = new Blob([downloaded.bytes], { type: downloaded.mimeType || 'audio/ogg' })
  form.append('model', env.openAiTranscriptionModel)
  form.append('file', file, `whatsapp-audio.${mediaExtension(downloaded.mimeType, 'ogg')}`)

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.openAiApiKey}` },
    body: form,
  })
  const payload = await response.json().catch(() => ({})) as LooseRecord
  if (!response.ok) {
    const detail = clean(record(payload.error).message) || `HTTP ${response.status}`
    fail(502, `Unable to transcribe WhatsApp audio: ${detail}`)
  }

  return clean(payload.text)
}

async function describeWhatsappImage(env: WebhookEnv, media: LooseRecord, caption = '') {
  const downloaded = await downloadWhatsappMedia(env, clean(media.id))
  const mimeType = downloaded.mimeType || clean(media.mime_type) || 'image/jpeg'
  const dataUrl = `data:${mimeType};base64,${downloaded.bytes.toString('base64')}`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.openAiVisionModel,
      temperature: 0,
      max_tokens: 180,
      messages: [
        {
          role: 'system',
          content: [
            'Voce descreve imagens recebidas por WhatsApp para um bot de petshop.',
            'Se for embalagem/produto, extraia marca, linha, peso, sabor e especie quando visivel.',
            'Se parecer ferimento, sangue, emergencia ou problema veterinario sensivel, responda exatamente com VETERINARY_IMAGE_REQUIRES_HUMAN e uma descricao curta.',
            'Nao diagnostique animal e nao invente texto ilegivel.',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Legenda do cliente: ${caption || 'sem legenda'}` },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
          ],
        },
      ],
    }),
  })
  const payload = await response.json().catch(() => ({})) as LooseRecord
  if (!response.ok) {
    const detail = clean(record(payload.error).message) || `HTTP ${response.status}`
    fail(502, `Unable to describe WhatsApp image: ${detail}`)
  }

  return clean(payload.choices?.[0]?.message?.content)
}

function canProcessWhatsappMedia(event: WhatsappEvent) {
  return Boolean(event.media?.id) && ['audio', 'voice', 'image'].includes(clean(event.type))
}

async function resolveWhatsappMediaText(env: WebhookEnv, event: WhatsappEvent) {
  const media = event.media || {}
  const type = clean(event.type)
  const caption = clean(media.caption) || clean(event.text)

  if (type === 'audio' || type === 'voice') {
    const transcript = await transcribeWhatsappAudio(env, media)
    if (!transcript) return null
    return {
      text: transcript,
      metadata: { media_processed: true, media_processing: 'audio_transcription' },
    }
  }

  if (type === 'image') {
    const description = await describeWhatsappImage(env, media, caption)
    if (!description) return null
    const requiresHuman = description.includes('VETERINARY_IMAGE_REQUIRES_HUMAN')
    const cleanDescription = description.replace('VETERINARY_IMAGE_REQUIRES_HUMAN', '').trim()
    return {
      text: requiresHuman
        ? `quero falar com veterinaria. Imagem veterinaria sensivel: ${cleanDescription || 'imagem recebida'}`
        : [caption, `Imagem recebida: ${cleanDescription}`].filter(Boolean).join('\n'),
      metadata: {
        media_processed: true,
        media_processing: 'image_description',
        image_requires_human: requiresHuman,
      },
    }
  }

  return null
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
        whatsapp_media: event.media || null,
        ...(event.mediaProcessing || {}),
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

function isPossiblePaymentProof(event: WhatsappEvent) {
  const type = clean(event.type)
  const mime = clean(event.media?.mime_type).toLowerCase()
  return type === 'image' || type === 'document' || mime.includes('pdf')
}

async function markPossiblePaymentProof(
  supabase: SupabaseClient,
  session: ChatSession,
  event: WhatsappEvent,
  savedIncoming: SavedMessage,
) {
  if (!isPossiblePaymentProof(event)) return false
  const context = parseJsonObject(session.context)
  const saleId = clean(context.last_sale_id)
  if (!saleId) return false
  const proofMetadata = {
    chat_message_id: savedIncoming.id,
    whatsapp_message_id: event.messageId,
    whatsapp_media: event.media || null,
    received_at: new Date().toISOString(),
  }
  const saleUpdate = await supabase
    .from('sales')
    .update({
      payment_status: 'comprovante_recebido',
      payment_proof_received_at: proofMetadata.received_at,
      payment_proof_metadata: proofMetadata,
    })
    .eq('id', saleId)
    .in('payment_status', ['aguardando_comprovante', 'comprovante_recebido'])
    .select('id')
    .maybeSingle()

  if (saleUpdate.error || !saleUpdate.data) return false

  await supabase
    .from('service_delivery_orders')
    .update({
      payment_status: 'comprovante_recebido',
      payment_proof_received_at: proofMetadata.received_at,
      payment_proof_metadata: proofMetadata,
    })
    .eq('sale_id', saleId)

  await supabase
    .from('chat_sessions')
    .update({
      context: {
        ...context,
        petbot: {
          ...(parseJsonObject(context.petbot)),
          paymentProof: {
            status: 'comprovante_recebido',
            requested: true,
            received: true,
            mediaId: clean(event.media?.id),
            url: '',
          },
        },
      },
      last_message_at: proofMetadata.received_at,
    })
    .eq('id', session.id)

  return true
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
  const terms = normalizeSearchText(message)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !PRODUCT_STOP_WORDS.has(term))
    .flatMap((term) => {
      if (term === 'shihtzu') return ['shih', 'tzu', 'shihtzu']
      if (term === 'york') return ['york', 'yorkshire']
      return [term]
    })

  return [...new Set(terms)].slice(0, 12)
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

function requestedWeightKg(terms: string[] = []): number | null {
  for (const term of terms || []) {
    const match = String(term).match(/^(\d{1,2})(?:kg)?$/)
    if (match) return Number(match[1])
  }
  return null
}

function productWeightRangeScore(product: LooseRecord, weightKg: number | null): number {
  if (!weightKg) return 0
  const raw = clean(product.name).toLowerCase().replace(/,/g, '.')
  const ranges = [...raw.matchAll(/(\d+(?:\.\d+)?)\s*(?:a|-|ate|atÃ©)\s*(\d+(?:\.\d+)?)\s*kg/g)]
  if (!ranges.length) return 0
  const matches = ranges.some((range) => {
    const min = Number(range[1])
    const max = Number(range[2])
    return Number.isFinite(min) && Number.isFinite(max) && weightKg >= min && weightKg <= max
  })
  return matches ? 18 : -10
}

function productPackageKgScore(product: LooseRecord, packageKg: number | null): number {
  if (!packageKg) return 0
  const raw = normalizeSearchText(product.name).replace(/,/g, '.')
  const compact = raw.replace(/\s+/g, '')
  const spaced = new RegExp(`\\b${packageKg}\\s*kg\\b`)
  if (spaced.test(raw) || compact.includes(`${packageKg}kg`)) return 24
  return -14
}

function hasDogBreedProductText(searchable = ''): boolean {
  return /shih tzu|shihtzu|yorkshire|lhasa|spitz|poodle|pinscher|bulldog|pug|maltes|maltÃªs/.test(searchable)
}

function rankProduct(product: LooseRecord, terms: string[]): number {
  const searchable = productSearchText(product)
  const name = normalizeSearchText(product.name)
  const category = normalizeSearchText(product.category)
  let score = 0
  const weightKg = requestedWeightKg(terms)
  const packageKg = terms.some((term) => /kg$/.test(term)) ? weightKg : null
  const wantsAdult = terms.some((term) => ['adulto', 'adultos', 'adulta', 'adultas'].includes(term))
  const wantsPuppy = terms.some((term) => ['filhote', 'filhotes', 'puppy', 'junior'].includes(term))
  const wantsFlea = terms.some((term) => ['antipulga', 'antipulgas', 'pulga', 'pulgas', 'carrapato', 'carrapatos', 'bravecto', 'nexgard', 'simparic', 'credeli'].includes(term))
  const wantsLitter = terms.some((term) => ['areia', 'higienica', 'higiÃªnica'].includes(term))
  const fleaProduct = /(antipulga|pulga|carrapato|bravecto|nexgard|simparic|credeli|matacura|coleira contra)/.test(searchable)
  const oralFleaProduct = /(bravecto|nexgard|simparic|credeli)/.test(searchable)
  const topicalFleaProduct = /(shampoo|sabonete|spray|talco|coleira|matacura)/.test(searchable)
  const wantsCat = terms.some((term) => ['gato', 'gatos', 'gata', 'gatas', 'cat', 'felino', 'felinos'].includes(term))
  const wantsDog = terms.some((term) => ['cao', 'caes', 'cachorro', 'cachorros', 'cachorra', 'dog', 'canino', 'caninos'].includes(term) || KNOWN_BREED_TERMS.has(term))
  const catProduct = /(gato|gatos|gata|felino|cat|whiskas|kitekat)/.test(searchable)
  const dogProduct = /\b(cao|caes|cachorro|canino|dog|pedigree|bifinho|ossinho)\b/.test(searchable)
    || /special dog/.test(searchable)
    || hasDogBreedProductText(searchable)
  const breedTerms = terms.filter((term) => KNOWN_BREED_TERMS.has(term))
  const categoryTerms = terms.filter((term) => AGE_CATEGORY_TERMS.has(term))
  const sizeTerms = terms.filter((term) => SIZE_CATEGORY_TERMS.has(term))

  for (const term of terms) {
    if (name.includes(term)) score += 8
    if (category.includes(term)) score += 4
    if (searchable.includes(term)) score += 2
  }

  for (const term of breedTerms) {
    if (name.includes(term)) score += 10
    if (!name.includes(term) && !searchable.includes(term)) score -= 2
  }

  for (const term of categoryTerms) {
    if (name.includes(term)) score += 8
    if (!name.includes(term) && !searchable.includes(term)) score -= 2
  }

  for (const term of sizeTerms) {
    if (name.includes(term)) score += 7
    if (!name.includes(term) && !searchable.includes(term)) score -= 1
  }

  if (wantsAdult && /adult/.test(name)) score += 8
  if (wantsAdult && /(filhote|puppy|junior)/.test(name)) score -= 12
  if (wantsPuppy && /(filhote|puppy|junior)/.test(name)) score += 8
  if (wantsPuppy && /adult/.test(name)) score -= 12
  if (wantsFlea && fleaProduct) score += 18
  if (wantsFlea && !fleaProduct) score -= 18
  if (wantsFlea && oralFleaProduct) score += 20
  if (wantsFlea && topicalFleaProduct && terms.some((term) => /\d/.test(term) || ['pequeno', 'medio', 'grande'].includes(term))) score -= 12
  if (wantsFlea && weightKg) score += productWeightRangeScore(product, weightKg)
  if (wantsLitter && /(areia|higienica|pa higienica)/.test(searchable)) score += 14
  if (wantsLitter && !/(areia|higienica|pa higienica)/.test(searchable)) score -= 25
  if (wantsCat && catProduct) score += 18
  if (wantsCat && dogProduct) score -= 35
  if (wantsDog && dogProduct) score += 12
  if (wantsDog && catProduct) score -= 35
  if (category.includes('racao') && packageKg) score += productPackageKgScore(product, packageKg)
  if (!breedTerms.length && hasDogBreedProductText(searchable)) score -= 10
  if (category.includes('racao')) score += 2
  score += Math.min(Number(product.stock_quantity || 0), 20) / 20
  return score
}

function selectRelevantProducts(products: LooseRecord[] | null | undefined, latestUserMessage: string): LooseRecord[] {
  const available = (products || []).filter(isSellableProduct)
  const terms = buildSearchTerms(latestUserMessage)
  const isProductIntent = detectProductIntent(latestUserMessage)

  if (!available.length) return []

  const catalogRequest = detectCatalogRequest(latestUserMessage)
  const catalogMatched = rankCatalogProducts(available, {}, latestUserMessage)
    .filter((item: LooseRecord) => Number(item.score || 0) > 0)
    .map((item: LooseRecord) => item.product)
  if (catalogMatched.length) return catalogMatched.slice(0, PRODUCT_CONTEXT_LIMIT)
  if (catalogRequest.type) return []

  const matched = terms.length
    ? available
      .map((product) => ({ product, score: rankProduct(product, terms) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.product)
    : []

  if (matched.length) return matched.slice(0, PRODUCT_CONTEXT_LIMIT)

  if (!isProductIntent) return []

  return available
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

function expandDbSearchTerms(terms: string[] = []): string[] {
  const extras: Record<string, string[]> = {
    racao: ['racao', 'ração'],
    caes: ['caes', 'cães'],
    cao: ['cao', 'cão'],
    sache: ['sache', 'sachê'],
    higienica: ['higienica', 'higiênica'],
    antipulga: ['antipulga', 'antipulgas', 'pulga', 'carrapato', 'bravecto', 'nexgard', 'simparic', 'credeli'],
    antipulgas: ['antipulga', 'antipulgas', 'pulga', 'carrapato', 'bravecto', 'nexgard', 'simparic', 'credeli'],
    pulga: ['pulga', 'pulgas', 'carrapato', 'bravecto', 'nexgard', 'simparic', 'credeli'],
    pulgas: ['pulga', 'pulgas', 'carrapato', 'bravecto', 'nexgard', 'simparic', 'credeli'],
    carrapato: ['carrapato', 'carrapatos', 'bravecto', 'nexgard', 'simparic', 'credeli'],
  }
  return [...new Set((terms || []).flatMap((term) => {
    const kg = String(term).match(/^(\d{1,2})kg$/)
    if (kg) return [term, `${kg[1]} kg`]
    return extras[term] || [term]
  }))].slice(0, 12)
}

function mergeProductsById(...lists: LooseRecord[][]): LooseRecord[] {
  const map = new Map<string, LooseRecord>()
  for (const list of lists) {
    for (const product of list || []) {
      const id = clean(product?.id)
      if (id && !map.has(id)) map.set(id, product)
    }
  }
  return [...map.values()]
}

async function searchProductsByTerms(
  supabase: SupabaseClient,
  session: ChatSession,
  terms: string[],
): Promise<LooseRecord[]> {
  const dbTerms = expandDbSearchTerms(terms)
  if (!dbTerms.length) return []

  const orFilter = dbTerms
    .flatMap((term) => ['name', 'category', 'description', 'barcode'].map((column) => `${column}.ilike.%${term}%`))
    .join(',')

  const { data, error } = await supabase
    .from('products')
    .select('id, name, category, description, species_target, barcode, image_url, price, stock_quantity, active')
    .eq('tenant_id', session.tenant_id)
    .eq('module_id', session.module_id)
    .eq('active', true)
    .gt('stock_quantity', 0)
    .or(orFilter)
    .limit(120)

  if (error) return []
  return (data || []) as LooseRecord[]
}

async function loadUpsellProducts(
  supabase: SupabaseClient,
  session: ChatSession,
): Promise<LooseRecord[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, category, description, species_target, barcode, image_url, price, stock_quantity, active')
    .eq('tenant_id', session.tenant_id)
    .eq('module_id', session.module_id)
    .eq('active', true)
    .gt('stock_quantity', 0)
    .or([
      'name.ilike.%petisco%',
      'name.ilike.%bifinho%',
      'name.ilike.%dental%',
      'name.ilike.%ossinho%',
      'name.ilike.%sache%',
      'name.ilike.%sachê%',
      'name.ilike.%areia%',
      'name.ilike.%shampoo%',
      'category.ilike.%petisco%',
      'category.ilike.%sache%',
      'category.ilike.%sachê%',
      'category.ilike.%higien%',
    ].join(','))
    .limit(40)

  if (error) return []
  return (data || []) as LooseRecord[]
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
      `Foto: ${clean(product.image_url) ? 'sim' : 'nao'}`,
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
      const dateIso = appointmentDateIso(appointment)
      const dateObj = dateIso ? new Date(`${dateIso}T12:00:00-03:00`) : new Date(String(appointment.scheduled_at))
      const time = appointmentTimeText(appointment)
      const date = dateObj.toLocaleDateString('pt-BR', {
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
    lines.push('Nao ha horario explicitamente disponivel no contexto. Ofereca consultar outros horarios com um atendente ou, se for caso veterinario, com a veterinaria.')
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

  const candidates = [...new Set([digits, clean(phone), `+${digits}`].filter(Boolean))]
  const { data, error } = await supabase
    .from('clients')
    .select(CLIENT_PROFILE_SELECT)
    .eq('module_id', moduleId)
    .eq('tenant_id', tenantId)
    .in('phone', candidates)
    .limit(5)

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
      .select(CLIENT_PROFILE_SELECT)
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
      .select(CLIENT_PROFILE_SELECT)
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
      payment_status: sessionContext.last_payment_status || null,
      duplicated: true,
    }
  }

  const customer = await ensureCustomerProfile(supabase, session, args)
  const items = Array.isArray(args.items) ? args.items as LooseRecord[] : []
  if (!items.length) throw new Error('Pedido sem itens para registrar.')

  if (clean(args.order_type) === 'produto' && !['pix', 'dinheiro', 'cartao'].includes(clean(args.payment_method))) {
    throw new Error('Forma de pagamento ausente ou invalida.')
  }

  const productIds = [...new Set(items.map((item) => clean(item.product_id)).filter(Boolean))]
  let productMap = new Map<string, LooseRecord>()
  if (productIds.length > 0) {
    const { data, error } = await supabase
      .from('products')
      .select('id,name,price,stock_quantity,active')
      .eq('tenant_id', session.tenant_id)
      .eq('module_id', session.module_id)
      .in('id', productIds)
    if (error) throw new Error(`Falha ao validar estoque: ${error.message}`)
    productMap = new Map(((data || []) as LooseRecord[]).map((product) => [String(product.id), product]))
  }

  if (args.order_type === 'produto' && productIds.length !== items.length) {
    throw new Error('Produto sem ID do estoque nao pode ser registrado.')
  }

  const normalizedItems = items.map((item) => {
    const productId = clean(item.product_id)
    const quantity = Math.max(1, Number(item.quantity || 1))
    if (!productId) {
      if (args.order_type === 'produto') throw new Error('Produto sem ID do estoque nao pode ser registrado.')
      return {
        product_id: null,
        name: clean(item.name) || clean(args.service_type) || 'Servico',
        quantity,
        unit_price: Number(item.unit_price || 0),
        upsell: Boolean(item.upsell),
      }
    }

    const product = productMap.get(productId)
    if (!product || product.active === false) throw new Error(`Produto indisponivel no estoque: ${clean(item.name) || productId}`)
    if (Number(product.stock_quantity || 0) < quantity) throw new Error(`Estoque insuficiente para ${clean(product.name)}.`)
    return {
      product_id: productId,
      name: clean(product.name) || clean(item.name),
      quantity,
      unit_price: Number(product.price || 0),
      upsell: Boolean(item.upsell),
    }
  })

  if (args.order_type === 'produto') {
    if (!['entrega', 'retirada'].includes(clean(args.fulfillment_type))) {
      throw new Error('Entrega ou retirada precisa estar definida antes de registrar.')
    }
    if (args.fulfillment_type === 'entrega') {
      const deliveryAddress = clean(args.delivery_address)
      const deliveryNeighborhood = clean(args.delivery_neighborhood)
      const deliveryReference = clean(args.delivery_reference)
      if (!deliveryAddress || !/\d/.test(deliveryAddress) || !deliveryNeighborhood || !deliveryReference) {
        throw new Error('Endereco de entrega incompleto.')
      }
    }
  }

  let validatedAppointment: LooseRecord | null = null
  if (args.order_type !== 'produto') {
    const appointmentId = clean(args.appointment_id)
    const scheduledAt = clean(args.scheduled_at)
    if (!appointmentId && !scheduledAt) throw new Error('Horario real da agenda ausente.')

    let appointmentQuery = supabase
      .from('appointments')
      .select('id,service_type,scheduled_at,service_date,start_time,status,price,duration_min')
      .eq('tenant_id', session.tenant_id)
      .eq('module_id', session.module_id)

    appointmentQuery = appointmentId ? appointmentQuery.eq('id', appointmentId) : appointmentQuery.eq('scheduled_at', scheduledAt)

    const { data, error } = await appointmentQuery.limit(1).maybeSingle()
    if (error) throw new Error(`Falha ao validar agenda: ${error.message}`)
    if (!data) {
      if (appointmentId) throw new Error('Horario nao encontrado na agenda.')
      const firstItem = (normalizedItems[0] || {}) as LooseRecord
      const durationMin = Number(args.duration_min || firstItem.duration_min || 60)
      if (await hasBusyAppointmentConflict(supabase, session, scheduledAt, durationMin)) {
        throw new Error('Horario nao esta mais disponivel.')
      }
      validatedAppointment = { scheduled_at: scheduledAt, service_type: clean(args.service_type), price: Number(normalizedItems[0]?.unit_price || 0), duration_min: durationMin }
    } else {
      if (!AVAILABLE_STATUSES.has(clean(data.status).toLowerCase())) throw new Error('Horario nao esta mais disponivel.')

      validatedAppointment = data as LooseRecord
      args.scheduled_at = normalizeAppointmentRows([data as LooseRecord])[0]?.scheduled_at || data.scheduled_at
      args.service_type = clean(data.service_type) || clean(args.service_type) || args.order_type
      normalizedItems[0].unit_price = Number(data.price || normalizedItems[0].unit_price || 0)
      normalizedItems[0].name = clean(data.service_type) || normalizedItems[0].name
    }
  }

  const subtotal = normalizedItems.reduce((sum, item) => sum + Number(item.quantity || 1) * Number(item.unit_price || 0), 0)
  const deliveryFee = args.fulfillment_type === 'entrega' ? Number(context.deliveryFee ?? DEFAULT_DELIVERY_FEE) : 0
  const total = subtotal + deliveryFee
  const paymentStatus = clean(args.order_type) === 'produto'
    ? (clean(args.payment_method) === 'pix' ? 'aguardando_comprovante' : 'baixado')
    : 'nao_aplicavel'
  const orderType = args.order_type === 'produto' ? 'entrega' : 'servico'
  const fulfillmentType = args.order_type === 'produto'
    ? (args.fulfillment_type === 'retirada' ? 'balcao' : 'entrega')
    : 'servico'
  const inferredAddress = args.fulfillment_type === 'entrega'
    ? await inferDeliveryAddressFromMessages(supabase, session.id)
    : ''
  const deliveryAddress = clean(args.delivery_address) || inferredAddress || clean(customer.client?.address) || null
  const deliveryNeighborhood = clean(args.delivery_neighborhood) || clean(customer.client?.neighborhood) || null
  const deliveryCity = clean(args.delivery_city) || clean(customer.client?.city) || null
  const deliveryLine = [deliveryAddress, deliveryNeighborhood, deliveryCity].filter(Boolean).join(' - ')
  const resolvedItems = await resolveOrderItems(supabase, session, normalizedItems)
  const itemSummary = resolvedItems
    .map((item) => `${Number(item.quantity || 1)}x ${clean(item.display_name)} - R$ ${Number(item.subtotal || 0).toFixed(2)}`)
    .join('; ')

  const notes = [
    'Origem: PetBot WhatsApp',
    `Sessao: ${session.id}`,
    itemSummary ? `Itens: ${itemSummary}` : null,
    deliveryLine ? `Endereco: ${deliveryLine}` : null,
    clean(args.notes),
    args.fulfillment_type === 'retirada' ? 'Retirada na loja' : null,
    args.fulfillment_type === 'entrega' ? `Taxa de entrega: R$ ${deliveryFee.toFixed(2)}` : null,
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
      payment_status: paymentStatus,
      source: 'whatsapp',
      fulfillment_type: fulfillmentType,
      notes,
    })
    .select('id,total_price')
    .single()

  if (saleError) throw new Error(`Falha ao registrar venda: ${saleError.message}`)

  const saleItems: LooseRecord[] = resolvedItems.map((row) => {
    const { display_name: _displayName, ...item } = row
    return {
      ...item,
      sale_id: sale.id,
    }
  })

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
  if (args.order_type !== 'produto' && validatedAppointment) {
    const payload = {
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
    }
    const { data, error } = await supabase
      .from('appointments')
      .update(payload)
      .eq('id', validatedAppointment.id)
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
    delivery_address: args.fulfillment_type === 'entrega' ? deliveryAddress : null,
    delivery_neighborhood: args.fulfillment_type === 'entrega' ? deliveryNeighborhood : null,
    delivery_city: args.fulfillment_type === 'entrega' ? deliveryCity : null,
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
        ...(session.context || {}),
        last_sale_id: sale.id,
        last_order_id: order?.id || null,
        last_appointment_id: appointment?.id || null,
        last_total: total,
        last_payment_status: paymentStatus,
      },
      last_message_at: new Date().toISOString(),
    })
    .eq('id', session.id)

  return {
    sale_id: sale.id,
    order_id: order?.id || null,
    appointment_id: appointment?.id || null,
    total,
    payment_status: paymentStatus,
  }
}

function buildPetbotOrderTransactionPayload(
  session: ChatSession,
  customer: { client?: LooseRecord | null; phone?: string | null },
  context: StoreContext,
  args: LooseRecord = {},
) {
  return {
    session_id: session.id,
    tenant_id: session.tenant_id,
    module_id: session.module_id,
    client_id: customer.client?.id || null,
    customer_name: clean(args.customer_name) || clean(customer.client?.name) || session.customer_name || 'Cliente',
    customer_phone: customer.phone || session.customer_phone || null,
    pet_name: clean(args.pet_name),
    species: clean(args.species),
    size: clean(args.size),
    breed: clean(args.breed),
    symptom: clean(args.symptom),
    order_type: clean(args.order_type) || 'produto',
    payment_method: clean(args.payment_method),
    fulfillment_type: clean(args.fulfillment_type),
    delivery_address: clean(args.delivery_address),
    delivery_neighborhood: clean(args.delivery_neighborhood),
    delivery_city: clean(args.delivery_city),
    delivery_reference: clean(args.delivery_reference),
    delivery_fee: Number(context.deliveryFee ?? DEFAULT_DELIVERY_FEE),
    service_transport_fee: Number(args.service_transport_fee || 0),
    service_transport_mode: clean(args.service_transport_mode),
    service_transport_label: clean(args.service_transport_label),
    service_transport_address: clean(args.service_transport_address),
    service_transport_neighborhood: clean(args.service_transport_neighborhood),
    service_transport_city: clean(args.service_transport_city),
    service_transport_reference: clean(args.service_transport_reference),
    service_grooming_detail: clean(args.service_grooming_detail),
    expected_total: Number(args.total || 0),
    appointment_id: clean(args.appointment_id),
    scheduled_at: clean(args.scheduled_at),
    service_type: clean(args.service_type),
    change_for: Number(args.change_for || 0),
    notes: clean(args.notes),
    items: Array.isArray(args.items) ? args.items : [],
  }
}

async function createConfirmedPetshopOrderViaRpc(
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
  const payload = buildPetbotOrderTransactionPayload(session, customer, context, args)
  if (!payload.items.length) throw new Error('Pedido sem itens para registrar.')
  if (payload.order_type === 'produto' && !['pix', 'dinheiro', 'cartao'].includes(payload.payment_method)) {
    throw new Error('Forma de pagamento ausente ou invalida.')
  }

  const { data, error } = await supabase.rpc('create_petbot_order_transaction', {
    p_payload: payload,
  })

  if (error) throw new Error(`Falha ao registrar pedido transacional: ${error.message}`)

  const result = record(data)
  return {
    sale_id: clean(result.sale_id),
    order_id: clean(result.order_id) || null,
    appointment_id: clean(result.appointment_id) || null,
    total: Number(result.total || payload.expected_total || 0),
    payment_status: clean(result.payment_status),
    duplicated: Boolean(result.duplicated),
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
      ...await createConfirmedPetshopOrderViaRpc(supabase, session, context, args),
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

async function resolveOrderItems(
  supabase: SupabaseClient,
  session: ChatSession,
  items: LooseRecord[],
): Promise<LooseRecord[]> {
  const rows: LooseRecord[] = []

  for (const item of items) {
    let productId = isUuid(item.product_id) ? clean(item.product_id) : null
    let productName = clean(item.name)

    if (!productId && productName) {
      const { data: product } = await supabase
        .from('products')
        .select('id,name')
        .eq('module_id', session.module_id)
        .eq('tenant_id', session.tenant_id)
        .ilike('name', productName)
        .limit(1)
        .maybeSingle()

      if (product?.id) {
        productId = product.id
        productName ||= clean(product.name)
      }
    }

    const quantity = Number(item.quantity || 1)
    const unitPrice = Number(item.unit_price || 0)
    rows.push({
      tenant_id: session.tenant_id,
      sale_id: null,
      product_id: productId,
      quantity,
      unit_price: unitPrice,
      subtotal: quantity * unitPrice,
      upsell: Boolean(item.upsell),
      display_name: productName || 'Produto nao identificado',
    })
  }

  return rows
}

async function inferDeliveryAddressFromMessages(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<string> {
  const { data } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('sent_at', { ascending: false })
    .limit(20)

  const candidates = (data || [])
    .filter((message) => message.role === 'user')
    .map((message) => clean(message.content))
    .filter((text) => {
      const normalized = normalizeSearchText(text)
      return text.length >= 10
        && /\d/.test(text)
        && /\b(rua|r\.|avenida|av\.|travessa|alameda|rodovia|estrada|bairro|ap|apto|apartamento|casa|numero|nº|n )\b/.test(normalized)
    })

  return candidates[0] || ''
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
  const cacheKey = scopeCacheKey(session.module_id, session.tenant_id)

  const [settings, productRows, appointments, searchedProducts, upsellProducts] = await Promise.all([
    cachedLoad(settingsCache, cacheKey, STORE_CONTEXT_CACHE_MS, async () => {
      let result = await supabase
        .from('settings')
        .select('store_name,store_phone,store_address,store_neighborhood,store_city,bot_prompt,delivery_fee,pet_transport_fee,pix_key,pix_holder_name,message_templates,pet_transport_options')
        .eq('tenant_id', session.tenant_id)
        .eq('module_id', session.module_id)
        .maybeSingle()
      if (result.error && /(pet_transport_fee|pix_key|pix_holder_name|message_templates|pet_transport_options)/i.test(String(result.error.message || ''))) {
        result = await supabase
          .from('settings')
          .select('store_name,store_phone,store_address,store_neighborhood,store_city,bot_prompt,delivery_fee')
          .eq('tenant_id', session.tenant_id)
          .eq('module_id', session.module_id)
          .maybeSingle()
      }
      const { data } = result
      return (data || {}) as LooseRecord
    }),
    terms.length > 0 ? Promise.resolve([]) : cachedLoad(productCatalogCache, cacheKey, PRODUCT_CATALOG_CACHE_MS, async () => {
      const { data, error } = await supabase
        .from('products')
          .select('id, name, category, description, species_target, barcode, image_url, price, stock_quantity, active')
        .eq('tenant_id', session.tenant_id)
        .eq('module_id', session.module_id)
        .eq('active', true)
        .gt('stock_quantity', 0)
        .limit(MAX_CACHED_PRODUCTS)
      if (error) return []
      return (data || []) as LooseRecord[]
    }),
    cachedLoad(appointmentsCache, cacheKey, APPOINTMENTS_CACHE_MS, async () => {
      const selectColumns = 'id, service_type, scheduled_at, service_date, start_time, status, price, duration_min'
      const { data, error } = await supabase
        .from('appointments')
        .select(selectColumns)
        .eq('tenant_id', session.tenant_id)
        .eq('module_id', session.module_id)
        .gte('scheduled_at', `${today}T00:00:00-03:00`)
        .lte('scheduled_at', `${end}T23:59:59-03:00`)
        .order('scheduled_at')
        .limit(40)
      if (error) return []
      const byScheduledAt = (data || []) as LooseRecord[]
      const serviceDateResult = await supabase
        .from('appointments')
        .select(selectColumns)
        .eq('tenant_id', session.tenant_id)
        .eq('module_id', session.module_id)
        .gte('service_date', today)
        .lte('service_date', end)
        .order('service_date')
        .order('start_time')
        .limit(40)
      const byServiceDate = (serviceDateResult.error ? [] : (serviceDateResult.data || [])) as LooseRecord[]
      return normalizeAppointmentRows([...byScheduledAt, ...byServiceDate])
    }),
    terms.length > 0 ? searchProductsByTerms(supabase, session, terms) : Promise.resolve([]),
    terms.length > 0 ? loadUpsellProducts(supabase, session) : Promise.resolve([]),
  ])

  const selectedProducts = selectRelevantProducts(terms.length > 0 ? searchedProducts : productRows, catalogSearchText)
  let productsForGuard = selectedProducts.length > 0
    ? mergeProductsById(selectedProducts, upsellProducts)
    : (terms.length > 0 ? [] : productRows.slice(0, PRODUCT_CONTEXT_LIMIT))

  if (terms.length > 0 && productsForGuard.length === 0) {
    const catalog = await cachedLoad(productCatalogCache, cacheKey, PRODUCT_CATALOG_CACHE_MS, async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, category, description, species_target, barcode, image_url, price, stock_quantity, active')
        .eq('tenant_id', session.tenant_id)
        .eq('module_id', session.module_id)
        .eq('active', true)
        .gt('stock_quantity', 0)
        .limit(MAX_CACHED_PRODUCTS)
      if (error) return []
      return (data || []) as LooseRecord[]
    })
    const fallbackSelected = selectRelevantProducts(catalog || [], catalogSearchText)
    if (fallbackSelected.length > 0) {
      productsForGuard = mergeProductsById(fallbackSelected.slice(0, PRODUCT_CONTEXT_LIMIT), upsellProducts)
    }
  }

  return {
    storeName: clean(settings.store_name) || 'YuiSync',
    storePhone: clean(settings.store_phone),
    storeAddress: clean(settings.store_address),
    storeNeighborhood: clean(settings.store_neighborhood),
    storeCity: clean(settings.store_city),
    botPrompt: clean(settings.bot_prompt),
    deliveryFee: Number(settings.delivery_fee ?? DEFAULT_DELIVERY_FEE),
    petTransportFee: Number(settings.pet_transport_fee ?? 20),
    pixKey: clean(settings.pix_key),
    pixHolderName: clean(settings.pix_holder_name),
    messageTemplates: record(settings.message_templates),
    petTransportOptions: Array.isArray(settings.pet_transport_options) ? settings.pet_transport_options as LooseRecord[] : [],
    customerContext: '',
    examplesContext: '',
    modelName: env.openAiModel,
    temperature: 0.5,
    productContext: buildProductsContext(productsForGuard),
    appointmentsContext: buildAppointmentsContext(appointments),
    products: productsForGuard,
    appointments,
  }
}

async function loadRecentHistory(supabase: SupabaseClient, sessionId: string) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, metadata, tokens_used, sent_at')
    .eq('session_id', sessionId)
    .order('sent_at', { ascending: false })
    .limit(RECENT_HISTORY_LIMIT)

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
    'Se o cliente pedir algo fora do contexto, peca os dados necessarios ou encaminhe para um atendente; em caso veterinario sensivel, para a veterinaria.',
    'Para agendamentos, nao confirme disponibilidade sem haver horario confirmado no contexto de agenda.',
    'Nunca aplique desconto. Se pedirem desconto, responda gentilmente: "Infelizmente nao conseguimos aplicar desconto nesse pedido."',
    'Mantenha respostas curtas e naturais para conversa de WhatsApp.',
    'Seu foco e vender, mas sem pressionar: se o cliente recusar o upsell, continue o pedido normalmente.',
    'Sempre pesquise no contexto do banco abaixo. Se o dado nao estiver no contexto, diga que vai consultar um atendente; em caso veterinario, a veterinaria.',
    'Se o cliente ainda nao tem nome confirmado, peca o nome antes de qualquer triagem ou oferta, inclusive em saudacao simples.',
    '',
    'Fluxo obrigatorio:',
    'Produto: nome, intencao, dados minimos, opcoes reais, preco, um upsell compativel, resumo parcial, pagamento, entrega/retirada, endereco se entrega, resumo final, confirmar, salvar e avaliacao 0-10.',
    'Servico: nome, intencao, dados minimos, horario real, resumo, transporte do pet quando banho/tosa, confirmar, salvar agendamento e avaliacao 0-10. Nao peca forma de pagamento para banho/tosa ou veterinaria no chat.',
    'Se o dado ja estiver no cadastro/contexto, nao pergunte de novo.',
    'Dados minimos produto: cliente, especie e idade/categoria quando relevante (adulto, filhote, castrado, senior). Se o cliente informar uma raca ou tamanho do dia a dia (ex.: Shih Tzu, Yorkshire, Poodle, Lhasa, Spitz, Bulldog, Golden, Labrador, Pinscher, porte pequeno/medio/grande), trate isso como categoria/porte suficiente e nao peca peso. Pergunte peso apenas para produtos que dependem tecnicamente de faixa de kg, como antipulgas, vermifugo ou medicamento.',
    'Dados minimos banho/tosa: cliente, nome do pet, especie, porte/raca, acabamento quando for tosa e horario real disponivel. Para gato em banho/tosa, chame um atendente.',
    'Dados minimos veterinaria: cliente, nome do pet, especie/tamanho, problema principal e horario real disponivel.',
    'Nunca assuma especie. Se o cliente nao disse cachorro/gato, pergunte. Nao diga "e cachorro, certo?".',
    'Upsell: ofereca 1 item ou servico relacionado; se o cliente recusar, continue o pedido normalmente.',
    'Se produto sem estoque, mostre alternativas similares do contexto. Se horario indisponivel, ofereca os proximos horarios disponiveis do contexto.',
    'Ao vender racao por marca/raca/tamanho, priorize produtos cujo nome contenha a marca, a raca/tamanho e adulto/filhote/castrado informado. So diga que nao tem estoque se nenhum item do contexto operacional corresponder.',
    'Depois do cliente confirmar o resumo final, use a ferramenta create_confirmed_petshop_order antes de responder a avaliacao.',
    'Ao chamar create_confirmed_petshop_order para produto, envie product_id quando houver ID no estoque, nome do item, quantidade, preco unitario, fulfillment_type, pagamento e delivery_address completo quando for entrega. Para servico, envie appointment_id/scheduled_at e nao exija pagamento.',
    'Trate "sim", "s", "sm", "confirmo", "pode finalizar" e equivalentes como confirmacao final quando o resumo final ja foi exibido.',
    'Depois de responder "Pedido confirmado", se o cliente enviar uma nota de 0 a 10, nao registre pedido de novo; apenas agradeca a avaliacao.',
    'Faca uma pergunta operacional por vez. Produto: primeiro pagamento, depois entrega/retirada, depois endereco se for entrega. Servico: depois do horario, pergunte transporte do pet quando banho/tosa.',
    'Se o cliente responder pagamento e entrega juntos em produto, aceite os dois e siga para endereco.',
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
    `MotoDog banho/tosa: use as opcoes configuradas (${(context.petTransportOptions || []).map((item) => `${item.label || item.id} R$ ${Number(item.fee || 0).toFixed(2)}`).join('; ') || `fallback R$ ${Number(context.petTransportFee ?? 20).toFixed(2)}`}).`,
    `Transporte do pet banho/tosa: R$ ${Number(context.petTransportFee ?? 20).toFixed(2)}`,
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
    'Pagamento: apenas para produto, pergunte exatamente "Qual forma prefere? pix, dinheiro ou cartão?"',
    'Entrega/retirada: pergunte exatamente "Será entrega ou retirada na loja?"',
    'Se for entrega, antes do resumo final diga: "A taxa de entrega é R$ [TAXA]. O total com entrega fica R$ [TOTAL]."',
    'Resumo final de entrega deve mostrar subtotal, taxa de entrega e total final. Termine perguntando "Confirma para separação?" ou, para servico, "Confirma o agendamento?"',
    'Apos confirmar e registrar com a ferramenta, use a confirmacao do guardiao: pedido confirmado, comprovante Pix quando aplicavel, checklist de cadastro faltante e avaliacao 0-10.',
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
        temperature: Number.isFinite(context.temperature) ? context.temperature : 0.5,
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
          temperature: Number.isFinite(context.temperature) ? context.temperature : 0.5,
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
  const imageUrl = clean(record(message.metadata).image_url)
  if (!event.from || (!text && !imageUrl)) fail(400, 'WhatsApp recipient and message are required.')

  const url = `${GRAPH_BASE_URL}/${env.whatsappGraphVersion}/${encodeURIComponent(env.whatsappPhoneNumberId)}/messages`
  const body = imageUrl
    ? {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: event.from,
      type: 'image',
      context: event.messageId ? { message_id: event.messageId } : undefined,
      image: {
        link: imageUrl,
        caption: text.slice(0, 1024),
      },
    }
    : {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: event.from,
      type: 'text',
      context: event.messageId ? { message_id: event.messageId } : undefined,
      text: {
        preview_url: false,
        body: text,
      },
    }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.whatsappAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
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
        whatsapp_outbound_type: message.metadata?.image_url ? 'image' : 'text',
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

  if (!event.isSupportedText && canProcessWhatsappMedia(event)) {
    try {
      const resolved = await resolveWhatsappMediaText(env, event)
      if (resolved?.text) {
        event.text = resolved.text
        event.isSupportedText = true
        event.mediaProcessing = resolved.metadata
      }
    } catch (error) {
      event.mediaProcessing = {
        media_processed: false,
        media_processing_error: error instanceof Error ? error.message : 'Unknown media processing error.',
      }
    }
  }

  const incomingContent = event.isSupportedText
    ? event.text
    : `[Mensagem ${event.type || 'nao textual'} recebida no WhatsApp]`

  const savedIncoming = await saveIncomingMessage(supabase, session.id, event, incomingContent)
  await touchSession(supabase, session.id)

  if (await markPossiblePaymentProof(supabase, session, event, savedIncoming)) {
    const proofReply = 'Comprovante recebido. Vou deixar marcado para a equipe dar baixa manual, combinado?'
    const savedProofReply = await saveAssistantMessage(supabase, session.id, event, proofReply, 0, {
      payment_proof_received: true,
      delivery_status: 'pending',
    })
    await sendAndMarkDelivered(supabase, env, event, savedProofReply)
    return { sessionId: session.id, paymentProofReceived: true }
  }

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

  if (hasConfirmedOrderContext(session) && await updateCustomerRegistrationFromMessage(supabase, session, event.text)) {
    const reply = 'Recebi os dados e atualizei o cadastro. Obrigado!\n\nDe 0 a 10, como avalia o atendimento?'
    const savedRegistrationReply = await saveAssistantMessage(supabase, session.id, event, reply, 0, {
      registration_update: true,
    })
    await sendAndMarkDelivered(supabase, env, event, savedRegistrationReply)
    return { sessionId: session.id, ai: true, registrationUpdate: true }
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
  const recoveredContext = recoverPetbotContextFromHistory(session.context || {}, session, history)
  const sessionForGuard = { ...session, context: recoveredContext }
  const customer = await ensureCustomerProfile(supabase, sessionForGuard)
  const customerContext = buildCustomerContext(customer)
  const llmInterpretation = await interpretPetbotMessageWithLlm({
    apiKey: env.openAiApiKey,
    model: env.openAiModel,
    temperature: 0.5,
    timeoutMs: env.openAiTimeoutMs,
    message: debouncedMessage,
    history,
    state: recoveredContext,
    customerContext,
    mediaContext: event.media?.description || '',
  })
  const searchText = buildPetbotSearchText(
    buildInterpretedPetbotSearchText(buildCatalogSearchText(history, debouncedMessage), llmInterpretation as any),
    recoveredContext,
  )
  const context = await loadStoreContext(supabase, sessionForGuard, searchText, env, history)
  context.customerContext = customerContext

  let guard = runPetbotGuard({
    message: debouncedMessage,
    session: sessionForGuard,
    customer,
    products: context.products,
    appointments: context.appointments,
    settings: context,
    interpretation: llmInterpretation,
  })
  let reply = clean(guard.reply)
  let state = guard.state
  let orderResult: LooseRecord | null = null
  let redraftResult: LooseRecord | null = null
  const mediaMessages = Array.isArray(guard.mediaMessages) ? guard.mediaMessages : []
  const primaryImage = mediaMessages.find((item: LooseRecord) => item?.type === 'image' && item.imageUrl)

  if (guard.shouldSaveOrder) {
    try {
      orderResult = await createConfirmedPetshopOrderViaRpc(supabase, sessionForGuard, context, guard.orderArgs)
      state = markPetbotOrderSaved(state, orderResult)
      reply = buildPetbotConfirmationReply(state, context)
    } catch (error) {
      state = markPetbotOrderError(state, error)
      reply = 'Parece que houve um problema ao registrar o pedido. Vou chamar um atendente para resolver isso antes de finalizar.'
      guard = { ...guard, needsHuman: true, action: 'salvamento_falhou', handoffTarget: 'atendente' } as any
      console.warn('PetBot guarded order save failed', error)
    }
  }

  if (guard.guardDirective?.allowLlmRedraft) {
    redraftResult = await redraftPetbotReplyWithLlm({
      apiKey: env.openAiApiKey,
      model: context.modelName || env.openAiModel,
      temperature: context.temperature,
      timeoutMs: env.openAiTimeoutMs,
      message: debouncedMessage,
      history,
      directive: guard.guardDirective,
      fallbackReply: reply,
    }) as LooseRecord
    if (redraftResult?.reply) reply = clean(redraftResult.reply)
  }

  if (!reply) fail(502, 'PetBot response came back empty.')

  const mergedContext = mergePetbotContext({
    ...(sessionForGuard.context || {}),
    ...(orderResult ? {
      last_sale_id: orderResult.sale_id,
      last_order_id: orderResult.order_id || null,
      last_appointment_id: orderResult.appointment_id || null,
      last_payment_status: orderResult.payment_status || null,
    } : {}),
  }, state)
  const botSentAt = new Date().toISOString()

  const sessionUpdate = await supabase
    .from('chat_sessions')
    .update({
      intent: guard.intent || detectConversationIntent(event.text),
      context: mergedContext,
      ...(state?.customerName ? { customer_name: state.customerName } : {}),
      ...(guard.shouldSaveRating ? { csat_score: guard.rating, status: 'closed', closed_at: botSentAt } : {}),
      ...(guard.needsHuman ? { status: 'human' } : {}),
      last_message_at: botSentAt,
    })
    .eq('id', session.id)
    .select('id, context')
    .maybeSingle()

  if (sessionUpdate.error) {
    console.error('Unable to persist PetBot session state', sessionUpdate.error)
    fail(500, `Unable to update chat session: ${sessionUpdate.error.message}`)
  }

  if (!sessionUpdate.data || !hasPetbotState(sessionUpdate.data.context)) {
    console.error('PetBot session update did not persist context.petbot', {
      sessionId: session.id,
      hasUpdatedSession: Boolean(sessionUpdate.data),
    })
    fail(500, 'Unable to persist PetBot session state.')
  }

  const savedReply = await saveAssistantMessage(supabase, session.id, event, reply, 0, {
    ...(primaryImage ? {
      image_url: primaryImage.imageUrl,
      media_attachments: mediaMessages,
    } : {}),
    petbot_state: snapshotPetbotState(state),
    petbot_guard: {
      version: state?.version || 1,
      intent: guard.intent,
      action: guard.action,
      blocked_reasons: state?.blockedReasons || [],
      needs_human: Boolean(guard.needsHuman),
      needs_handoff: Boolean(guard.needsHuman),
      handoff_target: (guard as any).handoffTarget || (guard.intent === 'veterinaria' ? 'veterinaria' : 'atendente'),
      allow_llm_redraft: Boolean(guard.guardDirective?.allowLlmRedraft),
      llm_interpretation: llmInterpretation,
      llm_redraft_used: Boolean(redraftResult?.used),
      llm_redraft_validation: redraftResult?.validation || null,
      order_saved: Boolean(orderResult),
    },
  })

  const finalSessionUpdate = await supabase
    .from('chat_sessions')
    .update({
      context: mergedContext,
      last_message_at: botSentAt,
    })
    .eq('id', session.id)
    .select('id, context')
    .maybeSingle()

  if (finalSessionUpdate.error || !finalSessionUpdate.data || !hasPetbotState(finalSessionUpdate.data.context)) {
    console.error('PetBot final session state did not persist after assistant message', {
      sessionId: session.id,
      error: finalSessionUpdate.error,
      hasFinalSession: Boolean(finalSessionUpdate.data),
    })
    fail(500, 'Unable to persist PetBot session state after assistant response.')
  }

  await sendAndMarkDelivered(supabase, env, event, savedReply)

  return { sessionId: session.id, ai: false, guarded: true, intent: guard.intent || detectConversationIntent(debouncedMessage) }
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
