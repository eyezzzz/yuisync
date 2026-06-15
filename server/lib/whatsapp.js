import { createHmac, timingSafeEqual } from 'node:crypto'
import { adminSupabase } from './supabase.js'
import { serverEnv } from './env.js'
import { HttpError } from './http.js'
import { respondToChatMessage } from './chat.js'
import { logger } from './logger.js'

const DEFAULT_MODULE_ID = 'petshop'
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024
const MAX_WHATSAPP_TEXT_CHARS = 4096
const GRAPH_BASE_URL = 'https://graph.facebook.com'

function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeGraphVersion(value) {
  const version = clean(value || serverEnv.whatsappGraphVersion || 'v25.0')
  return version.replace(/^\/+/, '') || 'v25.0'
}

function normalizePhoneIdentifier(value) {
  const raw = clean(value)
  const digits = raw.replace(/\D/g, '')
  return digits || raw
}

function timestampToIso(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return new Date().toISOString()
  }
  return new Date(numeric * 1000).toISOString()
}

function isMissingBotChannelSchema(error) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('tenant_bot_channels') && (
    message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('relation')
    || message.includes('column')
  )
}

function extractMessageText(message) {
  if (!message || typeof message !== 'object') return ''

  if (message.type === 'text') return clean(message.text?.body)
  if (message.type === 'button') return clean(message.button?.text)
  if (message.type === 'interactive') {
    return clean(message.interactive?.button_reply?.title || message.interactive?.list_reply?.title)
  }

  return clean(
    message.image?.caption
    || message.document?.caption
    || message.video?.caption
  )
}

function extractMessageMedia(message) {
  const type = clean(message?.type)
  const media = message?.[type] && typeof message[type] === 'object' ? message[type] : null
  const id = clean(media?.id)
  if (!id) return null
  return {
    id,
    type,
    mime_type: clean(media?.mime_type),
    sha256: clean(media?.sha256),
    caption: clean(media?.caption),
  }
}

function extractWhatsappEvents(body) {
  const events = []
  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      if (change?.field && change.field !== 'messages') continue

      const value = change?.value || {}
      const phoneNumberId = clean(value.metadata?.phone_number_id)
      const contacts = new Map((value.contacts || []).map((contact) => [clean(contact.wa_id), contact]))

      for (const message of value.messages || []) {
        const from = normalizePhoneIdentifier(message.from)
        const text = extractMessageText(message)
        const contact = contacts.get(clean(message.from)) || contacts.get(from) || null

        events.push({
          phoneNumberId,
          from,
          messageId: clean(message.id),
          timestamp: message.timestamp,
          type: clean(message.type || 'unknown'),
          text,
          isSupportedText: Boolean(text),
          profileName: clean(contact?.profile?.name) || 'Cliente WhatsApp',
          media: extractMessageMedia(message),
          mediaProcessing: null,
          raw: message,
        })
      }
    }
  }
  return events
}

function findFirstPhoneNumberId(body) {
  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      const phoneNumberId = clean(change?.value?.metadata?.phone_number_id)
      if (phoneNumberId) return phoneNumberId
    }
  }
  return ''
}

function isLikelyMetaTestWebhook(body, phoneNumberId = '') {
  const events = extractWhatsappEvents(body)
  if (events.length !== 1) return false

  const event = events[0]
  const samplePhoneIds = new Set(['123456123', 'PHONE_NUMBER_ID'])
  const sampleSenders = new Set(['16315551181', '16505551111', '15555555555'])
  const text = clean(event.text).toLowerCase()

  return (
    samplePhoneIds.has(clean(phoneNumberId || event.phoneNumberId))
    || sampleSenders.has(clean(event.from))
    || text.includes('this is a test message')
  )
}

export function summarizeWhatsappWebhook(body) {
  let changes = 0
  let messages = 0
  let statuses = 0
  let phoneNumberId = ''

  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      changes += 1
      const value = change?.value || {}
      phoneNumberId ||= clean(value.metadata?.phone_number_id)
      messages += Array.isArray(value.messages) ? value.messages.length : 0
      statuses += Array.isArray(value.statuses) ? value.statuses.length : 0
    }
  }

  return {
    object: clean(body?.object),
    entries: Array.isArray(body?.entry) ? body.entry.length : 0,
    changes,
    messages,
    statuses,
    phoneNumberId,
  }
}

