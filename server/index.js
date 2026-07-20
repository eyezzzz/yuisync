import 'dotenv/config'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { URL } from 'node:url'
import { adminSupabase, createUserSupabase } from './lib/supabase.js'
import { serverEnv } from './lib/env.js'
import { HttpError, getBearerToken, readJsonBody, sendJson, validateUUID, getClientIp } from './lib/http.js'
import {
  hasModuleAccess,
  isStaffTypeSchemaError,
  isTenantSchemaError,
  isModuleAdmin,
  listManageableProfiles,
  normalizeManagedEmail,
  normalizeManagedPassword,
  normalizeUserPayload,
  requireAuthenticatedProfile,
  validateManagedEmail,
  validateManagedPassword,
} from './lib/auth.js'
import { respondToChatMessage } from './lib/chat.js'
import { handleFocusWebhook, issueFiscalForSale } from './lib/fiscal.js'
import { searchProductImageCandidates } from './lib/productImages.js'
import { executeCheckout } from './lib/checkout.js'
import {
  processWhatsappWebhook,
  readWhatsappWebhookBody,
  sendHumanChatMessage,
  summarizeWhatsappWebhook,
  verifyWhatsappWebhookChallenge,
  verifyWhatsappWebhookSignature,
} from './lib/whatsapp.js'
import { apiLimiter, chatLimiter, adminWriteLimiter, fiscalLimiter } from './lib/rateLimiter.js'
import { logger } from './lib/logger.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function normalizeTenantIds(rawTenantIds) {
  if (!Array.isArray(rawTenantIds)) return []
  return [...new Set(rawTenantIds
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean))]
}

function omitStaffType(payload) {
  const next = { ...payload }
  delete next.staff_type
  return next
}

async function createTenantFromRequestIfNeeded(requester, body, canCreateBusiness) {
  if (!canCreateBusiness) return null
  const tenantName = typeof body.newTenantName === 'string' ? body.newTenantName.trim() : ''
  if (!tenantName) return null

  const baseSlug = slugify(tenantName) || `cliente-${Date.now()}`
  let slug = baseSlug

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await adminSupabase
      .from('tenants')
      .insert({ name: tenantName, slug, active: true })
      .select('id, name, slug')
      .single()

    if (!error) return data
    if (isTenantSchemaError(error)) return null

    const msg = String(error.message || '').toLowerCase()
    if (msg.includes('duplicate') || msg.includes('unique')) {
      slug = `${baseSlug}-${Math.floor(Math.random() * 9999)}`
      continue
    }

    throw new HttpError(400, error.message || 'Unable to create business.')
  }

  throw new HttpError(400, 'Unable to create business.')
}

