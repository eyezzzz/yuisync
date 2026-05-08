import OpenAI from 'openai'
import { HttpError } from './http.js'
import { serverEnv } from './env.js'
import { logger } from './logger.js'

const openai = new OpenAI({ apiKey: serverEnv.openAiApiKey })
const SUPPORTED_MODULES = new Set(['petshop'])

// Cache for AI Lab workspace by tenant + module.
const aiWorkspaceCache = new Map()
const aiWorkspaceCacheTtl = 2 * 60 * 1000

function detectIntent(message = '') {
  const lower = message.toLowerCase()

  if (/racao|petisc|brinquedo|shampoo|coleira|comprar|preco|estoque|tem |tem\?|voces tem/i.test(lower)) {
    return 'produto'
  }

  if (/banho|tosa|vet(erinario|erinaria)?|agend|consult|vacina/i.test(lower)) {
    return 'servico'
  }

  return 'duvida'
}

function escapeIlike(value) {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`)
}

function buildSearchTerms(message = '') {
  return message
    .replace(/[?!,.]/g, ' ')
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3)
    .slice(0, 8)
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
    return 'Nenhum produto correspondente encontrado no catalogo para esta busca.'
  }

  return products
    .filter((product) => product.active && Number(product.stock_quantity) > 0)
    .map((product) => [
      `ID: ${product.id}`,
      `NOME: ${product.name}`,
      `CAT: ${product.category || 'Sem categoria'}`,
      `PRECO: R$ ${Number(product.price || 0).toFixed(2)}`,
      `QTD: ${product.stock_quantity}`,
    ].join(' | '))
    .join('\n')
}

function buildAppointmentsContext(appointments) {
  if (!appointments?.length) {
    return 'Agenda livre hoje.'
  }

  return appointments
    .map((appointment) => {
      const time = new Date(appointment.scheduled_at).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
      return `${time} - ${appointment.service_type || 'Atendimento'}`
    })
    .join('\n')
}

function buildSystemPrompt({
  storeName,
  stockContext,
  appointmentsContext,
  trainingPrompt,
  knowledgeBlock,
}) {
  const baseInstructions = [
    trainingPrompt || `Voce e um atendente virtual de pet shop. Atenda em nome de ${storeName}.`,
    'Use apenas as informacoes confirmadas no contexto abaixo.',
    'Nunca invente informacoes que nao estao explicitamente no contexto ou treino.',
  ].join('\n')

  const contextSegments = []
  if (knowledgeBlock) {
    contextSegments.push('BASE DE CONHECIMENTO:', knowledgeBlock)
  }
  if (stockContext) {
    contextSegments.push('ESTOQUE:', stockContext)
  }
  if (appointmentsContext) {
    contextSegments.push('AGENDA:', appointmentsContext)
  }

  return [
    baseInstructions,
    '',
    'Responda em portugues do Brasil, de forma clara, curta e prestativa.',
    '',
    ...contextSegments,
  ].join('\n')
}

async function loadStoreName(supabase, moduleId, tenantId) {
  let query = supabase
    .from('settings')
    .select('store_name')
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

  return data?.store_name || 'YuiSync'
}

async function loadProducts(supabase, moduleId, tenantId, message) {
  const searchTerms = buildSearchTerms(message)
  const intent = detectIntent(message)

  let query = supabase
    .from('products')
    .select('id, name, category, price, stock_quantity, active')
    .eq('module_id', moduleId)
    .eq('active', true)

  if (tenantId) {
    query = query.eq('tenant_id', tenantId)
  }

  if (searchTerms.length > 0) {
    const orQuery = searchTerms
      .flatMap((term) => {
        const escaped = escapeIlike(term)
        return [`name.ilike.%${escaped}%`, `category.ilike.%${escaped}%`]
      })
      .join(',')

    query = query.or(orQuery)
  }

  const { data, error } = await query.limit(intent === 'produto' ? 12 : 6)

  if (error) {
    if (tenantId && isMissingTenantColumnError(error)) {
      throw new HttpError(500, 'Tenant isolation is not enabled in products table.')
    }
    throw new HttpError(500, 'Unable to load product context.')
  }

  return data || []
}

async function loadAppointments(supabase, moduleId, tenantId) {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  let query = supabase
    .from('appointments')
    .select('id, service_type, scheduled_at, status')
    .eq('module_id', moduleId)
    .gte('scheduled_at', `${today}T00:00:00-03:00`)
    .lte('scheduled_at', `${today}T23:59:59-03:00`)
    .in('status', ['agendado', 'confirmado', 'em_andamento'])
    .order('scheduled_at')

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

async function loadRecentMessages(supabase, sessionId) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('sent_at', { ascending: false })
    .limit(15)

  if (error) {
    throw new HttpError(500, 'Unable to load conversation history.')
  }

  return (data || []).reverse().map((message) => ({
    role: message.role === 'human_agent' ? 'assistant' : message.role,
    content: message.content,
  }))
}

function buildAiPromptFromLayers(versions, company, niche) {
  const latestByLayer = new Map()
  for (const row of (versions || [])) {
    if (!row?.layer || latestByLayer.has(row.layer)) continue
    latestByLayer.set(row.layer, String(row.content || '').trim())
  }

  return [
    latestByLayer.get('core') || '',
    latestByLayer.get('niche') || String(niche?.base_prompt || '').trim(),
    latestByLayer.get('company') || String(company?.system_prompt || '').trim(),
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function buildKnowledgeBlock(documents) {
  const activeDocs = (documents || [])
    .filter((doc) => String(doc.status || 'active') === 'active')
    .map((doc) => {
      const title = String(doc.title || 'Documento').trim()
      const tags = Array.isArray(doc.tags) && doc.tags.length ? ` [tags: ${doc.tags.join(', ')}]` : ''
      const content = String(doc.content_text || '').trim()
      if (!content) return ''
      return `### ${title}${tags}\n${content.slice(0, 2500)}`
    })
    .filter(Boolean)

  return activeDocs.join('\n\n').slice(0, 9000)
}

