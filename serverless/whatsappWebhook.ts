import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
// @ts-ignore The shared runtime is authored as ESM JavaScript for the Node API too.
import { respondToChatMessage } from '../server/lib/chat.js'

const DEFAULT_MODULE_ID = 'petshop'
const DEFAULT_OPENAI_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe-2025-12-15'
const DEFAULT_OPENAI_VISION_MODEL = 'gpt-4o-mini-2024-07-18'
const DEFAULT_WHATSAPP_REPLY_DEBOUNCE_MS = 1_000
const MAX_BLOCKING_WHATSAPP_REPLY_DEBOUNCE_MS = 1_500
const MAX_WHATSAPP_BURST_WINDOW_MS = 10_000
const MAX_WHATSAPP_BURST_MESSAGES = 6
const GRAPH_BASE_URL = 'https://graph.facebook.com'
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024
const MAX_WHATSAPP_TEXT_CHARS = 4096
type LooseRecord = Record<string, any>

type WebhookEnv = {
  supabaseUrl: string
  supabaseServiceRoleKey: string
  openAiApiKey: string
  openAiTranscriptionModel: string
  openAiVisionModel: string
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
    openAiTranscriptionModel: optionalEnv('OPENAI_TRANSCRIPTION_MODEL', DEFAULT_OPENAI_TRANSCRIPTION_MODEL),
    openAiVisionModel: optionalEnv('OPENAI_VISION_MODEL', optionalEnv('OPENAI_MODEL', DEFAULT_OPENAI_VISION_MODEL)),
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

async function loadRecentIncomingBurst(
  supabase: SupabaseClient,
  sessionId: string,
  savedMessage: SavedMessage,
  fallback: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content, sent_at')
    .eq('session_id', sessionId)
    .order('sent_at', { ascending: false })
    .limit(MAX_WHATSAPP_BURST_MESSAGES + 2)

  if (error || !data?.length) return fallback

  const ordered = [...data].reverse()
  const lastAssistantIndex = ordered.reduce(
    (index, message, currentIndex) => message.role === 'assistant' || message.role === 'human_agent' ? currentIndex : index,
    -1,
  )
  const currentTimestamp = Date.parse(savedMessage.sent_at)
  const burst = ordered
    .slice(lastAssistantIndex + 1)
    .filter((message) => {
      if (message.role !== 'user' || !clean(message.content)) return false
      const messageTimestamp = Date.parse(message.sent_at)
      if (!Number.isFinite(currentTimestamp) || !Number.isFinite(messageTimestamp)) return true
      return currentTimestamp - messageTimestamp <= MAX_WHATSAPP_BURST_WINDOW_MS
    })
    .slice(-MAX_WHATSAPP_BURST_MESSAGES)
    .map((message) => clean(message.content))
    .filter(Boolean)

  const combined = burst.join('\n').slice(0, 4000).trim()
  return combined || fallback
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

  // O WhatsApp e o painel interno passam pelo mesmo runtime. O webhook fica
  // responsavel apenas por autenticar a Meta, persistir a entrada e entregar a
  // resposta ao cliente; regras, contexto, handoff e transacoes vivem no core.
  const runtimeMessage = env.whatsappReplyDebounceMs > 0
    ? await loadRecentIncomingBurst(supabase, session.id, savedIncoming, event.text)
    : event.text
  const sharedResult = await respondToChatMessage(supabase as any, session.id, runtimeMessage, {
    source: 'whatsapp',
    skipUserPersistence: true,
    mediaContext: event.media?.description || '',
    assistantMetadata: {
      channel: 'whatsapp',
      delivery_status: 'pending',
      whatsapp_reply_to_message_id: event.messageId,
      whatsapp_phone_number_id: event.phoneNumberId,
    },
  })
  await sendAndMarkDelivered(supabase, env, event, sharedResult.savedMessage as SavedMessage)
  return { sessionId: session.id, ai: true, guarded: false, engine: 'petbot_agent_v3' }

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