async function syncManagedUserTenants(userId, requester, body) {
  const canCreateBusiness = requester.role === 'admin' || (body.scopeModuleId && isModuleAdmin(requester, body.scopeModuleId))
  const createdTenant = await createTenantFromRequestIfNeeded(requester, body, canCreateBusiness)

  if (createdTenant?.id && requester.role !== 'admin') {
    await adminSupabase
      .from('profile_tenants')
      .upsert({
        profile_id: requester.id,
        tenant_id: createdTenant.id,
        role: 'owner',
        active: true,
      }, { onConflict: 'profile_id,tenant_id' })

    await adminSupabase
      .from('profiles')
      .update({ active_tenant_id: createdTenant.id })
      .eq('id', requester.id)
  }

  let tenantIds = requester.role === 'admin'
    ? normalizeTenantIds(body.tenantIds)
    : (requester.active_tenant_id ? [requester.active_tenant_id] : [])

  if (createdTenant?.id) {
    tenantIds = [createdTenant.id, ...tenantIds]
  }
  tenantIds = [...new Set(tenantIds)].filter(Boolean)

  if (tenantIds.length === 0) {
    return { createdTenant: createdTenant || null, activeTenantId: null }
  }

  const role = body.role === 'admin' ? 'owner' : 'member'
  const rows = tenantIds.map((tenantId) => ({
    profile_id: userId,
    tenant_id: tenantId,
    role,
    active: true,
  }))

  const { error: upsertError } = await adminSupabase
    .from('profile_tenants')
    .upsert(rows, { onConflict: 'profile_id,tenant_id' })

  if (upsertError && !isTenantSchemaError(upsertError)) {
    throw new HttpError(500, 'Unable to save tenant access.')
  }

  const { data: existingLinks, error: existingLinksError } = await adminSupabase
    .from('profile_tenants')
    .select('tenant_id')
    .eq('profile_id', userId)

  if (existingLinksError && !isTenantSchemaError(existingLinksError)) {
    throw new HttpError(500, 'Unable to load tenant links.')
  }

  const toDelete = (existingLinks || [])
    .map((row) => row.tenant_id)
    .filter((tenantId) => !tenantIds.includes(tenantId))

  if (toDelete.length > 0) {
    const { error: deleteError } = await adminSupabase
      .from('profile_tenants')
      .delete()
      .eq('profile_id', userId)
      .in('tenant_id', toDelete)

    if (deleteError && !isTenantSchemaError(deleteError)) {
      throw new HttpError(500, 'Unable to update tenant links.')
    }
  }

  const activeTenantIdFromBody = typeof body.activeTenantId === 'string' ? body.activeTenantId : null
  const activeTenantId = activeTenantIdFromBody && tenantIds.includes(activeTenantIdFromBody)
    ? activeTenantIdFromBody
    : tenantIds[0]

  const { error: profileTenantError } = await adminSupabase
    .from('profiles')
    .update({ active_tenant_id: activeTenantId })
    .eq('id', userId)

  if (profileTenantError && !isTenantSchemaError(profileTenantError)) {
    throw new HttpError(500, 'Unable to update active business.')
  }

  return {
    createdTenant: createdTenant || null,
    activeTenantId,
  }
}

// ── CORS ─────────────────────────────────────────────────────────────────────

function getCorsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    Vary: 'Origin',
  }

  if (origin && serverEnv.allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }

  return headers
}

function ensureAllowedOrigin(req) {
  const origin = req.headers.origin

  if (!origin) {
    return
  }

  if (!serverEnv.allowedOrigins.includes(origin)) {
    throw new HttpError(403, 'Origin not allowed.')
  }
}

function sendText(res, status, text, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  })
  res.end(text)
}

function ensureChatSessionAccess(requester, session) {
  if (!hasModuleAccess(requester, session.module_id)) {
    throw new HttpError(403, 'You do not have permission to access this chat.')
  }

  if (requester.role === 'admin') return

  const requesterTenantId = typeof requester.active_tenant_id === 'string' ? requester.active_tenant_id : ''
  if (!requesterTenantId) {
    throw new HttpError(403, 'Select an active business before replying to chats.')
  }
  if (!session.tenant_id) {
    throw new HttpError(403, 'Chat session is missing tenant scope and cannot be answered safely.')
  }
  if (session.tenant_id !== requesterTenantId) {
    throw new HttpError(403, 'You can only answer chats from your active business.')
  }
}

// ── Route handlers ───────────────────────────────────────────────────────────

function normalizeChatUserMessages(raw) {
  if (!Array.isArray(raw)) return []

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const content = typeof entry.content === 'string' ? entry.content.trim() : ''
      if (!content) return null

      return {
        client_message_id: typeof entry.client_message_id === 'string' ? entry.client_message_id : '',
        content,
        sent_at: typeof entry.sent_at === 'string' ? entry.sent_at : '',
      }
    })
    .filter(Boolean)
    .slice(0, 10)
}