async function resolveDefaultTenantId() {
  if (serverEnv.whatsappTenantId) return serverEnv.whatsappTenantId

  const activeTenantResult = await adminSupabase
    .from('tenants')
    .select('id')
    .eq('active', true)
    .limit(2)

  if (!activeTenantResult.error && (activeTenantResult.data || []).length === 1) {
    return activeTenantResult.data[0].id
  }

  const { data, error } = await adminSupabase
    .from('tenants')
    .select('id')
    .limit(2)

  if (error) {
    throw new HttpError(500, 'Unable to resolve default tenant for WhatsApp.')
  }

  if ((data || []).length === 1) return data[0].id

  throw new HttpError(500, 'Unable to resolve WhatsApp tenant automatically. Configure tenant_bot_channels for each business.')
}

async function resolveDbWhatsappConfig({ tenantId = '', moduleId = DEFAULT_MODULE_ID, phoneNumberId = '', verifyToken = '' } = {}) {
  let query = adminSupabase
    .from('tenant_bot_channels')
    .select('*')
    .eq('channel', 'whatsapp')
    .eq('active', true)
    .limit(50)

  if (tenantId) query = query.eq('tenant_id', tenantId)
  if (moduleId) query = query.eq('module_id', moduleId)

  const { data, error } = await query
  if (error) {
    if (isMissingBotChannelSchema(error)) return null
    throw new HttpError(500, 'Unable to load WhatsApp channel configuration.')
  }

  const row = (data || []).find((candidate) => {
    const rowPhone = clean(candidate.whatsapp_phone_number_id)
    const rowVerifyToken = clean(candidate.whatsapp_verify_token)
    if (phoneNumberId && rowPhone !== phoneNumberId) return false
    if (verifyToken && rowVerifyToken !== verifyToken) return false
    return true
  })

  if (!row) return null

  return {
    source: 'database',
    tenantId: row.tenant_id,
    moduleId: row.module_id || moduleId || DEFAULT_MODULE_ID,
    phoneNumberId: clean(row.whatsapp_phone_number_id || serverEnv.whatsappPhoneNumberId),
    accessToken: clean(row.whatsapp_access_token || serverEnv.whatsappAccessToken),
    verifyToken: clean(row.whatsapp_verify_token || serverEnv.whatsappVerifyToken),
    appSecret: clean(row.whatsapp_app_secret || serverEnv.whatsappAppSecret),
    graphVersion: normalizeGraphVersion(serverEnv.whatsappGraphVersion),
  }
}

async function resolveEnvWhatsappConfig({
  tenantId = '',
  moduleId = DEFAULT_MODULE_ID,
  phoneNumberId = '',
  verifyToken = '',
  requireMessaging = false,
  allowPhoneMismatch = false,
} = {}) {
  const envPhoneNumberId = clean(serverEnv.whatsappPhoneNumberId)
  const envVerifyToken = clean(serverEnv.whatsappVerifyToken)

  if (phoneNumberId && envPhoneNumberId && phoneNumberId !== envPhoneNumberId && !allowPhoneMismatch) return null
  if (verifyToken && envVerifyToken && verifyToken !== envVerifyToken) return null
  if (!envPhoneNumberId && !envVerifyToken && !serverEnv.whatsappAccessToken) return null

  const resolvedTenantId = tenantId || serverEnv.whatsappTenantId || (requireMessaging ? await resolveDefaultTenantId() : '')

  return {
    source: 'environment',
    tenantId: resolvedTenantId,
    moduleId: moduleId || serverEnv.whatsappModuleId || DEFAULT_MODULE_ID,
    phoneNumberId: envPhoneNumberId || phoneNumberId,
    accessToken: clean(serverEnv.whatsappAccessToken),
    verifyToken: envVerifyToken,
    appSecret: clean(serverEnv.whatsappAppSecret),
    graphVersion: normalizeGraphVersion(serverEnv.whatsappGraphVersion),
  }
}

