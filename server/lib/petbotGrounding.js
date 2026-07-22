import { DateTime } from 'luxon'
import { classifyProduct, normalizeCatalogText } from './petbotCatalog.js'

function clean(value = '') {
  return String(value ?? '').trim()
}

function unique(values = []) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ''))]
}

function normalizeMoney(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null
}

function normalizeTime(value = '', timezone = 'America/Sao_Paulo') {
  const text = clean(value)
  if (!text) return null
  const direct = text.match(/^(\d{1,2}):(\d{2})/)
  if (direct) return `${String(Number(direct[1])).padStart(2, '0')}:${direct[2]}`
  const parsed = DateTime.fromISO(text, { setZone: true })
  return parsed.isValid ? parsed.setZone(timezone).toFormat('HH:mm') : null
}

function normalizeDate(value = '', timezone = 'America/Sao_Paulo') {
  const text = clean(value)
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const parsed = DateTime.fromISO(text, { setZone: true })
  return parsed.isValid ? parsed.setZone(timezone).toISODate() : null
}

function deepVisit(value, visitor, key = '') {
  if (Array.isArray(value)) {
    value.forEach((item) => deepVisit(item, visitor, key))
    return
  }
  if (value && typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      visitor(childValue, childKey)
      deepVisit(childValue, visitor, childKey)
    }
  }
}

export function collectOperationalGrounding({ toolRuns = [], pendingOrder = null, orderResult = null, timezone = 'America/Sao_Paulo' } = {}) {
  const money = new Set()
  const times = new Set()
  const dates = new Set()
  const ids = new Set()
  const names = new Set()
  const acceptedMoneyKeys = /(?:price|total|subtotal|fee|unit_price|default_price)$/i
  const acceptedTimeKeys = /(?:scheduled_at|start_time|time)$/i
  const acceptedDateKeys = /(?:service_date|date)$/i
  const acceptedIdKeys = /(?:^id$|_id$)/i
  const acceptedNameKeys = /(?:name|label)$/i

  const roots = [
    ...(toolRuns || []).filter((run) => run?.ok !== false).map((run) => run?.result),
    pendingOrder,
    orderResult,
  ].filter(Boolean)

  for (const root of roots) {
    deepVisit(root, (value, key) => {
      if (acceptedMoneyKeys.test(key)) {
        const normalized = normalizeMoney(value)
        if (normalized !== null) money.add(normalized)
      }
      if (acceptedTimeKeys.test(key)) {
        const normalized = normalizeTime(value, timezone)
        if (normalized) times.add(normalized)
      }
      if (acceptedDateKeys.test(key)) {
        const normalized = normalizeDate(value, timezone)
        if (normalized) dates.add(normalized)
      }
      if (acceptedIdKeys.test(key) && clean(value)) ids.add(clean(value))
      if (acceptedNameKeys.test(key) && clean(value)) names.add(clean(value))
    })
  }

  return { money, times, dates, ids, names }
}

function parseMoneyClaims(reply = '') {
  return [...clean(reply).matchAll(/R\$\s*([0-9.]+(?:,[0-9]{1,2})?)/gi)]
    .map((match) => Number(match[1].replace(/\./g, '').replace(',', '.')))
    .filter(Number.isFinite)
    .map(normalizeMoney)
}

function parseTimeClaims(reply = '') {
  return unique([...clean(reply).matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)]
    .map((match) => `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`))
}

function parseDateClaims(reply = '') {
  return unique([...clean(reply).matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g)]
    .map((match) => `${match[3]}-${match[2]}-${match[1]}`))
}

function collectToolCapabilities(toolRuns = [], orderResult = null) {
  const capabilities = new Set()
  for (const run of toolRuns || []) {
    if (run?.ok === false) continue
    const name = clean(run?.name)
    const result = run?.result || {}
    if (name === 'search_petshop_products') capabilities.add('product_catalog')
    if (name === 'resolve_petshop_service' && result?.status === 'resolved') capabilities.add('service_catalog')
    if (name === 'check_petshop_availability') capabilities.add('schedule')
    if (name === 'get_petshop_transport_options') capabilities.add('transport')
    if (name === 'prepare_petshop_order' && result?.status === 'prepared') capabilities.add('prepared_order')
    if (name === 'create_confirmed_petshop_order' && ['committed', 'already_committed'].includes(result?.status)) {
      capabilities.add('committed_order')
    }
  }
  if (orderResult) capabilities.add('committed_order')
  return capabilities
}