async function handleChatRespond(req, res) {
  const origin = req.headers.origin
  const accessToken = getBearerToken(req)
  const requester = await requireAuthenticatedProfile(accessToken)
  const body = await readJsonBody(req)
  const userSupabase = createUserSupabase(accessToken)

  if (!body.sessionId) {
    throw new HttpError(400, 'sessionId is required.')
  }

  validateUUID(body.sessionId, 'sessionId')
  const requestedTenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : ''
  if (requestedTenantId) {
    validateUUID(requestedTenantId, 'tenantId')
  }

  const { data: session, error } = await userSupabase
    .from('chat_sessions')
    .select('id, module_id, tenant_id')
    .eq('id', body.sessionId)
    .maybeSingle()

  if (error || !session) {
    throw new HttpError(404, 'Chat session not found.')
  }

  if (!isModuleAdmin(requester, session.module_id)) {
    throw new HttpError(403, 'You do not have permission to answer this chat.')
  }

  if (requester.role !== 'admin') {
    const requesterTenantId = typeof requester.active_tenant_id === 'string' ? requester.active_tenant_id : ''
    if (!requesterTenantId) {
      throw new HttpError(403, 'Select an active business before replying to chats.')
    }
    if (!session.tenant_id) {
      throw new HttpError(403, 'Chat session is missing tenant scope and cannot be answered safely.')
    }
    if (session.tenant_id !== requesterTenantId) {
      throw new HttpError(403, 'You can only answer chats from your active business.')
    }
  }

  if (requestedTenantId && session.tenant_id && requestedTenantId !== session.tenant_id) {
    throw new HttpError(403, 'Requested tenant does not match this chat session.')
  }

  const userMessages = normalizeChatUserMessages(body.userMessages)
  const result = await respondToChatMessage(adminSupabase, body.sessionId, body.message, userMessages.length ? { userMessages } : {})
  sendJson(res, 200, result, getCorsHeaders(origin))
}

async function handleChatHumanMessage(req, res) {
  const origin = req.headers.origin
  const accessToken = getBearerToken(req)
  const requester = await requireAuthenticatedProfile(accessToken)
  const body = await readJsonBody(req)
  const userSupabase = createUserSupabase(accessToken)

  if (!body.sessionId) {
    throw new HttpError(400, 'sessionId is required.')
  }

  validateUUID(body.sessionId, 'sessionId')

  const { data: session, error } = await userSupabase
    .from('chat_sessions')
    .select('id, module_id, tenant_id, channel, customer_phone, status')
    .eq('id', body.sessionId)
    .maybeSingle()

  if (error || !session) {
    throw new HttpError(404, 'Chat session not found.')
  }

  ensureChatSessionAccess(requester, session)

  const result = await sendHumanChatMessage({
    session,
    message: body.message,
    senderId: requester.id,
  })

  sendJson(res, 200, result, getCorsHeaders(origin))
}

async function handleProductImageSuggestions(req, res) {
  const origin = req.headers.origin
  const accessToken = getBearerToken(req)
  const requester = await requireAuthenticatedProfile(accessToken)
  const body = await readJsonBody(req)
  const moduleId = typeof body.moduleId === 'string' && body.moduleId.trim()
    ? body.moduleId.trim()
    : 'petshop'
  const tenantId = typeof body.tenantId === 'string' && body.tenantId.trim()
    ? body.tenantId.trim()
    : ''

  if (!hasModuleAccess(requester, moduleId)) {
    throw new HttpError(403, 'You do not have permission to search images for this module.')
  }

  if (tenantId) validateUUID(tenantId, 'tenantId')
  if (requester.role !== 'admin') {
    const requesterTenantId = typeof requester.active_tenant_id === 'string' ? requester.active_tenant_id : ''
    if (!requesterTenantId) throw new HttpError(403, 'Select an active business before searching product images.')
    if (tenantId && tenantId !== requesterTenantId) {
      throw new HttpError(403, 'You can only search images for your active business.')
    }
  }

  const result = await searchProductImageCandidates({
    name: body.name,
    barcode: body.barcode,
    category: body.category,
    brand: body.brand,
    limit: body.limit,
  })

  sendJson(res, 200, result, getCorsHeaders(origin))
}

async function handleWhatsappWebhookVerify(req, res, url) {
  const challenge = await verifyWhatsappWebhookChallenge(url)
  sendText(res, 200, challenge)
}