export async function resolveWhatsappConfig(options = {}) {
  const normalized = {
    ...options,
    phoneNumberId: clean(options.phoneNumberId),
    verifyToken: clean(options.verifyToken),
    tenantId: clean(options.tenantId),
    moduleId: clean(options.moduleId || serverEnv.whatsappModuleId || DEFAULT_MODULE_ID),
  }

  const dbConfig = await resolveDbWhatsappConfig(normalized)
  const config = dbConfig
    || (options.allowEnvFallback !== false
      ? await resolveEnvWhatsappConfig({
        ...normalized,
        requireMessaging: Boolean(options.requireMessaging),
        allowPhoneMismatch: Boolean(options.allowEnvFallback && !options.requireMessaging),
      })
      : null)

  if (!config) {
    throw new HttpError(500, 'WhatsApp channel is not configured.')
  }

  if (options.requireMessaging && (!config.phoneNumberId || !config.accessToken)) {
    throw new HttpError(500, 'WhatsApp phone number ID or access token is missing.')
  }

  return config
}

export async function verifyWhatsappWebhookChallenge(url) {
  const mode = url.searchParams.get('hub.mode') || ''
  const verifyToken = url.searchParams.get('hub.verify_token') || ''
  const challenge = url.searchParams.get('hub.challenge') || ''

  if (mode !== 'subscribe' || !challenge) {
    throw new HttpError(400, 'Invalid WhatsApp webhook verification request.')
  }

  let config
  try {
    config = await resolveWhatsappConfig({ verifyToken, requireMessaging: false })
  } catch (error) {
    if (verifyToken) {
      throw new HttpError(403, 'WhatsApp webhook verify token rejected.')
    }
    throw error
  }

  if (!verifyToken || verifyToken !== config.verifyToken) {
    throw new HttpError(403, 'WhatsApp webhook verify token rejected.')
  }

  return challenge
}

export async function readWhatsappWebhookBody(req) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase()
  if (contentType && !contentType.includes('application/json')) {
    throw new HttpError(415, 'Content-Type must be application/json.')
  }

  const chunks = []
  let size = 0

  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_WEBHOOK_BODY_BYTES) {
      throw new HttpError(413, 'Payload too large.')
    }
    chunks.push(chunk)
  }

  const rawBody = Buffer.concat(chunks).toString('utf8')
  if (!rawBody) return { body: {}, rawBody }

  try {
    return { body: JSON.parse(rawBody), rawBody }
  } catch {
    throw new HttpError(400, 'Invalid JSON payload.')
  }
}

function assertSignature(secret, rawBody, signatureHeader) {
  if (!secret) return

  const signature = clean(Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader)
  if (!signature.startsWith('sha256=')) {
    throw new HttpError(401, 'Missing WhatsApp webhook signature.')
  }

  const received = signature.slice('sha256='.length)
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const receivedBuffer = Buffer.from(received, 'hex')
  const expectedBuffer = Buffer.from(expected, 'hex')

  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) {
    throw new HttpError(401, 'Invalid WhatsApp webhook signature.')
  }
}

export async function verifyWhatsappWebhookSignature(body, rawBody, headers = {}) {
  const phoneNumberId = findFirstPhoneNumberId(body)
  const config = await resolveWhatsappConfig({
    phoneNumberId,
    requireMessaging: false,
    allowEnvFallback: isLikelyMetaTestWebhook(body, phoneNumberId),
  })
  assertSignature(config.appSecret, rawBody, headers['x-hub-signature-256'])
}

export async function sendWhatsappText(config, { to, text, replyToMessageId = '' }) {
  const recipient = normalizePhoneIdentifier(to)
  const body = clean(text).slice(0, MAX_WHATSAPP_TEXT_CHARS)

  if (!recipient || !body) {
    throw new HttpError(400, 'WhatsApp recipient and text are required.')
  }

  const url = `${GRAPH_BASE_URL}/${normalizeGraphVersion(config.graphVersion)}/${encodeURIComponent(config.phoneNumberId)}/messages`
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'text',
    text: {
      preview_url: false,
      body,
    },
  }

  if (replyToMessageId) {
    payload.context = { message_id: replyToMessageId }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = result?.error?.message || `HTTP ${response.status}`
    throw new HttpError(502, `Unable to send WhatsApp message: ${detail}`)
  }

  return result
}

