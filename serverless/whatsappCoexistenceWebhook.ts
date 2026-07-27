import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingHttpHeaders, ServerResponse } from 'node:http'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type LooseRecord = Record<string, any>

type CoexistenceWebhookInput = {
  body: unknown
  rawBody: string
  headers: IncomingHttpHeaders
  res: ServerResponse
}

type NormalizedHistoryMessage = {
  externalMessageId: string
  phoneNumberId: string
  contactWaId: string
  direction: 'inbound' | 'outbound' | 'unknown'
  messageType: string
  text: string
  occurredAt: string
  raw: LooseRecord
}

const HISTORY_FIELDS = new Set(['history'])
const COEXISTENCE_FIELDS = new Set(['history', 'smb_message_echoes', 'smb_app_state_sync'])
const MAX_TEXT_LENGTH = 16_000

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function record(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {}
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function normalizePhoneIdentifier(value: unknown): string {
  const raw = clean(value)
  const digits = raw.replace(/\D/g, '')
  return digits || raw
}

function timestampToIso(value: unknown): string {
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric * 1000).toISOString()
  const parsed = Date.parse(clean(value))
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString()
}

function extractMessageText(message: LooseRecord): string {
  const type = clean(message.type)
  if (type === 'text') return clean(record(message.text).body).slice(0, MAX_TEXT_LENGTH)
  if (type === 'button') return clean(record(message.button).text).slice(0, MAX_TEXT_LENGTH)
  if (type === 'interactive') {
    const interactive = record(message.interactive)
    return clean(record(interactive.button_reply).title || record(interactive.list_reply).title).slice(0, MAX_TEXT_LENGTH)
  }
  return clean(
    record(message.image).caption
      || record(message.video).caption
      || record(message.document).caption
      || message.body
      || message.text,
  ).slice(0, MAX_TEXT_LENGTH)
}

function inferDirection(message: LooseRecord): 'inbound' | 'outbound' | 'unknown' {
  const explicit = clean(message.direction).toLowerCase()
  if (explicit === 'inbound' || explicit === 'incoming' || explicit === 'received') return 'inbound'
  if (explicit === 'outbound' || explicit === 'outgoing' || explicit === 'sent') return 'outbound'
  if (message.from_me === true || message.fromMe === true) return 'outbound'
  if (message.from_me === false || message.fromMe === false) return 'inbound'
  return 'unknown'
}

function collectMessageCandidates(value: unknown, output: LooseRecord[], seen = new Set<unknown>()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)

  if (Array.isArray(value)) {
    for (const item of value) collectMessageCandidates(item, output, seen)
    return
  }

  const candidate = record(value)
  const hasMessageIdentity = Boolean(clean(candidate.id || candidate.message_id || candidate.messageId))
  const hasMessageShape = Boolean(candidate.type || candidate.text || candidate.body || candidate.timestamp)
  if (hasMessageIdentity && hasMessageShape) output.push(candidate)

  for (const nested of Object.values(candidate)) collectMessageCandidates(nested, output, seen)
}

function extractPhoneNumberId(body: unknown): string {
  for (const entryValue of list(record(body).entry)) {
    for (const changeValue of list(record(entryValue).changes)) {
      const value = record(record(changeValue).value)
      const id = normalizePhoneIdentifier(record(value.metadata).phone_number_id || value.phone_number_id)
      if (id) return id
    }
  }
  return ''
}

function extractFields(body: unknown): string[] {
  const fields: string[] = []
  for (const entryValue of list(record(body).entry)) {
    for (const changeValue of list(record(entryValue).changes)) {
      const field = clean(record(changeValue).field)
      if (field) fields.push(field)
    }
  }
  return fields
}

export function isWhatsappCoexistencePayload(body: unknown): boolean {
  return extractFields(body).some((field) => COEXISTENCE_FIELDS.has(field))
}

function normalizeHistoryMessages(body: unknown, fallbackPhoneNumberId: string): NormalizedHistoryMessage[] {
  const candidates: LooseRecord[] = []
  collectMessageCandidates(body, candidates)
  const unique = new Map<string, NormalizedHistoryMessage>()

  for (const message of candidates) {
    const externalMessageId = clean(message.id || message.message_id || message.messageId)
    if (!externalMessageId) continue
    const phoneNumberId = normalizePhoneIdentifier(
      message.phone_number_id
        || record(message.metadata).phone_number_id
        || fallbackPhoneNumberId,
    )
    const contactWaId = normalizePhoneIdentifier(
      message.from
        || message.to
        || message.wa_id
        || message.recipient_id
        || message.sender_id,
    )
    const normalized: NormalizedHistoryMessage = {
      externalMessageId,
      phoneNumberId,
      contactWaId,
      direction: inferDirection(message),
      messageType: clean(message.type || 'unknown'),
      text: extractMessageText(message),
      occurredAt: timestampToIso(message.timestamp || message.sent_at || message.created_at),
      raw: message,
    }
    unique.set(`${phoneNumberId}:${externalMessageId}`, normalized)
  }

  return [...unique.values()]
}