async function handleWhatsappWebhookReceive(req, res) {
  const origin = req.headers.origin
  const { body, rawBody } = await readWhatsappWebhookBody(req)
  const summary = summarizeWhatsappWebhook(body)
  const hasSignature = Boolean(req.headers['x-hub-signature-256'])

  logger.info('WhatsApp webhook received', { ...summary, hasSignature })
  try {
    await verifyWhatsappWebhookSignature(body, rawBody, req.headers)
  } catch (error) {
    logger.warn('WhatsApp webhook rejected', {
      ...summary,
      hasSignature,
      error: error instanceof Error ? error.message : 'Unknown webhook verification error.',
    })
    throw error
  }

  logger.info('WhatsApp webhook accepted', summary)
  sendJson(res, 200, { ok: true, accepted: true }, getCorsHeaders(origin))

  processWhatsappWebhook(body).catch((error) => {
    logger.error('WhatsApp webhook background processing failed', { error })
  })
}

async function handleUsersList(req, res, url) {
  const origin = req.headers.origin
  const accessToken = getBearerToken(req)
  const requester = await requireAuthenticatedProfile(accessToken)
  const scopeModuleId = url.searchParams.get('module_id') || null
  const tenantId = url.searchParams.get('tenant_id') || null
  const profiles = await listManageableProfiles(requester, scopeModuleId, tenantId)

  sendJson(res, 200, { profiles }, getCorsHeaders(origin))
}

async function handleUserCreate(req, res) {
  const origin = req.headers.origin
  const accessToken = getBearerToken(req)
  const requester = await requireAuthenticatedProfile(accessToken)
  const body = await readJsonBody(req)
  const email = normalizeManagedEmail(body.email)
  const password = normalizeManagedPassword(body.password)

  if (!email || !password) {
    throw new HttpError(400, 'Email and password are required.')
  }

  validateManagedEmail(email)
  validateManagedPassword(password)

  const profileData = normalizeUserPayload(body, requester, body.scopeModuleId)
  const { data, error } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: profileData.full_name,
    },
  })

  if (error || !data?.user) {
    throw new HttpError(400, error?.message || 'Unable to create user.')
  }

  let profileError = null
  {
    const response = await adminSupabase
      .from('profiles')
      .update(profileData)
      .eq('id', data.user.id)

    profileError = response.error
  }

  if (profileError && isStaffTypeSchemaError(profileError)) {
    const fallbackResponse = await adminSupabase
      .from('profiles')
      .update(omitStaffType(profileData))
      .eq('id', data.user.id)

    profileError = fallbackResponse.error
  }

  if (profileError) {
    throw new HttpError(500, 'Unable to save profile permissions.')
  }

  const tenantResult = await syncManagedUserTenants(data.user.id, requester, body)

  logger.info('User created', { userId: data.user.id, role: profileData.role })

  sendJson(res, 201, {
    ok: true,
    createdTenant: tenantResult.createdTenant,
    activeTenantId: tenantResult.activeTenantId,
  }, getCorsHeaders(origin))
}