export async function sendWhatsappImage(config, { to, imageUrl, caption = '', replyToMessageId = '' }) {
  const recipient = normalizePhoneIdentifier(to)
  const link = clean(imageUrl)
  const body = clean(caption).slice(0, 1024)

  if (!recipient || !/^https?:\/\/\S+$/i.test(link)) {
    throw new HttpError(400, 'WhatsApp recipient and public image URL are required.')
  }

  const url = `${GRAPH_BASE_URL}/${normalizeGraphVersion(config.graphVersion)}/${encodeURIComponent(config.phoneNumberId)}/messages`
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'image',
    image: {
      link,
      caption: body,
    },
  }

  if (replyToMessageId) {
    payload.context = { message_id: replyToMessageId }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = result?.error?.message || `HTTP ${response.status}`
    throw new HttpError(502, `Unable to send WhatsApp image: ${detail}`)
  }

  return result
}

async function getOrCreateWhatsappSession(config, event) {
  const tenantId = config.tenantId || await resolveDefaultTenantId()
  const moduleId = config.moduleId || DEFAULT_MODULE_ID
  const customerPhone = normalizePhoneIdentifier(event.from)
  const customerName = event.profileName || 'Cliente WhatsApp'

  const { data: existing, error: existingError } = await adminSupabase
    .from('chat_sessions')
    .select('id, module_id, tenant_id, channel, customer_phone, customer_name, status')
    .eq('module_id', moduleId)
    .eq('tenant_id', tenantId)
    .eq('customer_phone', customerPhone)
    .maybeSingle()

  if (existingError) {
    throw new HttpError(500, 'Unable to load WhatsApp chat session.')
  }

  const now = new Date().toISOString()
  if (existing) {
    const patch = {
      channel: 'whatsapp',
      last_message_at: now,
      ...(existing.status === 'closed' ? { status: 'bot', closed_at: null, opened_at: now } : {}),
      ...(!existing.customer_name && customerName ? { customer_name: customerName } : {}),
    }

    const { data: updated, error: updateError } = await adminSupabase
      .from('chat_sessions')
      .update(patch)
      .eq('id', existing.id)
      .select('id, module_id, tenant_id, channel, customer_phone, customer_name, status')
      .single()

    if (updateError) {
      throw new HttpError(500, 'Unable to update WhatsApp chat session.')
    }

    return updated
  }

  const payload = {
    module_id: moduleId,
    tenant_id: tenantId,
    customer_name: customerName,
    customer_phone: customerPhone,
    channel: 'whatsapp',
    status: 'bot',
    last_message_at: now,
    opened_at: now,
  }

  const { data: created, error: createError } = await adminSupabase
    .from('chat_sessions')
    .insert(payload)
    .select('id, module_id, tenant_id, channel, customer_phone, customer_name, status')
    .single()

  if (!createError) return created

  if (createError.code === '23505') {
    return getOrCreateWhatsappSession(config, event)
  }

  throw new HttpError(500, 'Unable to create WhatsApp chat session.')
}

async function hasProcessedWhatsappMessage(sessionId, whatsappMessageId) {
  if (!whatsappMessageId) return false

  const { data, error } = await adminSupabase
    .from('chat_messages')
    .select('id')
    .eq('session_id', sessionId)
    .contains('metadata', { whatsapp_message_id: whatsappMessageId })
    .limit(1)

  if (error) {
    logger.warn('Unable to check WhatsApp message idempotency', { sessionId, error: error.message })
    return false
  }

  return (data || []).length > 0
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

async function downloadWhatsappMedia(config, mediaId) {
  const infoUrl = `${GRAPH_BASE_URL}/${normalizeGraphVersion(config.graphVersion)}/${encodeURIComponent(mediaId)}`
  const infoResponse = await fetch(infoUrl, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  })
  const info = await infoResponse.json().catch(() => ({}))
  if (!infoResponse.ok || !clean(info.url)) {
    const detail = info?.error?.message || `HTTP ${infoResponse.status}`
    throw new HttpError(502, `Unable to load WhatsApp media info: ${detail}`)
  }

  const mediaResponse = await fetch(clean(info.url), {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  })
  if (!mediaResponse.ok) {
    throw new HttpError(502, `Unable to download WhatsApp media: HTTP ${mediaResponse.status}`)
  }

  const arrayBuffer = await mediaResponse.arrayBuffer()
  const mimeType = clean(mediaResponse.headers.get('content-type')) || clean(info.mime_type)
  return { bytes: Buffer.from(arrayBuffer), mimeType }
}