function assertSignature(rawBody: string, headers: IncomingHttpHeaders) {
  const appSecret = clean(process.env.WHATSAPP_APP_SECRET)
  if (!appSecret) throw new Error('Missing required environment variable: WHATSAPP_APP_SECRET')

  const signature = clean(headers['x-hub-signature-256'])
  if (!signature.startsWith('sha256=')) throw new Error('Missing WhatsApp webhook signature.')

  const received = Buffer.from(signature.slice('sha256='.length), 'hex')
  const expected = Buffer.from(createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex'), 'hex')
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new Error('Invalid WhatsApp webhook signature.')
  }
}

function createAdminClient() {
  const supabaseUrl = clean(process.env.SUPABASE_URL)
  const serviceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase service credentials.')
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function resolveIntegration(
  supabase: SupabaseClient,
  phoneNumberId: string,
): Promise<{ id: string | null; tenantId: string }> {
  if (phoneNumberId) {
    const lookup = await supabase
      .from('whatsapp_integrations')
      .select('id,tenant_id')
      .eq('phone_number_id', phoneNumberId)
      .eq('active', true)
      .maybeSingle()

    if (!lookup.error && lookup.data) {
      return { id: String(lookup.data.id), tenantId: String(lookup.data.tenant_id) }
    }
  }

  const fallbackTenantId = clean(process.env.WHATSAPP_TENANT_ID)
  if (!fallbackTenantId) throw new Error('Unable to resolve WhatsApp tenant for coexistence event.')
  return { id: null, tenantId: fallbackTenantId }
}

async function persistHistoryMessages(
  supabase: SupabaseClient,
  eventId: string,
  integrationId: string | null,
  tenantId: string,
  messages: NormalizedHistoryMessage[],
) {
  if (!messages.length) return 0

  const rows = messages.map((message) => ({
    tenant_id: tenantId,
    integration_id: integrationId,
    coexistence_event_id: eventId,
    external_message_id: message.externalMessageId,
    phone_number_id: message.phoneNumberId || null,
    contact_wa_id: message.contactWaId || null,
    direction: message.direction,
    message_type: message.messageType,
    content: message.text || null,
    occurred_at: message.occurredAt,
    historical: true,
    should_reply: false,
    luna_status: 'pending_anonymization',
    raw_payload: message.raw,
  }))

  const inserted = await supabase
    .from('whatsapp_history_messages')
    .upsert(rows, { onConflict: 'tenant_id,external_message_id', ignoreDuplicates: true })
    .select('id')

  if (inserted.error) throw new Error(`Unable to persist WhatsApp history messages: ${inserted.error.message}`)
  return inserted.data?.length || 0
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(JSON.stringify(payload))
}

export async function handleWhatsappCoexistenceWebhook({ body, rawBody, headers, res }: CoexistenceWebhookInput) {
  try {
    assertSignature(rawBody, headers)
    const fields = extractFields(body)
    const phoneNumberId = extractPhoneNumberId(body)
    const supabase = createAdminClient()
    const integration = await resolveIntegration(supabase, phoneNumberId)

    const eventInsert = await supabase
      .from('whatsapp_coexistence_events')
      .insert({
        tenant_id: integration.tenantId,
        integration_id: integration.id,
        phone_number_id: phoneNumberId || null,
        fields,
        payload: body,
        processing_status: 'received',
      })
      .select('id')
      .single()

    if (eventInsert.error) throw new Error(`Unable to persist coexistence event: ${eventInsert.error.message}`)

    let historyMessages = 0
    if (fields.some((field) => HISTORY_FIELDS.has(field))) {
      historyMessages = await persistHistoryMessages(
        supabase,
        String(eventInsert.data.id),
        integration.id,
        integration.tenantId,
        normalizeHistoryMessages(body, phoneNumberId),
      )
    }

    await supabase
      .from('whatsapp_coexistence_events')
      .update({
        processing_status: 'stored',
        processed_at: new Date().toISOString(),
        normalized_messages: historyMessages,
      })
      .eq('id', eventInsert.data.id)

    sendJson(res, 200, {
      ok: true,
      coexistence: true,
      fields,
      historyMessages,
      autoReplySuppressed: true,
    })
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : 'Unexpected coexistence webhook error.',
    })
  }
}
