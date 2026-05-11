import type { IncomingMessage, ServerResponse } from 'node:http'
import { adminSupabase, createUserSupabase } from '../server/lib/supabase.js'
import { HttpError, getBearerToken, readJsonBody, sendJson, validateUUID } from '../server/lib/http.js'
import {
  hasModuleAccess,
  isStaffTypeSchemaError,
  isTenantSchemaError,
  isModuleAdmin,
  listManageableProfiles,
  normalizeManagedEmail,
  normalizeUserPayload,
  requireAuthenticatedProfile,
  validateManagedEmail,
  validateManagedPassword,
} from '../server/lib/auth.js'
import { respondToChatMessage } from '../server/lib/chat.js'
import { handleFocusWebhook, issueFiscalForSale } from '../server/lib/fiscal.js'
import { sendHumanChatMessage } from '../server/lib/whatsapp.js'

type JsonBody = Record<string, unknown>
type NormalizedProfileData = Record<string, unknown> & { full_name: string }
type Profile = {
  id: string
  role?: string | null
  active?: boolean | null
  allowed_modules?: unknown
  module_permissions?: unknown
  active_tenant_id?: string | null
}

const listManageableProfilesForRoute = listManageableProfiles as (...args: any[]) => Promise<unknown[]>
const normalizeUserPayloadForRoute = normalizeUserPayload as (...args: any[]) => NormalizedProfileData

function sendEmpty(res: ServerResponse, status = 204) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end()
}

function handleApiError(res: ServerResponse, error: unknown) {
  const status = error instanceof HttpError ? error.status : 500
  const message = error instanceof Error ? error.message : 'Erro ao processar a solicitacao.'
  if (status >= 500) {
    console.error('[dashboard-api]', error)
  }
  sendJson(res, status, { error: message })
}