async function handleUserUpdate(req, res, userId) {
  const origin = req.headers.origin
  const accessToken = getBearerToken(req)
  const requester = await requireAuthenticatedProfile(accessToken)
  const body = await readJsonBody(req)
  const password = normalizeManagedPassword(body.password)

  validateUUID(userId, 'userId')

  const { data: existingProfile, error: existingProfileError } = await adminSupabase
    .from('profiles')
    .select('id, role, active, allowed_modules, module_permissions, active_tenant_id')
    .eq('id', userId)
    .maybeSingle()

  if (existingProfileError || !existingProfile) {
    throw new HttpError(404, 'User not found.')
  }

  if (existingProfile.role === 'admin' && requester.role !== 'admin') {
    throw new HttpError(403, 'Only global admins can edit global admins.')
  }

  if (requester.role !== 'admin') {
    if (!body.scopeModuleId || !isModuleAdmin(requester, body.scopeModuleId)) {
      throw new HttpError(403, 'You do not have permission to edit this user.')
    }

    if (!hasModuleAccess(existingProfile, body.scopeModuleId)) {
      throw new HttpError(403, 'This user is outside your module scope.')
    }
  }

  const profileData = normalizeUserPayload(body, requester, body.scopeModuleId, existingProfile)
  let updateError = null
  {
    const response = await adminSupabase.from('profiles').update(profileData).eq('id', userId)
    updateError = response.error
  }

  if (updateError && isStaffTypeSchemaError(updateError)) {
    const fallbackResponse = await adminSupabase
      .from('profiles')
      .update(omitStaffType(profileData))
      .eq('id', userId)
    updateError = fallbackResponse.error
  }

  if (updateError) {
    throw new HttpError(500, 'Unable to update user.')
  }

  if (password) {
    validateManagedPassword(password)
    const { error: authUpdateError } = await adminSupabase.auth.admin.updateUserById(userId, { password })
    if (authUpdateError) {
      throw new HttpError(500, 'Unable to update user password.')
    }
  }

  const tenantResult = await syncManagedUserTenants(userId, requester, body)

  sendJson(res, 200, {
    ok: true,
    createdTenant: tenantResult.createdTenant,
    activeTenantId: tenantResult.activeTenantId,
  }, getCorsHeaders(origin))
}

async function handleUserStatusUpdate(req, res, userId) {
  const origin = req.headers.origin
  const accessToken = getBearerToken(req)
  const requester = await requireAuthenticatedProfile(accessToken)
  const body = await readJsonBody(req)

  validateUUID(userId, 'userId')

  if (requester.role !== 'admin') {
    throw new HttpError(403, 'Only global admins can block or unblock accounts.')
  }

  if (requester.id === userId) {
    throw new HttpError(400, 'You cannot change your own active status.')
  }

  const { error } = await adminSupabase
    .from('profiles')
    .update({ active: Boolean(body.active) })
    .eq('id', userId)

  if (error) {
    throw new HttpError(500, 'Unable to update account status.')
  }

  sendJson(res, 200, { ok: true }, getCorsHeaders(origin))
}

async function handleFiscalIssueSale(req, res, saleId) {
  const origin = req.headers.origin
  const accessToken = getBearerToken(req)
  await requireAuthenticatedProfile(accessToken)

  validateUUID(saleId, 'saleId')

  const result = await issueFiscalForSale(accessToken, saleId)
  sendJson(res, 200, result, getCorsHeaders(origin))
}

async function handlePetshopCheckout(req, res) {
  const requestId = randomUUID()
  try {
    const result = await executeCheckout(getBearerToken(req), await readJsonBody(req))
    sendJson(res, 201, { success: true, data: result, error: null, requestId }, getCorsHeaders(req.headers.origin))
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    const message = error instanceof Error ? error.message : 'Falha ao concluir venda.'
    sendJson(res, status, {
      success: false,
      data: null,
      error: { code: `CHECKOUT_${status}`, message },
      requestId,
    }, getCorsHeaders(req.headers.origin))
  }
}

async function handleFiscalFocusWebhook(req, res, url) {
  const body = await readJsonBody(req)
  const token = url.searchParams.get('token') || ''
  const result = await handleFocusWebhook(body, token)
  sendJson(res, 200, result, getCorsHeaders(req.headers.origin))
}

// ── Deep health check ────────────────────────────────────────────────────────

async function handleHealthCheck(req, res, corsHeaders) {
  const checks = { supabase: false }

  try {
    const { data, error } = await adminSupabase
      .from('profiles')
      .select('id')
      .limit(1)

    checks.supabase = !error
  } catch {
    checks.supabase = false
  }

  const allHealthy = Object.values(checks).every(Boolean)
  const status = allHealthy ? 200 : 503

  sendJson(res, status, {
    ok: allHealthy,
    timestamp: new Date().toISOString(),
    checks,
  }, corsHeaders)
}