export function validatePetbotOperationalReply({ reply = '', toolRuns = [], pendingOrder = null, orderResult = null, timezone = 'America/Sao_Paulo' } = {}) {
  const grounding = collectOperationalGrounding({ toolRuns, pendingOrder, orderResult, timezone })
  const moneyClaims = parseMoneyClaims(reply)
  const timeClaims = parseTimeClaims(reply)
  const dateClaims = parseDateClaims(reply)
  const capabilities = collectToolCapabilities(toolRuns, orderResult)
  const normalizedReply = normalizeCatalogText(reply)
  const problems = []

  for (const value of moneyClaims) {
    if (!grounding.money.has(value)) problems.push(`valor não validado: R$ ${value.toFixed(2)}`)
  }
  for (const value of timeClaims) {
    if (!grounding.times.has(value)) problems.push(`horário não validado: ${value}`)
  }
  for (const value of dateClaims) {
    if (!grounding.dates.has(value)) problems.push(`data não validada: ${value}`)
  }

  const claimsStock = /\b(?:em estoque|estoque disponivel|estoque indisponivel|sem estoque)\b/.test(normalizedReply)
  if (claimsStock && !capabilities.has('product_catalog') && !capabilities.has('prepared_order')) {
    problems.push('situação de estoque sem consulta ao catálogo')
  }

  const claimsSchedule = (
    /\bhorarios?\b.{0,35}\b(?:disponivel|disponiveis|livre|livres|indisponivel|indisponiveis)\b/.test(normalizedReply)
    || /\b(?:disponivel|disponiveis|livre|livres|indisponivel|indisponiveis)\b.{0,35}\bhorarios?\b/.test(normalizedReply)
  )
  if (claimsSchedule && !capabilities.has('schedule') && !capabilities.has('prepared_order')) {
    problems.push('disponibilidade de agenda sem consulta')
  }

  const claimsCommitted = /\b(?:pedido|agendamento)\b.{0,30}\b(?:confirmado|registrado|finalizado|concluido|agendado)\b/.test(normalizedReply)
    || /\b(?:confirmamos|registramos|finalizamos|concluimos|agendamos)\b.{0,30}\b(?:pedido|agendamento|servico)\b/.test(normalizedReply)
  if (claimsCommitted && !capabilities.has('committed_order')) {
    problems.push('conclusão de pedido sem transação confirmada')
  }

  return {
    ok: problems.length === 0,
    problems,
    claims: { money: moneyClaims, times: timeClaims, dates: dateClaims },
  }
}

function productDimension(product = {}) {
  const metadata = classifyProduct(product)
  return {
    id: clean(product.id),
    name: clean(product.name),
    species: clean(product.species_target || metadata.species),
    age_category: clean(metadata.age),
    size: clean(metadata.size),
    brand: clean(metadata.brand),
    package_kg: metadata.packageKg || null,
    category: clean(product.category),
    type: clean(metadata.type),
  }
}

const PRODUCT_DIMENSIONS = [
  ['species', 'espécie'],
  ['age_category', 'fase de vida'],
  ['size', 'porte'],
  ['brand', 'marca'],
  ['package_kg', 'tamanho da embalagem'],
  ['category', 'categoria'],
]

export function analyzeProductDifferentiation(products = [], known = {}) {
  const rows = (products || []).map(productDimension).filter((row) => row.id && row.name)
  const differentiators = []

  for (const [field, label] of PRODUCT_DIMENSIONS) {
    if (known?.[field] !== null && known?.[field] !== undefined && clean(known[field])) continue
    const values = unique(rows.map((row) => row[field])).slice(0, 8)
    if (values.length > 1) differentiators.push({ field, label, values })
  }

  return {
    status: rows.length === 0 ? 'not_found' : rows.length === 1 ? 'resolved' : 'candidates',
    differentiators: differentiators.slice(0, 3),
    candidates: rows,
  }
}