function getUrl(req: IncomingMessage) {
  return new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`)
}

function normalizeTenantIds(rawTenantIds: unknown) {
  if (!Array.isArray(rawTenantIds)) return []
  return [...new Set(rawTenantIds
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean))]
}

function omitStaffType(payload: Record<string, unknown>) {
  const next = { ...payload }
  delete next.staff_type
  return next
}

async function loadActiveTenantIds() {
  const { data, error } = await adminSupabase
    .from('tenants')
    .select('id')
    .eq('active', true)

  if (error && isTenantSchemaError(error)) return []
  if (error) throw new HttpError(500, 'Nao foi possivel carregar os negocios ativos.')

  return (data || []).map((row) => row.id).filter(Boolean)
}

async function validateTenantIds(tenantIds: string[]) {
  if (tenantIds.length === 0) return

  const { data, error } = await adminSupabase
    .from('tenants')
    .select('id')
    .in('id', tenantIds)
    .eq('active', true)

  if (error && isTenantSchemaError(error)) return
  if (error) throw new HttpError(500, 'Nao foi possivel validar os negocios.')

  const foundIds = new Set((data || []).map((row) => row.id))
  const missingIds = tenantIds.filter((tenantId) => !foundIds.has(tenantId))
  if (missingIds.length > 0) {
    throw new HttpError(400, 'Um dos negocios selecionados nao existe ou esta inativo.')
  }
}

async function syncManagedUserTenants(userId: string, requester: Profile, body: JsonBody) {
  const targetRole = body.role === 'admin' ? 'admin' : 'employee'
  let tenantIds = requester.role === 'admin'
    ? normalizeTenantIds(body.tenantIds)
    : (requester.active_tenant_id ? [requester.active_tenant_id] : [])

  if (requester.role === 'admin' && targetRole === 'admin' && tenantIds.length === 0) {
    tenantIds = await loadActiveTenantIds()
  }

  if (requester.role === 'admin' && targetRole !== 'admin' && tenantIds.length === 0) {
    throw new HttpError(400, 'Selecione pelo menos um negocio para este usuario.')
  }

  tenantIds = [...new Set(tenantIds)].filter(Boolean)
  await validateTenantIds(tenantIds)

  if (tenantIds.length === 0) {
    const { error } = await adminSupabase
      .from('profiles')
      .update({ active_tenant_id: null })
      .eq('id', userId)

    if (error && !isTenantSchemaError(error)) {
      throw new HttpError(500, 'Nao foi possivel atualizar o negocio principal.')
    }

    return { activeTenantId: null }
  }

  const role = targetRole === 'admin' ? 'owner' : 'member'
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
    throw new HttpError(500, 'Nao foi possivel salvar o acesso aos negocios.')
  }

  const { data: existingLinks, error: existingLinksError } = await adminSupabase
    .from('profile_tenants')
    .select('tenant_id')
    .eq('profile_id', userId)

  if (existingLinksError && !isTenantSchemaError(existingLinksError)) {
    throw new HttpError(500, 'Nao foi possivel carregar os vinculos de negocio.')
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
      throw new HttpError(500, 'Nao foi possivel atualizar os vinculos de negocio.')
    }
  }

  const requestedActiveTenantId = typeof body.activeTenantId === 'string' ? body.activeTenantId : null
  const activeTenantId = requestedActiveTenantId && tenantIds.includes(requestedActiveTenantId)
    ? requestedActiveTenantId
    : tenantIds[0]

  const { error: profileTenantError } = await adminSupabase
    .from('profiles')
    .update({ active_tenant_id: activeTenantId })
    .eq('id', userId)

  if (profileTenantError && !isTenantSchemaError(profileTenantError)) {
    throw new HttpError(500, 'Nao foi possivel atualizar o negocio principal.')
  }

  return { activeTenantId }
}

function normalizeCreateUserError(message = '') {
  const lower = message.toLowerCase()
  if (lower.includes('already') || lower.includes('registered') || lower.includes('duplicate')) {
    return 'Este email ja possui acesso cadastrado.'
  }
  if (lower.includes('password')) {
    return 'A senha temporaria nao atende aos requisitos do Supabase.'
  }
  return message || 'Nao foi possivel criar o usuario.'
}

async function saveCreatedProfile(userId: string, email: string, profileData: Record<string, unknown>) {
  let response = await adminSupabase
    .from('profiles')
    .upsert({
      id: userId,
      email,
      active: true,
      ...profileData,
    }, { onConflict: 'id' })

  if (response.error && isStaffTypeSchemaError(response.error)) {
    response = await adminSupabase
      .from('profiles')
      .upsert({
        id: userId,
        email,
        active: true,
        ...omitStaffType(profileData),
      }, { onConflict: 'id' })
  }

  if (response.error) {
    throw new HttpError(500, 'Nao foi possivel salvar as permissoes do perfil.')
  }
}

async function updateProfile(userId: string, profileData: Record<string, unknown>) {
  let response = await adminSupabase
    .from('profiles')
    .update(profileData)
    .eq('id', userId)

  if (response.error && isStaffTypeSchemaError(response.error)) {
    response = await adminSupabase
      .from('profiles')
      .update(omitStaffType(profileData))
      .eq('id', userId)
  }

  if (response.error) {
    throw new HttpError(500, 'Nao foi possivel atualizar o usuario.')
  }
}

function ensureChatSessionAccess(requester: Profile, session: Record<string, unknown>) {
  const moduleId = typeof session.module_id === 'string' ? session.module_id : ''
  const tenantId = typeof session.tenant_id === 'string' ? session.tenant_id : ''
  if (!hasModuleAccess(requester, moduleId)) {
    throw new HttpError(403, 'Voce nao tem permissao para acessar este chat.')
  }

  if (requester.role === 'admin') return

  const requesterTenantId = typeof requester.active_tenant_id === 'string' ? requester.active_tenant_id : ''
  if (!requesterTenantId) {
    throw new HttpError(403, 'Selecione um negocio ativo antes de responder chats.')
  }
  if (!tenantId) {
    throw new HttpError(403, 'Este chat nao possui escopo de negocio.')
  }
  if (tenantId !== requesterTenantId) {
    throw new HttpError(403, 'Voce so pode responder chats do seu negocio ativo.')
  }
}

async function handleUsersList(req: IncomingMessage, res: ServerResponse) {
  const accessToken = getBearerToken(req)
  const requester = await requireAuthenticatedProfile(accessToken)
  const url = getUrl(req)
  const scopeModuleId = url.searchParams.get('module_id') || null
  const tenantId = url.searchParams.get('tenant_id') || null

  if (tenantId) validateUUID(tenantId, 'tenantId')

  const profiles = await listManageableProfilesForRoute(requester, scopeModuleId, tenantId)
  sendJson(res, 200, { profiles })
}

async function handleUserCreate(req: IncomingMessage, res: ServerResponse) {
  const accessToken = getBearerToken(req)
  const requester = await requireAuthenticatedProfile(accessToken)
  const body = await readJsonBody(req) as JsonBody
  const email = normalizeManagedEmail(body.email)

  if (!email || !body.password) {
    throw new HttpError(400, 'Email e senha sao obrigatorios.')
  }

  validateManagedEmail(email)
  validateManagedPassword(body.password)

  const profileData = normalizeUserPayloadForRoute(body, requester, body.scopeModuleId)
  const { data, error } = await adminSupabase.auth.admin.createUser({
    email,
    password: String(body.password || ''),
    email_confirm: true,
    user_metadata: {
      full_name: profileData.full_name,
    },
  })

  if (error || !data?.user) {
    throw new HttpError(400, normalizeCreateUserError(error?.message))
  }

  try {
    await saveCreatedProfile(data.user.id, email, profileData)
    const tenantResult = await syncManagedUserTenants(data.user.id, requester, body)

    sendJson(res, 201, {
      ok: true,
      activeTenantId: tenantResult.activeTenantId,
    })
  } catch (errorAfterAuthCreate) {
    const { error: cleanupError } = await adminSupabase.auth.admin.deleteUser(data.user.id)
    if (cleanupError) {
      console.error('[dashboard-api] failed to rollback auth user', cleanupError)
    }
    throw errorAfterAuthCreate
  }
}

async function handleUserUpdate(req: IncomingMessage, res: ServerResponse, userId: string) {
  const accessToken = getBearerToken(req)
  const requester = await requireAuthenticatedProfile(accessToken)
  const body = await readJsonBody(req) as JsonBody

  validateUUID(userId, 'userId')

  const { data: existingProfile, error: existingProfileError } = await adminSupabase
    .from('profiles')
    .select('id, role, active, allowed_modules, module_permissions, active_tenant_id, staff_type')
    .eq('id', userId)
    .maybeSingle()

  if (existingProfileError || !existingProfile) {
    throw new HttpError(404, 'Usuario nao encontrado.')
  }

  if (existingProfile.role === 'admin' && requester.role !== 'admin') {
    throw new HttpError(403, 'Apenas admins globais podem editar admins globais.')
  }

  if (requester.role !== 'admin') {
    if (!body.scopeModuleId || !isModuleAdmin(requester, String(body.scopeModuleId))) {
      throw new HttpError(403, 'Voce nao tem permissao para editar este usuario.')
    }

    if (!hasModuleAccess(existingProfile, String(body.scopeModuleId))) {
      throw new HttpError(403, 'Este usuario esta fora do escopo do seu modulo.')
    }
  }

  const profileData = normalizeUserPayloadForRoute(body, requester, body.scopeModuleId, existingProfile)
  await updateProfile(userId, profileData)
  const tenantResult = await syncManagedUserTenants(userId, requester, body)

  sendJson(res, 200, {
    ok: true,
    activeTenantId: tenantResult.activeTenantId,
  })
}

async function handleUserStatusUpdate(req: IncomingMessage, res: ServerResponse, userId: string) {
  const accessToken = getBearerToken(req)
  const requester = await requireAuthenticatedProfile(accessToken)
  const body = await readJsonBody(req) as JsonBody

  validateUUID(userId, 'userId')

  if (requester.role !== 'admin') {
    throw new HttpError(403, 'Apenas admins globais podem bloquear ou desbloquear contas.')
  }

  if (requester.id === userId) {
    throw new HttpError(400, 'Voce nao pode alterar o status do proprio acesso.')
  }

  const { error } = await adminSupabase
    .from('profiles')
    .update({ active: Boolean(body.active) })
    .eq('id', userId)

  if (error) {
    throw new HttpError(500, 'Nao foi possivel atualizar o status da conta.')
  }

  sendJson(res, 200, { ok: true })
}

async function handleChatRespond(req: IncomingMessage, res: ServerResponse) {
  const accessToken = getBearerToken(req)
  const requester = await requireAuthenticatedProfile(accessToken)
  const body = await readJsonBody(req) as JsonBody
  const userSupabase = createUserSupabase(accessToken)

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  if (!sessionId) {
    throw new HttpError(400, 'sessionId e obrigatorio.')
  }

  validateUUID(sessionId, 'sessionId')

  const { data: session, error } = await userSupabase
    .from('chat_sessions')
    .select('id, module_id, tenant_id')
    .eq('id', sessionId)
    .maybeSingle()

  if (error || !session) {
    throw new HttpError(404, 'Chat nao encontrado.')
  }

  if (!isModuleAdmin(requester, session.module_id)) {
    throw new HttpError(403, 'Voce nao tem permissao para acionar o bot neste chat.')
  }

  ensureChatSessionAccess(requester, session)

  const result = await respondToChatMessage(adminSupabase, sessionId, body.message)
  sendJson(res, 200, result)
}

async function handleChatHumanMessage(req: IncomingMessage, res: ServerResponse) {
  const accessToken = getBearerToken(req)
  const requester = await requireAuthenticatedProfile(accessToken)
  const body = await readJsonBody(req) as JsonBody
  const userSupabase = createUserSupabase(accessToken)

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  if (!sessionId) {
    throw new HttpError(400, 'sessionId e obrigatorio.')
  }

  validateUUID(sessionId, 'sessionId')

  const { data: session, error } = await userSupabase
    .from('chat_sessions')
    .select('id, module_id, tenant_id, channel, customer_phone, status')
    .eq('id', sessionId)
    .maybeSingle()

  if (error || !session) {
    throw new HttpError(404, 'Chat nao encontrado.')
  }

  ensureChatSessionAccess(requester, session)

  const result = await sendHumanChatMessage({
    session,
    message: body.message,
    senderId: requester.id,
  })

  sendJson(res, 200, result)
}

async function handleFiscalIssueSale(req: IncomingMessage, res: ServerResponse, saleId: string) {
  const accessToken = getBearerToken(req)
  await requireAuthenticatedProfile(accessToken)

  validateUUID(saleId, 'saleId')

  const result = await issueFiscalForSale(accessToken, saleId)
  sendJson(res, 200, result)
}

async function handleFiscalFocusWebhook(req: IncomingMessage, res: ServerResponse) {
  const body = await readJsonBody(req)
  const token = getUrl(req).searchParams.get('token') || ''
  const result = await handleFocusWebhook(body, token)
  sendJson(res, 200, result)
}

function extractUserId(req: IncomingMessage, statusRoute = false) {
  const pattern = statusRoute
    ? /^\/api\/admin\/users\/([^/]+)\/status\/?$/
    : /^\/api\/admin\/users\/([^/]+)\/?$/
  const match = getUrl(req).pathname.match(pattern)
  if (!match?.[1]) throw new HttpError(400, 'Usuario invalido.')
  return decodeURIComponent(match[1])
}

function extractSaleId(req: IncomingMessage) {
  const match = getUrl(req).pathname.match(/^\/api\/fiscal\/sales\/([^/]+)\/issue\/?$/)
  if (!match?.[1]) throw new HttpError(400, 'Venda invalida.')
  return decodeURIComponent(match[1])
}

async function requireGlobalAdmin(req: IncomingMessage) {
  const accessToken = getBearerToken(req)
  const requester = await requireAuthenticatedProfile(accessToken)
  if (requester.role !== 'admin') {
    throw new HttpError(403, 'Apenas admins globais podem executar manutencao.')
  }
  return requester
}

function getMaintenanceScope(body: JsonBody) {
  const moduleId = typeof body.moduleId === 'string' && body.moduleId.trim()
    ? body.moduleId.trim()
    : 'petshop'
  const tenantId = typeof body.tenantId === 'string' && body.tenantId.trim()
    ? body.tenantId.trim()
    : ''

  if (tenantId) validateUUID(tenantId, 'tenantId')
  return { moduleId, tenantId }
}

async function handleResetChatHistory(req: IncomingMessage, res: ServerResponse) {
  await requireGlobalAdmin(req)
  const body = await readJsonBody(req) as JsonBody
  if (body.confirm !== 'RESET_CHAT_HISTORY') {
    throw new HttpError(400, 'Confirmacao invalida para resetar historico.')
  }

  const { moduleId, tenantId } = getMaintenanceScope(body)
  let sessionQuery = adminSupabase
    .from('chat_sessions')
    .select('id')
    .eq('module_id', moduleId)

  if (tenantId) sessionQuery = sessionQuery.eq('tenant_id', tenantId)
  const { data: sessions, error: sessionError } = await sessionQuery
  if (sessionError) throw new HttpError(500, `Falha ao localizar chats: ${sessionError.message}`)

  const sessionIds = (sessions || []).map((session) => session.id)
  if (sessionIds.length > 0) {
    const { error: messageError } = await adminSupabase
      .from('chat_messages')
      .delete()
      .in('session_id', sessionIds)

    if (messageError) throw new HttpError(500, `Falha ao apagar mensagens: ${messageError.message}`)

    const { error: deleteSessionError } = await adminSupabase
      .from('chat_sessions')
      .delete()
      .in('id', sessionIds)

    if (deleteSessionError) throw new HttpError(500, `Falha ao apagar conversas: ${deleteSessionError.message}`)
  }

  sendJson(res, 200, {
    ok: true,
    deletedSessions: sessionIds.length,
  })
}

async function handleResetStock(req: IncomingMessage, res: ServerResponse) {
  await requireGlobalAdmin(req)
  const body = await readJsonBody(req) as JsonBody
  if (body.confirm !== 'RESET_STOCK') {
    throw new HttpError(400, 'Confirmacao invalida para resetar estoque.')
  }

  const { moduleId, tenantId } = getMaintenanceScope(body)
  let productQuery = adminSupabase
    .from('products')
    .select('id')
    .eq('module_id', moduleId)

  if (tenantId) productQuery = productQuery.eq('tenant_id', tenantId)
  const { data: products, error: loadError } = await productQuery
  if (loadError) throw new HttpError(500, `Falha ao localizar estoque: ${loadError.message}`)

  const productIds = (products || []).map((product) => product.id).filter(Boolean)
  if (!productIds.length) {
    sendJson(res, 200, { ok: true, deletedProducts: 0 })
    return
  }

  const { error: upsellError } = await adminSupabase
    .from('products')
    .update({ upsell_link_id: null })
    .in('upsell_link_id', productIds)

  if (upsellError) {
    throw new HttpError(500, `Falha ao remover vinculos de upsell: ${upsellError.message}`)
  }

  const { error: saleItemsError } = await adminSupabase
    .from('sale_items')
    .update({ product_id: null })
    .in('product_id', productIds)

  if (saleItemsError) {
    throw new HttpError(500, `Falha ao desvincular produtos de vendas antigas: ${saleItemsError.message}`)
  }

  const { error: deleteError } = await adminSupabase
    .from('products')
    .delete()
    .in('id', productIds)

  if (deleteError) {
    throw new HttpError(500, `Falha ao resetar estoque: ${deleteError.message}`)
  }

  sendJson(res, 200, { ok: true, deletedProducts: productIds.length })
}

function normalizeLegacyString(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeLegacyNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function normalizeLegacyBoolean(value: unknown, fallback = true) {
  return typeof value === 'boolean' ? value : fallback
}

function applyLegacyTenantFilter(query: any, tenantId: string) {
  return tenantId ? query.eq('tenant_id', tenantId) : query
}

function buildLegacyTenantPayload(payload: Record<string, unknown>, tenantId: string) {
  return tenantId ? { ...payload, tenant_id: tenantId } : payload
}

async function findLegacyProduct(moduleId: string, tenantId: string, row: Record<string, unknown>) {
  const barcode = normalizeLegacyString(row.barcode)
  const name = normalizeLegacyString(row.name)

  if (barcode) {
    let query = adminSupabase
      .from('products')
      .select('id')
      .eq('module_id', moduleId)
      .eq('barcode', barcode)
      .limit(1)
    query = applyLegacyTenantFilter(query, tenantId)
    const { data, error } = await query
    if (!error && data?.[0]?.id) return data[0].id
  }

  if (name) {
    let query = adminSupabase
      .from('products')
      .select('id')
      .eq('module_id', moduleId)
      .eq('name', name)
      .limit(1)
    query = applyLegacyTenantFilter(query, tenantId)
    const { data, error } = await query
    if (!error && data?.[0]?.id) return data[0].id
  }

  return null
}

async function importLegacyProduct(moduleId: string, tenantId: string, row: Record<string, unknown>) {
  const name = normalizeLegacyString(row.name)
  if (!name) return { skipped: true, reason: 'Produto sem nome.' }

  const payload = buildLegacyTenantPayload({
    module_id: moduleId,
    name,
    barcode: normalizeLegacyString(row.barcode) || null,
    category: normalizeLegacyString(row.category) || 'Importacao Legado',
    description: normalizeLegacyString(row.description) || null,
    price: normalizeLegacyNumber(row.price),
    cost_price: normalizeLegacyNumber(row.costPrice),
    stock_quantity: normalizeLegacyNumber(row.stockQuantity),
    min_stock: normalizeLegacyNumber(row.minStock),
    species_target: normalizeLegacyString(row.speciesTarget) || null,
    active: normalizeLegacyBoolean(row.active, true),
    updated_at: new Date().toISOString(),
  }, tenantId)

  const existingId = await findLegacyProduct(moduleId, tenantId, row)
  if (existingId) {
    const { error } = await adminSupabase
      .from('products')
      .update(payload)
      .eq('id', existingId)

    if (error) throw error
    return { updated: true }
  }

  const { error } = await adminSupabase.from('products').insert(payload)
  if (error) throw error
  return { created: true }
}

async function findLegacyClient(moduleId: string, tenantId: string, row: Record<string, unknown>) {
  const legacyCode = normalizeLegacyString(row.legacyCode)
  const document = normalizeLegacyString(row.document)
  const name = normalizeLegacyString(row.name)

  if (legacyCode) {
    let query = adminSupabase
      .from('clients')
      .select('id')
      .eq('module_id', moduleId)
      .contains('details', { legacy_code: legacyCode })
      .limit(1)
    query = applyLegacyTenantFilter(query, tenantId)
    const { data, error } = await query
    if (!error && data?.[0]?.id) return data[0].id
  }

  if (document) {
    let query = adminSupabase
      .from('clients')
      .select('id')
      .eq('module_id', moduleId)
      .eq('document', document)
      .limit(1)
    query = applyLegacyTenantFilter(query, tenantId)
    const { data, error } = await query
    if (!error && data?.[0]?.id) return data[0].id
  }

  if (name) {
    let query = adminSupabase
      .from('clients')
      .select('id')
      .eq('module_id', moduleId)
      .eq('name', name)
      .limit(1)
    query = applyLegacyTenantFilter(query, tenantId)
    const { data, error } = await query
    if (!error && data?.[0]?.id) return data[0].id
  }

  return null
}

async function importLegacyClient(moduleId: string, tenantId: string, row: Record<string, unknown>) {
  const name = normalizeLegacyString(row.name)
  if (!name) return { skipped: true, reason: 'Cliente sem nome.' }

  const payload = buildLegacyTenantPayload({
    module_id: moduleId,
    type: normalizeLegacyString(row.type) || 'pet',
    name,
    document: normalizeLegacyString(row.document) || null,
    phone: normalizeLegacyString(row.phone) || null,
    email: normalizeLegacyString(row.email) || null,
    address: normalizeLegacyString(row.address) || null,
    neighborhood: normalizeLegacyString(row.neighborhood) || null,
    city: normalizeLegacyString(row.city) || null,
    notes: normalizeLegacyString(row.notes) || null,
    active: normalizeLegacyBoolean(row.active, true),
    details: typeof row.details === 'object' && row.details ? row.details : {},
  }, tenantId)

  const existingId = await findLegacyClient(moduleId, tenantId, row)
  if (existingId) {
    const { error } = await adminSupabase
      .from('clients')
      .update(payload)
      .eq('id', existingId)

    if (error) throw error
    return { updated: true }
  }

  const { error } = await adminSupabase.from('clients').insert(payload)
  if (error) throw error
  return { created: true }
}

async function handleLegacyImport(req: IncomingMessage, res: ServerResponse) {
  await requireGlobalAdmin(req)
  const body = await readJsonBody(req) as JsonBody
  const kind = normalizeLegacyString(body.kind)
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 500) : []

  if (!['products', 'clients'].includes(kind)) {
    throw new HttpError(400, 'Tipo de importacao legado invalido.')
  }

  if (!rows.length) {
    throw new HttpError(400, 'Nenhuma linha valida para importar.')
  }

  const { moduleId, tenantId } = getMaintenanceScope(body)
  const summary = {
    ok: true,
    kind,
    received: rows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [] as Array<{ index: number; message: string }>,
  }

  for (const [index, row] of rows.entries()) {
    try {
      const result = kind === 'products'
        ? await importLegacyProduct(moduleId, tenantId, row as Record<string, unknown>)
        : await importLegacyClient(moduleId, tenantId, row as Record<string, unknown>)

      if (result.created) summary.created += 1
      else if (result.updated) summary.updated += 1
      else summary.skipped += 1
    } catch (error) {
      summary.skipped += 1
      if (summary.errors.length < 20) {
        summary.errors.push({
          index,
          message: error instanceof Error ? error.message : 'Erro desconhecido.',
        })
      }
    }
  }

  sendJson(res, 200, summary)
}

export async function handleAdminUsers(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return sendEmpty(res)

  try {
    if (req.method === 'GET') return await handleUsersList(req, res)
    if (req.method === 'POST') return await handleUserCreate(req, res)
    res.setHeader('Allow', 'GET, POST, OPTIONS')
    throw new HttpError(405, 'Metodo nao permitido.')
  } catch (error) {
    handleApiError(res, error)
  }
}

export async function handleAdminUserById(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return sendEmpty(res)

  try {
    if (req.method !== 'PATCH') {
      res.setHeader('Allow', 'PATCH, OPTIONS')
      throw new HttpError(405, 'Metodo nao permitido.')
    }
    return await handleUserUpdate(req, res, extractUserId(req))
  } catch (error) {
    handleApiError(res, error)
  }
}

export async function handleAdminUserStatus(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return sendEmpty(res)

  try {
    if (req.method !== 'PATCH') {
      res.setHeader('Allow', 'PATCH, OPTIONS')
      throw new HttpError(405, 'Metodo nao permitido.')
    }
    return await handleUserStatusUpdate(req, res, extractUserId(req, true))
  } catch (error) {
    handleApiError(res, error)
  }
}

export async function handleChatRespondRoute(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return sendEmpty(res)

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS')
      throw new HttpError(405, 'Metodo nao permitido.')
    }
    return await handleChatRespond(req, res)
  } catch (error) {
    handleApiError(res, error)
  }
}

export async function handleChatHumanMessageRoute(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return sendEmpty(res)

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS')
      throw new HttpError(405, 'Metodo nao permitido.')
    }
    return await handleChatHumanMessage(req, res)
  } catch (error) {
    handleApiError(res, error)
  }
}

export async function handleFiscalIssueRoute(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return sendEmpty(res)

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS')
      throw new HttpError(405, 'Metodo nao permitido.')
    }
    return await handleFiscalIssueSale(req, res, extractSaleId(req))
  } catch (error) {
    handleApiError(res, error)
  }
}

export async function handleFiscalFocusWebhookRoute(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return sendEmpty(res)

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS')
      throw new HttpError(405, 'Metodo nao permitido.')
    }
    return await handleFiscalFocusWebhook(req, res)
  } catch (error) {
    handleApiError(res, error)
  }
}

export async function handleResetChatHistoryRoute(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return sendEmpty(res)

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS')
      throw new HttpError(405, 'Metodo nao permitido.')
    }
    return await handleResetChatHistory(req, res)
  } catch (error) {
    handleApiError(res, error)
  }
}

export async function handleResetStockRoute(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return sendEmpty(res)

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS')
      throw new HttpError(405, 'Metodo nao permitido.')
    }
    return await handleResetStock(req, res)
  } catch (error) {
    handleApiError(res, error)
  }
}

export async function handleLegacyImportRoute(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return sendEmpty(res)

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS')
      throw new HttpError(405, 'Metodo nao permitido.')
    }
    return await handleLegacyImport(req, res)
  } catch (error) {
    handleApiError(res, error)
  }
}