// ── Server ───────────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const origin = req.headers.origin
  const corsHeaders = getCorsHeaders(origin)
  const clientIp = getClientIp(req)

  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)

    if (url.pathname.startsWith('/api/')) {
      ensureAllowedOrigin(req)
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders)
      res.end()
      return
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      await handleHealthCheck(req, res, corsHeaders)
      return
    }

    // ── Rate-limited routes ────────────────────────────────────────────────

    if (req.method === 'GET' && url.pathname === '/api/whatsapp/webhook') {
      apiLimiter.consume(`api:${clientIp}`)
      await handleWhatsappWebhookVerify(req, res, url)
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/whatsapp/webhook') {
      apiLimiter.consume(`api:${clientIp}`)
      await handleWhatsappWebhookReceive(req, res)
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/chat/respond') {
      apiLimiter.consume(`api:${clientIp}`)
      chatLimiter.consume(`chat:${clientIp}`)
      await handleChatRespond(req, res)
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/chat/human-message') {
      apiLimiter.consume(`api:${clientIp}`)
      chatLimiter.consume(`chat:${clientIp}`)
      await handleChatHumanMessage(req, res)
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/products/image-suggestions') {
      apiLimiter.consume(`api:${clientIp}`)
      await handleProductImageSuggestions(req, res)
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/petshop/checkout') {
      apiLimiter.consume(`checkout:${clientIp}`)
      await handlePetshopCheckout(req, res)
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/users') {
      apiLimiter.consume(`api:${clientIp}`)
      await handleUsersList(req, res, url)
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/users') {
      apiLimiter.consume(`api:${clientIp}`)
      adminWriteLimiter.consume(`admin:${clientIp}`)
      await handleUserCreate(req, res)
      return
    }

    const statusMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/)
    if (req.method === 'PATCH' && statusMatch) {
      apiLimiter.consume(`api:${clientIp}`)
      adminWriteLimiter.consume(`admin:${clientIp}`)
      await handleUserStatusUpdate(req, res, statusMatch[1])
      return
    }

    const userMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/)
    if (req.method === 'PATCH' && userMatch) {
      apiLimiter.consume(`api:${clientIp}`)
      adminWriteLimiter.consume(`admin:${clientIp}`)
      await handleUserUpdate(req, res, userMatch[1])
      return
    }

    const fiscalIssueMatch = url.pathname.match(/^\/api\/fiscal\/sales\/([^/]+)\/issue$/)
    if (req.method === 'POST' && fiscalIssueMatch) {
      apiLimiter.consume(`api:${clientIp}`)
      fiscalLimiter.consume(`fiscal:${clientIp}`)
      await handleFiscalIssueSale(req, res, fiscalIssueMatch[1])
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/fiscal/webhooks/focus') {
      apiLimiter.consume(`api:${clientIp}`)
      fiscalLimiter.consume(`fiscal:${clientIp}`)
      await handleFiscalFocusWebhook(req, res, url)
      return
    }

    sendJson(res, 404, { error: 'Route not found.' }, corsHeaders)
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    const message = error instanceof Error ? error.message : 'Unexpected server error.'

    if (status >= 500) {
      logger.error('Request error', { error, status, ip: clientIp, url: req.url })
    }

    sendJson(res, status, { error: message }, corsHeaders)
  }
})

// ── Graceful shutdown ────────────────────────────────────────────────────────

let isShuttingDown = false

function gracefulShutdown(signal) {
  if (isShuttingDown) return
  isShuttingDown = true

  logger.info(`Received ${signal}. Shutting down gracefully...`)

  server.close(() => {
    logger.info('HTTP server closed.')
    process.exit(0)
  })

  // Force close after 10 seconds if connections are still open
  setTimeout(() => {
    logger.warn('Forcing shutdown after timeout.')
    process.exit(1)
  }, 10_000).unref()
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error })
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { error: reason })
})

// ── Start ────────────────────────────────────────────────────────────────────

server.listen(serverEnv.apiPort, () => {
  logger.info(`YuiSync secure API listening on port ${serverEnv.apiPort}`, {
    port: serverEnv.apiPort,
    origins: serverEnv.allowedOrigins,
    production: serverEnv.isProduction,
  })
})