async function transcribeWhatsappAudio(config, media) {
  const downloaded = await downloadWhatsappMedia(config, clean(media.id))
  const form = new FormData()
  const file = new Blob([downloaded.bytes], { type: downloaded.mimeType || 'audio/ogg' })
  form.append('model', serverEnv.openAiTranscriptionModel)
  form.append('file', file, `whatsapp-audio.${mediaExtension(downloaded.mimeType, 'ogg')}`)

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${serverEnv.openAiApiKey}` },
    body: form,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = payload?.error?.message || `HTTP ${response.status}`
    throw new HttpError(502, `Unable to transcribe WhatsApp audio: ${detail}`)
  }

  return clean(payload.text)
}

async function describeWhatsappImage(config, media, caption = '') {
  const downloaded = await downloadWhatsappMedia(config, clean(media.id))
  const mimeType = downloaded.mimeType || clean(media.mime_type) || 'image/jpeg'
  const dataUrl = `data:${mimeType};base64,${downloaded.bytes.toString('base64')}`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serverEnv.openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: serverEnv.openAiVisionModel,
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
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = payload?.error?.message || `HTTP ${response.status}`
    throw new HttpError(502, `Unable to describe WhatsApp image: ${detail}`)
  }

  return clean(payload.choices?.[0]?.message?.content)
}

function canProcessWhatsappMedia(event) {
  return Boolean(event.media?.id) && ['audio', 'voice', 'image'].includes(clean(event.type))
}

async function resolveWhatsappMediaText(config, event) {
  const media = event.media || {}
  const type = clean(event.type)
  const caption = clean(media.caption) || clean(event.text)

  if (type === 'audio' || type === 'voice') {
    const transcript = await transcribeWhatsappAudio(config, media)
    if (!transcript) return null
    return {
      text: transcript,
      metadata: { media_processed: true, media_processing: 'audio_transcription' },
    }
  }

  if (type === 'image') {
    const description = await describeWhatsappImage(config, media, caption)
    if (!description) return null
    const requiresHuman = description.includes('VETERINARY_IMAGE_REQUIRES_HUMAN')
    const cleanDescription = description.replace('VETERINARY_IMAGE_REQUIRES_HUMAN', '').trim()
    return {
      text: requiresHuman
        ? `quero falar com humano. Imagem veterinaria sensivel: ${cleanDescription || 'imagem recebida'}`
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

async function updateMessageMetadata(messageId, metadata) {
  const { error } = await adminSupabase
    .from('chat_messages')
    .update({ metadata })
    .eq('id', messageId)

  if (error) {
    logger.warn('Unable to update chat message metadata', { messageId, error: error.message })
  }
}

async function touchSession(sessionId) {
  const { error } = await adminSupabase
    .from('chat_sessions')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', sessionId)

  if (error) {
    throw new HttpError(500, 'Unable to update chat session timestamp.')
  }
}

function parseContext(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function isPossiblePaymentProof(event) {
  const type = clean(event.type)
  const mime = clean(event.media?.mime_type).toLowerCase()
  return type === 'image' || type === 'document' || mime.includes('pdf')
}

async function markPossiblePaymentProof(session, event, savedIncoming = {}) {
  if (!isPossiblePaymentProof(event)) return false
  const context = parseContext(session.context)
  const saleId = clean(context.last_sale_id)
  if (!saleId) return false
  const receivedAt = new Date().toISOString()
  const proofMetadata = {
    chat_message_id: savedIncoming.id || null,
    whatsapp_message_id: event.messageId,
    whatsapp_media: event.media || null,
    received_at: receivedAt,
  }
  const { data, error } = await adminSupabase
    .from('sales')
    .update({
      payment_status: 'comprovante_recebido',
      payment_proof_received_at: receivedAt,
      payment_proof_metadata: proofMetadata,
    })
    .eq('id', saleId)
    .in('payment_status', ['aguardando_comprovante', 'comprovante_recebido'])
    .select('id')
    .maybeSingle()
  if (error || !data) return false

  await adminSupabase
    .from('service_delivery_orders')
    .update({
      payment_status: 'comprovante_recebido',
      payment_proof_received_at: receivedAt,
      payment_proof_metadata: proofMetadata,
    })
    .eq('sale_id', saleId)

  await adminSupabase
    .from('chat_sessions')
    .update({
      context: {
        ...context,
        petbot: {
          ...parseContext(context.petbot),
          paymentProof: {
            status: 'comprovante_recebido',
            requested: true,
            received: true,
            mediaId: clean(event.media?.id),
            url: '',
          },
        },
      },
      last_message_at: receivedAt,
    })
    .eq('id', session.id)

  return true
}

function buildInboundMetadata(event) {
  return {
    channel: 'whatsapp',
    whatsapp_message_id: event.messageId,
    whatsapp_from: event.from,
    whatsapp_phone_number_id: event.phoneNumberId,
    whatsapp_type: event.type,
    whatsapp_timestamp: event.timestamp || null,
    whatsapp_media: event.media || null,
    ...(event.mediaProcessing || {}),
  }
}

function buildDeliveryMetadata(metadata, delivery, status = 'sent') {
  return {
    ...(metadata || {}),
    channel: 'whatsapp',
    delivery_status: status,
    whatsapp_outbound_message_id: delivery?.messages?.[0]?.id || null,
    whatsapp_delivery_payload: delivery || null,
  }
}

async function sendAndMarkDelivered(config, message, { to, replyToMessageId = '' }) {
  try {
    const imageUrl = clean(message.metadata?.image_url)
    const delivery = imageUrl
      ? await sendWhatsappImage(config, { to, imageUrl, caption: message.content, replyToMessageId })
      : await sendWhatsappText(config, { to, text: message.content, replyToMessageId })
    const metadata = buildDeliveryMetadata(message.metadata, delivery, 'sent')
    metadata.whatsapp_outbound_type = imageUrl ? 'image' : 'text'
    await updateMessageMetadata(message.id, metadata)
    return { ...message, metadata }
  } catch (error) {
    const metadata = {
      ...(message.metadata || {}),
      channel: 'whatsapp',
      delivery_status: 'failed',
      delivery_error: error instanceof Error ? error.message : 'Unknown WhatsApp delivery error.',
    }
    await updateMessageMetadata(message.id, metadata)
    throw error
  }
}

async function saveAssistantFallback(sessionId, content, metadata) {
  const { data, error } = await adminSupabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      role: 'assistant',
      content,
      metadata,
      sent_at: new Date().toISOString(),
    })
    .select('id, role, content, metadata, tokens_used, sent_at')
    .single()

  if (error) {
    throw new HttpError(500, 'Unable to save WhatsApp assistant fallback.')
  }

  return data
}

async function insertIncomingWhatsappMessage(sessionId, event, content) {
  const { data, error } = await adminSupabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      role: 'user',
      content,
      metadata: buildInboundMetadata(event),
      sent_at: timestampToIso(event.timestamp),
    })
    .select('id')
    .single()

  if (error) {
    throw new HttpError(500, 'Unable to save WhatsApp user message.')
  }
  return data
}

async function processIncomingWhatsappMessage(event) {
  const config = await resolveWhatsappConfig({
    phoneNumberId: event.phoneNumberId,
    requireMessaging: true,
  })
  const session = await getOrCreateWhatsappSession(config, event)

  if (await hasProcessedWhatsappMessage(session.id, event.messageId)) {
    return { sessionId: session.id, duplicate: true }
  }

  if (!event.isSupportedText && canProcessWhatsappMedia(event)) {
    try {
      const resolved = await resolveWhatsappMediaText(config, event)
      if (resolved?.text) {
        event.text = resolved.text
        event.isSupportedText = true
        event.mediaProcessing = resolved.metadata
      }
    } catch (error) {
      event.mediaProcessing = {
        media_processed: false,
        media_processing_error: error instanceof Error ? error.message : 'Unknown media processing error',
      }
    }
  }

  if (isPossiblePaymentProof(event) && clean(parseContext(session.context).last_sale_id)) {
    const savedIncoming = await insertIncomingWhatsappMessage(session.id, event, event.text || `[Comprovante ${event.type || 'midia'} recebido no WhatsApp]`)
    await touchSession(session.id)
    if (await markPossiblePaymentProof(session, event, savedIncoming)) {
      const savedProof = await saveAssistantFallback(session.id, 'Comprovante recebido. Vou deixar marcado para a equipe dar baixa manual, combinado?', {
        channel: 'whatsapp',
        delivery_status: 'pending',
        payment_proof_received: true,
        whatsapp_reply_to_message_id: event.messageId,
        whatsapp_phone_number_id: event.phoneNumberId,
      })
      await sendAndMarkDelivered(config, savedProof, { to: event.from, replyToMessageId: event.messageId })
      return { sessionId: session.id, paymentProofReceived: true }
    }
    return { sessionId: session.id, paymentProofIgnored: true }
  }

  if (!event.isSupportedText) {
    const placeholder = `[Mensagem ${event.type || 'nao textual'} recebida no WhatsApp]`
    await insertIncomingWhatsappMessage(session.id, event, placeholder)
    await touchSession(session.id)

    if (session.status !== 'human') {
      const fallback = 'Recebi sua mensagem, mas por enquanto consigo responder por texto aqui. Pode me enviar sua duvida em texto?'
      const savedFallback = await saveAssistantFallback(session.id, fallback, {
        channel: 'whatsapp',
        delivery_status: 'pending',
        unsupported_whatsapp_type: event.type,
      })
      await sendAndMarkDelivered(config, savedFallback, { to: event.from, replyToMessageId: event.messageId })
    }

    return { sessionId: session.id, unsupported: true }
  }

  if (session.status === 'human') {
    await insertIncomingWhatsappMessage(session.id, event, event.text)
    await touchSession(session.id)
    return { sessionId: session.id, handedToHuman: true }
  }

  const response = await respondToChatMessage(adminSupabase, session.id, event.text, {
    userMetadata: buildInboundMetadata(event),
    assistantMetadata: {
      channel: 'whatsapp',
      delivery_status: 'pending',
      whatsapp_reply_to_message_id: event.messageId,
      whatsapp_phone_number_id: event.phoneNumberId,
    },
  })

  await sendAndMarkDelivered(config, response.savedMessage, {
    to: event.from,
    replyToMessageId: event.messageId,
  })

  return { sessionId: session.id, ai: true }
}

export async function processWhatsappWebhook(body) {
  if (body?.object && body.object !== 'whatsapp_business_account') {
    return { ok: true, processed: 0, ignored: true }
  }

  const events = extractWhatsappEvents(body)
  if (isLikelyMetaTestWebhook(body)) {
    logger.info('WhatsApp test webhook ignored after verification', summarizeWhatsappWebhook(body))
    return { ok: true, processed: 0, test: true }
  }

  const results = []

  for (const event of events) {
    try {
      results.push(await processIncomingWhatsappMessage(event))
    } catch (error) {
      logger.error('WhatsApp message processing failed', {
        error,
        phoneNumberId: event.phoneNumberId,
        messageId: event.messageId,
      })
      results.push({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  }

  return { ok: true, processed: results.length, results }
}

export async function sendHumanChatMessage({ session, message, senderId }) {
  const content = clean(message)
  if (!content) {
    throw new HttpError(400, 'Message cannot be empty.')
  }
  if (content.length > MAX_WHATSAPP_TEXT_CHARS) {
    throw new HttpError(400, 'Message is too long.')
  }

  const isWhatsapp = clean(session.channel || '').toLowerCase() === 'whatsapp'
  const baseMetadata = {
    channel: session.channel || 'internal',
    sent_by: senderId || null,
    delivery_status: isWhatsapp ? 'pending' : 'not_required',
  }

  const { data: saved, error: insertError } = await adminSupabase
    .from('chat_messages')
    .insert({
      session_id: session.id,
      role: 'human_agent',
      content,
      metadata: baseMetadata,
      sent_at: new Date().toISOString(),
    })
    .select('id, role, content, metadata, tokens_used, sent_at')
    .single()

  if (insertError) {
    throw new HttpError(500, 'Unable to save human chat message.')
  }

  await touchSession(session.id)

  if (!isWhatsapp) {
    return { savedMessage: saved, delivery: null }
  }

  try {
    const config = await resolveWhatsappConfig({
      tenantId: session.tenant_id,
      moduleId: session.module_id,
      requireMessaging: true,
    })
    const delivered = await sendAndMarkDelivered(config, saved, {
      to: session.customer_phone,
    })

    return { savedMessage: delivered, delivery: delivered.metadata?.whatsapp_delivery_payload || null }
  } catch (error) {
    await updateMessageMetadata(saved.id, {
      ...(saved.metadata || {}),
      channel: 'whatsapp',
      delivery_status: 'failed',
      delivery_error: error instanceof Error ? error.message : 'Unknown WhatsApp delivery error.',
    })
    throw error
  }
}
