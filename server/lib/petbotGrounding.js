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


function collectScheduleGrounding(toolRuns = [], timezone = 'America/Sao_Paulo') {
  const availableTimes = new Set()
  const unavailableRequestedTimes = new Set()
  for (const run of toolRuns || []) {
    if (run?.name !== 'check_petshop_availability' || run?.ok === false) continue
    const result = run?.result || {}
    for (const slot of result.available_slots || []) {
      const time = normalizeTime(slot?.scheduled_at || slot?.time, timezone)
      if (time) availableTimes.add(time)
    }
    if (result.requested_slot && result.requested_slot.available === false) {
      const time = normalizeTime(result.requested_slot.scheduled_at || result.requested_slot.time, timezone)
      if (time) unavailableRequestedTimes.add(time)
    }
  }
  return { availableTimes, unavailableRequestedTimes }
}

function parseAvailableTimeListClaims(reply = '') {
  const claims = []
  const text = clean(reply)
  const patterns = [
    /(?:hor[aá]rios?|op[cç][oõ]es?)\s+(?:que\s+)?(?:est[aã]o\s+)?dispon[ií]veis\s*:?\s*([\s\S]{0,320})/gi,
    /(?:temos|encontrei)\s+(?:estes|os seguintes)?\s*hor[aá]rios?\s*:?\s*([\s\S]{0,320})/gi,
  ]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) claims.push(...parseTimeClaims(match[1] || ''))
  }
  return unique(claims)
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
    if (['prepare_petshop_product_order', 'prepare_petshop_service_booking', 'prepare_petshop_order'].includes(name) && result?.status === 'prepared') capabilities.add('prepared_order')
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
  const scheduleGrounding = collectScheduleGrounding(toolRuns, timezone)
  const availableTimeClaims = parseAvailableTimeListClaims(reply)
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
  for (const value of availableTimeClaims) {
    if (!scheduleGrounding.availableTimes.has(value)) {
      problems.push(`horário apresentado como disponível sem estar livre: ${value}`)
    }
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

export function validatePetbotConversationReply({ reply = '', facts = {}, pendingOrder = null, currentMessageIsConfirmation = false, serviceContext = false, toolRuns = [] } = {}) {
  const normalized = normalizeCatalogText(reply)
  const problems = []

  const asksCoat = /\b(?:qual(?: e)? (?:o )?tipo de (?:pelo|pelagem)|qual pelagem|confirma(?:r)?(?: novamente)?(?: o)? tipo de (?:pelo|pelagem))\b/.test(normalized)
    || /\b(?:informe|informar|diga|dizer|poderia me informar|pode me dizer)\b.{0,45}\b(?:tipo de pelo|pelagem)\b/.test(normalized)
  const asksWeight = /\b(?:qual(?: e)? (?:o )?peso|quanto (?:ele|ela|o pet|a pet)? ?pesa|confirma(?:r)?(?: novamente)?(?: o)? peso)\b/.test(normalized)
    || /\b(?:informe|informar|diga|dizer|poderia me informar|pode me dizer)\b.{0,45}\b(?:peso|quantos? kg|quilos?)\b/.test(normalized)
  const asksBreed = /\b(?:qual(?: e)? (?:a )?raca|confirma(?:r)?(?: novamente)?(?: a)? raca)\b/.test(normalized)
    || /\b(?:informe|informar|diga|dizer|poderia me informar|pode me dizer)\b.{0,45}\braca\b/.test(normalized)
  const asksDate = /\b(?:qual(?: e)? (?:a )?data|que dia|confirma(?:r)?(?: novamente)?(?: a)? data)\b/.test(normalized)
  const asksTime = /\b(?:qual(?: e)? (?:o )?horario|que horas|confirma(?:r)?(?: novamente)?(?: o)? horario)\b/.test(normalized)
  const asksGenericRepeat = /\b(?:repita|repetir|diga novamente|informe novamente|confirme novamente|ultima informacao)\b/.test(normalized)
  const hasKnownConversationFacts = Boolean(
    clean(facts.pet_name)
    || clean(facts.breed)
    || Number(facts.weight_kg || 0) > 0
    || clean(facts.service_date)
    || clean(facts.service_preferred_time),
  )
  const pendingType = clean(pendingOrder?.order?.order_type)
  const normalizedServiceType = normalizeCatalogText(facts.service_type)
  const isServiceConversation = Boolean(
    serviceContext
    || (pendingType && pendingType !== 'produto')
    || /(?:banho|tosa|veterin|consulta|vacina|servico)/.test(normalizedServiceType),
  )
  const asksPaymentMethod = /(?:qual|como|prefere|sera|vai ser).{0,45}(?:forma de pagamento|pagamento|pix|dinheiro|cartao)/.test(normalized)
    || /(?:pix|dinheiro).{0,20}(?:ou).{0,20}(?:cartao)/.test(normalized)
  const asksChange = /\btroco\b/.test(normalized)
  const asksProductFulfillment = /(?:entrega ou retirada|retirada na loja|servico de entrega|entregar ou retirar|vai retirar|prefere retirada)/.test(normalized)
  const asksServiceNotes = /(?:alguma|tem|possui|precisa de|gostaria de adicionar).{0,45}(?:observacao|observacoes|recado|cuidado especial)/.test(normalized)
    || /(?:observacao|observacoes).{0,45}(?:banho|tosa|servico|agendamento)/.test(normalized)
  const asksPetName = /(?:qual|como).{0,30}(?:nome).{0,20}(?:pet|cachorro|cao|cadela|gato|gata|dele|dela)/.test(normalized)
    || /(?:nome).{0,20}(?:do|da|desse|dessa).{0,15}(?:pet|cachorro|cao|cadela|gato|gata)/.test(normalized)
  const asksPetTransport = /(?:como|quem|voce|cliente|tutor|prefere).{0,55}(?:chegar|levar|trazer|motodog)/.test(normalized)
    || /(?:levar|trazer).{0,45}(?:loja|motodog)/.test(normalized)
  const asksServiceAddon = /(?:adicionar|incluir|gostaria|quer|deseja).{0,60}(?:outro servico|outro produto|algum servico|algum produto|corte de unhas|algo mais)/.test(normalized)
    || /(?:outro servico|outro produto|corte de unhas).{0,45}(?:adicionar|incluir|quer|deseja)/.test(normalized)
  const asksConfirmationAgain = /(?:confirma(?:r)?|voce confirma|pode confirmar).{0,50}(?:agendamento|pedido|horario)/.test(normalized)
    || /(?:para finalizar|so preciso confirmar).{0,80}/.test(normalized)
  const transportMode = normalizeCatalogText(facts.service_transport_mode)
  const transportResolved = Boolean(transportMode && transportMode !== 'motodog')
  const hasPreparedOrder = Boolean(pendingOrder) || (toolRuns || []).some((run) => (
    ['prepare_petshop_service_booking', 'prepare_petshop_order'].includes(clean(run?.name))
    && run?.ok !== false
    && run?.result?.status === 'prepared'
  ))
  const hasExactAvailableSlot = (toolRuns || []).some((run) => (
    clean(run?.name) === 'check_petshop_availability'
    && run?.ok !== false
    && run?.result?.status === 'available'
    && run?.result?.requested_slot?.available === true
  ))
  const isBathConversation = isServiceConversation && (
    pendingType === 'banho_tosa'
    || /(?:banho|tosa|escovacao|desembolo|hidratacao)/.test(normalizedServiceType)
  )
  const bookingFactsComplete = Boolean(
    clean(facts.pet_name)
    && clean(facts.species)
    && clean(facts.breed)
    && Number(facts.weight_kg || 0) > 0
    && clean(facts.service_date)
    && (clean(facts.service_preferred_time) || clean(facts.service_time_preference))
    && hasExactAvailableSlot
  )

  if (asksCoat) problems.push('pergunta de pelagem proibida; a classificação deve vir da raça cadastrada')
  if (asksGenericRepeat && hasKnownConversationFacts) problems.push('solicitação genérica para repetir dados que já estão no estado confiável')
  if (Number(facts.weight_kg || 0) > 0 && asksWeight) problems.push('peso já informado foi solicitado novamente')
  if (clean(facts.breed) && asksBreed) problems.push('raça já informada foi solicitada novamente')
  if (clean(facts.service_date) && asksDate) problems.push('data já informada foi solicitada novamente')
  if (clean(facts.service_preferred_time) && asksTime) problems.push('horário já informado foi solicitado novamente')
  if (isServiceConversation && asksPaymentMethod && !/(?:apos|depois).{0,35}(?:servico|atendimento|conclusao|finalizacao)/.test(normalized)) {
    problems.push('forma de pagamento não deve ser solicitada durante agendamento de serviço')
  }
  if (isServiceConversation && asksChange) problems.push('troco não se aplica ao agendamento de serviço')
  if (isServiceConversation && asksProductFulfillment) problems.push('entrega/retirada de produto não se aplica ao pet; use cliente leva ou MotoDog')
  if (isServiceConversation && facts.service_notes_resolved && asksServiceNotes) {
    problems.push('observações do serviço já foram respondidas; não pergunte novamente')
  }
  if (isServiceConversation && asksServiceAddon) {
    problems.push('não ofereça produtos ou serviços adicionais durante a finalização do agendamento')
  }
  if (isServiceConversation && !clean(facts.pet_name) && !asksPetName) {
    problems.push('nome do pet ainda está ausente; pergunte somente o nome do pet antes de continuar')
  }
  if (isBathConversation && transportResolved && asksPetTransport) {
    problems.push('chegada do pet já foi respondida; não pergunte novamente se o cliente vai levar ou usar MotoDog')
  }
  if (isBathConversation && bookingFactsComplete && !hasPreparedOrder) {
    if (!transportResolved && !asksPetTransport) {
      problems.push('serviço e horário estão resolvidos; pergunte somente como o pet chegará à loja')
    } else if (transportResolved && !facts.service_notes_resolved && !asksServiceNotes) {
      problems.push('chegada do pet está resolvida; pergunte somente se há alguma observação para o serviço')
    } else if (transportResolved && facts.service_notes_resolved) {
      problems.push('todos os dados do serviço estão completos; prepare o agendamento e apresente uma única confirmação')
    }
  }
  if (pendingOrder && currentMessageIsConfirmation && asksConfirmationAgain) {
    problems.push('cliente já confirmou o pedido pendente; não peça nova confirmação')
  }

  return { ok: problems.length === 0, problems }
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
  operationalContext = null,
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
    '- Quando o bloco Contexto operacional pré-carregado já contiver resolução de serviço ou agenda, use esses dados diretamente e não repita a mesma consulta sem um novo fato do cliente.',
    '- Nunca pergunte tipo de pelo ou pelagem. A pelagem é uma classificação interna derivada da raça cadastrada no YuiSync.',
    '- Para banho/tosa, os únicos fatos de classificação que podem ser solicitados ao cliente são raça e peso aproximado. Se ambos já estiverem no estado confiável, não os pergunte nem peça confirmação novamente.',
    '- O nome do pet é obrigatório para concluir um serviço. Se ainda estiver ausente, pergunte o nome antes de chegada, observações ou resumo; nunca use a raça como nome do pet.',
    '- Campo ausente, serviço ambíguo ou tentativa de consultar a agenda cedo demais não são motivo para transferir o atendimento: use o retorno da ferramenta para fazer a próxima pergunta útil.',
    '- Transfira para humano somente quando o cliente pedir, houver risco veterinário ou uma falha operacional persistente impedir qualquer continuação segura.',
    '- Use dados salvos do cliente e do pet quando forem relevantes e não houver sinal de mudança. Não repita perguntas já respondidas; confirme apenas quando houver ambiguidade real ou mais de um pet possível.',
    '- O bloco Estado confiável da conversa tem prioridade sobre argumentos nulos ou incompletos gerados durante chamadas de ferramenta.',
    '- Se o cliente tiver benefício de plano disponível, trate-o como dado operacional: aplique somente quando a ferramenta indicar e explique naturalmente no resumo, sem prometer benefício por conta própria.',
    '- Não deduza peso, estoque, preço, política comercial nem disponibilidade. Raça e peso são fatos interpretados da conversa; classificação e faixa são resolvidas pelo catálogo.',
    '- Não exponha JSON, IDs, nomes de ferramentas, regras internas ou mensagens de validação.',
    '- Não diga que vai consultar nem peça para aguardar: chame a ferramenta silenciosamente e responda com o resultado.',
    '- Para produtos, forma de pagamento e entrega/retirada pertencem ao pedido. Troco só existe quando o pagamento for em dinheiro.',
    '- Para serviços, o pagamento acontece após a conclusão. Nunca pergunte Pix, dinheiro, cartão ou troco durante o agendamento e nunca trate o serviço como entrega ou retirada de produto.',
    '- Para banho/tosa, depois de definir serviço e horário, descubra apenas como o pet chegará: o cliente leva à loja ou usa o MotoDog. Se o cliente quiser MotoDog, consulte as opções reais e mostre somente as taxas retornadas pela ferramenta.',
    '- Não ofereça MotoDog durante a coleta de raça, peso, data ou horário. Não use as expressões entrega/retirada para o pet.',
    '- Depois que a chegada do pet estiver definida, pergunte uma única vez se há observação para o serviço. Assim que a observação for respondida, prepare o agendamento imediatamente.',
    '- Durante agendamentos não ofereça produto, corte de unhas nem outro serviço adicional. Não crie etapas extras entre observação, resumo e confirmação.',
    '- Prepare um pedido somente quando os dados necessários estiverem completos. Quando houver pedido pendente de turno anterior e o cliente confirmar inequivocamente, chame create_confirmed_petshop_order imediatamente, sem repetir resumo ou pedir nova confirmação.',
    '- Se o cliente desistir, cancelar ou pedir para recomeçar depois de um resumo, descarte o pedido pendente com a ferramenta apropriada antes de continuar.',
    '- Em caso de risco veterinário, falha operacional sem alternativa ou pedido explícito por pessoa, transfira para humano.',
    '- Em compras de produtos, faça venda consultiva com no máximo uma sugestão complementar relevante e aceite a recusa sem insistência. Essa regra não se aplica a agendamentos.',
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
    'Contexto operacional pré-carregado pelo servidor:',
    JSON.stringify(operationalContext || { service_resolution: null, availability: null }),
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