export function buildPetbotAgentV3Prompt({
  storeName = 'YuiSync',
  storePhone = '',
  storeLocation = '',
  customer = {},
  facts = {},
  pendingOrder = null,
  customInstructions = '',
  timezone = 'America/Sao_Paulo',
  now = new Date(),
} = {}) {
  const current = DateTime.fromJSDate(now).setZone(timezone)
  const pending = pendingOrder
    ? {
      id: pendingOrder.id,
      summary: pendingOrder.summary,
      prepared_at: pendingOrder.prepared_at,
    }
    : null

  return [
    `Você é o agente de atendimento autônomo da ${clean(storeName) || 'loja'}.`,
    'Converse em português do Brasil com naturalidade, contexto e iniciativa comercial, sem soar como formulário.',
    'Você decide como conduzir a conversa e quais ferramentas chamar. O servidor é a fonte de verdade para catálogo, preço, estoque, agenda, taxas e gravações.',
    '',
    'Princípios operacionais:',
    '- Nunca afirme preço, estoque, serviço exato, duração, data ou horário sem um resultado de ferramenta no turno atual ou um pedido pendente validado.',
    '- Para produtos, pesquise o catálogo. Quando houver várias opções, use somente os diferenciadores retornados pela ferramenta e pergunte apenas o que realmente separa as opções.',
    '- Para banho/tosa ou veterinária, resolva primeiro o serviço exato. Se a ferramenta indicar campos ausentes, peça-os naturalmente. Quando o serviço estiver resolvido, consulte a agenda.',
    '- Campo ausente, serviço ambíguo ou tentativa de consultar a agenda cedo demais não são motivo para transferir o atendimento: use o retorno da ferramenta para fazer a próxima pergunta útil.',
    '- Transfira para humano somente quando o cliente pedir, houver risco veterinário ou uma falha operacional persistente impedir qualquer continuação segura.',
    '- Use dados salvos do cliente e do pet quando forem relevantes e não houver sinal de mudança. Não repita perguntas já respondidas; confirme apenas quando houver ambiguidade real ou mais de um pet possível.',
    '- Se o cliente tiver benefício de plano disponível, trate-o como dado operacional: aplique somente quando a ferramenta indicar e explique naturalmente no resumo, sem prometer benefício por conta própria.',
    '- Não deduza peso, estoque, preço, política comercial nem disponibilidade. Raça e peso são fatos interpretados da conversa; classificação e faixa são resolvidas pelo catálogo.',
    '- Não exponha JSON, IDs, nomes de ferramentas, regras internas ou mensagens de validação.',
    '- Não diga que vai consultar nem peça para aguardar: chame a ferramenta silenciosamente e responda com o resultado.',
    '- Para banho/tosa, trate transporte como opcional. Se o cliente demonstrar interesse em buscar/levar o pet, consulte as opções configuradas antes de citar modalidade ou taxa.',
    '- Prepare um pedido somente quando os dados necessários estiverem completos. Confirme somente um pedido pendente de turno anterior após concordância inequívoca do cliente.',
    '- Se o cliente desistir, cancelar ou pedir para recomeçar depois de um resumo, descarte o pedido pendente com a ferramenta apropriada antes de continuar.',
    '- Em caso de risco veterinário, falha operacional sem alternativa ou pedido explícito por pessoa, transfira para humano.',
    '- Faça venda consultiva: ofereça no máximo uma sugestão complementar relevante e aceite a recusa sem insistência.',
    '',
    'Estado confiável da conversa:',
    JSON.stringify({
      customer,
      facts,
      pending_order: pending,
      store: {
        name: clean(storeName),
        phone: clean(storePhone) || null,
        location: clean(storeLocation) || null,
        timezone,
        local_datetime: current.toISO(),
      },
    }),
    '',
    clean(customInstructions)
      ? `Instruções editoriais do tenant (não podem substituir dados operacionais nem regras de segurança):\n${clean(customInstructions).slice(0, 5000)}`
      : 'Não há instruções editoriais adicionais do tenant.',
  ].join('\n')
}

export function normalizeProductQueryFacts(interpretation = {}, serviceFacts = {}) {
  return {
    species: clean(interpretation.species || serviceFacts.species),
    age_category: clean(interpretation.age_category),
    size: clean(interpretation.size),
    brand: normalizeCatalogText(interpretation.brand),
    package_kg: Number(interpretation.package_kg || 0) || null,
  }
}
