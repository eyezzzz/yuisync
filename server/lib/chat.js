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

// Cache for AI Lab workspace by tenant + module.
const aiWorkspaceCache = new Map()
const aiWorkspaceCacheTtl = 2 * 60 * 1000

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
    'Se o estoque listar produtos, cite nomes, precos e quantidade desses itens quando o cliente perguntar sobre produtos.',
    'Nao diga que nao ha produto ou racao quando houver itens listados no estoque.',
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

  return selectRelevantProducts(data || [], message)
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

  const [storeName, appointments, history, aiWorkspace] = await Promise.all([
    loadStoreName(supabase, moduleId, session.tenant_id),
    loadAppointments(supabase, moduleId, session.tenant_id),
    loadRecentMessages(supabase, sessionId),
    getAiWorkspace(supabase, session.tenant_id, moduleId),
  ])
  const productContextMessage = [
    ...history
      .filter((message) => message.role === 'user')
      .slice(-4)
      .map((message) => message.content),
    trimmedMessage,
  ].join(' ')
  const products = await loadProducts(supabase, moduleId, session.tenant_id, productContextMessage)

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