async function getAiWorkspace(supabase, tenantId, moduleId) {
  const cacheKey = `${tenantId}:${moduleId}`
  const cached = aiWorkspaceCache.get(cacheKey)
  const now = Date.now()

  if (cached && (now - cached.updatedAt) < aiWorkspaceCacheTtl) {
    return cached
  }

  try {
    const { data: company, error: companyErr } = await supabase
      .from('companies')
      .select('id, niche_id, name, bot_name, model_name, temperature, system_prompt')
      .eq('module_id', moduleId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (companyErr || !company) {
      return { company: null, prompt: '', docs: [], updatedAt: now }
    }

    const [versionsRes, nichesRes, docsRes] = await Promise.all([
      supabase
        .from('prompt_versions')
        .select('layer, content, version, is_active, created_at')
        .eq('company_id', company.id)
        .eq('is_active', true)
        .order('version', { ascending: false })
        .order('created_at', { ascending: false }),
      company.niche_id
        ? supabase.from('niches').select('id, name, base_prompt').eq('id', company.niche_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from('ai_training_documents')
        .select('title, tags, content_text, status, created_at')
        .eq('company_id', company.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(8),
    ])

    const prompt = buildAiPromptFromLayers(versionsRes.data || [], company, nichesRes?.data || null)
    const docs = docsRes.data || []
    const result = { company, prompt, docs, updatedAt: now }
    aiWorkspaceCache.set(cacheKey, result)
    return result
  } catch (err) {
    logger.warn('AI Workspace load failed', { tenantId, moduleId, error: err.message })
    return { company: null, prompt: '', docs: [], updatedAt: now }
  }
}

async function callOpenAIWithTimeout(params, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const completion = await openai.chat.completions.create(params, {
      signal: controller.signal,
    })
    return completion
  } catch (error) {
    if (error.name === 'AbortError' || error.code === 'ECONNABORTED') {
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
    .select('id, module_id, tenant_id')
    .eq('id', sessionId)
    .maybeSingle()

  if (sessionError || !session) {
    throw new HttpError(404, 'Chat session not found.')
  }

  if (!session.tenant_id) {
    throw new HttpError(500, 'Chat session is missing tenant_id.')
  }

  const moduleId = String(session.module_id || '').trim().toLowerCase()
  if (!SUPPORTED_MODULES.has(moduleId)) {
    throw new HttpError(400, `Unsupported module_id "${session.module_id}".`)
  }

  const [storeName, products, appointments, history, aiWorkspace] = await Promise.all([
    loadStoreName(supabase, moduleId, session.tenant_id),
    loadProducts(supabase, moduleId, session.tenant_id, trimmedMessage),
    loadAppointments(supabase, moduleId, session.tenant_id),
    loadRecentMessages(supabase, sessionId),
    getAiWorkspace(supabase, session.tenant_id, moduleId),
  ])

  const intent = detectIntent(trimmedMessage)
  const systemPrompt = buildSystemPrompt({
    storeName,
    stockContext: buildStockContext(products),
    appointmentsContext: buildAppointmentsContext(appointments),
    trainingPrompt: aiWorkspace.prompt,
    knowledgeBlock: buildKnowledgeBlock(aiWorkspace.docs),
  })

  const userSentAt = new Date().toISOString()
  const { error: userInsertError } = await supabase.from('chat_messages').insert({
    session_id: sessionId,
    role: 'user',
    content: trimmedMessage,
    metadata: options.userMetadata || null,
    sent_at: userSentAt,
  })

  if (userInsertError) {
    throw new HttpError(500, 'Unable to save user message.')
  }

  const completion = await callOpenAIWithTimeout({
    model: aiWorkspace.company?.model_name || serverEnv.openAiModel,
    temperature: Number(aiWorkspace.company?.temperature || 0.15),
    max_tokens: 500,
    messages: [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: trimmedMessage },
    ],
  }, serverEnv.openAiTimeoutMs)

  const reply = completion.choices[0]?.message?.content?.trim()
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
      metadata: options.assistantMetadata || null,
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
    tokens: completion?.usage?.total_tokens || 0,
  })

  return {
    reply,
    savedMessage: savedReply,
  }
}
