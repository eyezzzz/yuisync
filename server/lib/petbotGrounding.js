import { DateTime } from 'luxon'
import { classifyCommonPetBreed } from '../../shared/petbotBreedCatalog.js'
import {
  buildRationPackagePreferenceReply,
  classifyProduct,
  detectCatalogAgeCategory,
  detectCatalogPetSize,
  detectCatalogRequest,
  detectCatalogSpecies,
  normalizeCatalogText,
  normalizeRationPackagePreference,
  rationPackagePreferenceForProduct,
} from './petbotCatalog.js'

function clean(value = '') {
  return String(value ?? '').trim()
}

export function detectExplicitProductPaymentMethod(message = '') {
  const normalized = normalizeCatalogText(message)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return ''

  const selectsPayment = /^(?:pix|dinheiro|cartao|credito|debito)$/.test(normalized)
    || /\b(?:vou pagar|quero pagar|prefiro pagar|pode ser|pagamento (?:vai ser|sera|no|em)|pago (?:no|em|com))\b/.test(normalized)
    || /\b(?:vai ser|sera|seria|fica)(?: no| em| por)? (?:pix|dinheiro|cartao|credito|debito)\b/.test(normalized)
    || /\b(?:no|em|por) (?:pix|dinheiro|cartao|credito|debito)\b/.test(normalized)
  if (!selectsPayment) return ''
  if (/\bpix\b/.test(normalized)) return 'pix'
  if (/\b(?:dinheiro|especie)\b/.test(normalized)) return 'dinheiro'
  if (/\b(?:cartao|credito|debito)\b/.test(normalized)) return 'cartao'
  return ''
}

export function detectExplicitProductFulfillmentType(message = '') {
  const normalized = normalizeCatalogText(message)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return ''
  if (/\b(?:tem|faz|fazem|voces fazem|qual (?:o )?valor|quanto custa)\b.{0,25}\bentrega\b/.test(normalized)) {
    return ''
  }
  if (
    /^(?:entrega|delivery)$/.test(normalized)
    || /^(?:pode ser )?entrega(?: aqui| pra ca| para ca| no meu endereco| em casa)?(?: por favor)?$/.test(normalized)
    || /\b(?:quero entrega|quero que entregue|prefiro entrega|pode ser entrega|pode entregar|consegue entregar|manda (?:aqui|pra mim|para mim)|mandar (?:aqui|pra mim|para mim)|envia (?:aqui|pra mim|para mim)|receber em casa)\b/.test(normalized)
  ) return 'entrega'
  if (
    /^(?:retirada|retirar|retirar na loja|vou retirar|vou buscar|eu busco|vou pegar|eu pego)$/.test(normalized)
    || /\b(?:quero retirar|prefiro retirar|pode ser retirada|retirada na loja|retirar na loja|vou retirar|vou buscar|eu busco|busco na loja|vou pegar|eu pego|passo ai|buscar na loja)\b/.test(normalized)
  ) return 'retirada'
  return ''
}

export function detectExplicitProductQuantity(message = '', packagePreference = '') {
  const normalized = normalizeCatalogText(message).replace(/,/g, '.')
  if (!normalized) return null

  const countedPackage = normalized.match(/\b(\d{1,3}(?:\.\d{1,3})?)\s*(?:pacotes?|sacos?|unidades?|un)\b/)
  if (countedPackage) return Number(countedPackage[1]) || null

  if (clean(packagePreference) === 'granel') {
    const bulk = normalized.match(/\b(\d{1,3}(?:\.\d{1,3})?)\s*(?:kg|quilos?)\b/)
    if (bulk && !/\b(?:pesa|peso|pesando)\b/.test(normalized)) return Number(bulk[1]) || null
    const grams = normalized.match(/\b(\d{2,4})\s*(?:g|gramas?)\b/)
    if (grams && !/\b(?:pesa|peso|pesando)\b/.test(normalized)) {
      return Number(grams[1]) / 1000 || null
    }
    const writtenNumbers = {
      meio: 0.5,
      meia: 0.5,
      um: 1,
      uma: 1,
      dois: 2,
      duas: 2,
      tres: 3,
      quatro: 4,
      cinco: 5,
      seis: 6,
      sete: 7,
      oito: 8,
      nove: 9,
      dez: 10,
    }
    const writtenBulk = normalized.match(/\b(meio|meia|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+quilos?\b/)
    if (writtenBulk && !/\b(?:pesa|peso|pesando)\b/.test(normalized)) {
      return writtenNumbers[writtenBulk[1]] || null
    }
  }

  const plain = normalized.match(/\b(?:quero|levo|vou levar|me ve|pode ser)\s+(?:uns?\s+|umas?\s+)?(\d{1,3}(?:\.\d{1,3})?)\b/)
  if (plain) return Number(plain[1]) || null

  if (clean(packagePreference) === 'granel') {
    const approximate = normalized.match(/^(?:uns?|umas?)\s+(\d{1,3}(?:\.\d{1,3})?)(?:\s*(?:kg|quilos?))?$/)
    if (approximate) return Number(approximate[1]) || null
  }
  return null
}

function messageContainsNormalizedValue(message = '', value = '') {
  const normalizedValue = normalizeCatalogText(value)
  return Boolean(normalizedValue && normalizeCatalogText(message).includes(normalizedValue))
}

export function detectExplicitProductDeliveryDetails({
  message = '',
  interpretation = {},
  previousFacts = {},
  fulfillmentType = '',
} = {}) {
  const previous = normalizeProductQueryFacts(previousFacts)
  if (clean(fulfillmentType || previous.fulfillment_type) !== 'entrega') {
    return {
      delivery_address: previous.delivery_address,
      delivery_neighborhood: previous.delivery_neighborhood,
      delivery_city: previous.delivery_city,
      delivery_reference: previous.delivery_reference,
    }
  }

  const raw = clean(message)
  const segments = raw.split(/[\n,;]+/).map((part) => clean(part)).filter(Boolean)
  const normalizedSegments = segments.map((part) => normalizeCatalogText(part))
  const streetPattern = /\b(?:rua|r|avenida|av|travessa|tv|alameda|rodovia|estrada|praca|largo)\b/
  const referencePattern = /\b(?:ao lado|em frente|perto|proximo|referencia|esquina|fundos)\b/
  const complementPattern = /\b(?:apt|apto|apartamento|bloco|casa|sala|loja|fundos|complemento)\b/
  const neighborhoodPattern = /\bbairro\s+(.+)$/

  let address = clean(previous.delivery_address)
  let neighborhood = clean(previous.delivery_neighborhood)
  let city = clean(previous.delivery_city)
  let reference = clean(previous.delivery_reference)
  const streetIndex = normalizedSegments.findIndex((part) => streetPattern.test(part))
  let consumedThrough = -1

  if (streetIndex >= 0) {
    const addressParts = [segments[streetIndex]]
    consumedThrough = streetIndex
    if (!/\d/.test(segments[streetIndex]) && /^\d+[a-z0-9\s./-]*$/i.test(segments[streetIndex + 1] || '')) {
      addressParts.push(segments[streetIndex + 1])
      consumedThrough = streetIndex + 1
    }
    if (complementPattern.test(normalizedSegments[consumedThrough + 1] || '')) {
      addressParts.push(segments[consumedThrough + 1])
      consumedThrough += 1
    }
    if (addressParts.some((part) => /\d/.test(part))) address = addressParts.join(', ')
  }

  for (let index = 0; index < segments.length; index += 1) {
    const part = segments[index]
    const normalizedPart = normalizedSegments[index]
    const neighborhoodMatch = normalizedPart.match(neighborhoodPattern)
    if (neighborhoodMatch) neighborhood = clean(part.replace(/^.*?\bbairro\s+/i, ''))
    if (referencePattern.test(normalizedPart)) reference = part
  }

  if (streetIndex >= 0) {
    const remaining = segments.slice(consumedThrough + 1)
    const remainingNormalized = normalizedSegments.slice(consumedThrough + 1)
    const neighborhoodIndex = remainingNormalized.findIndex((part) => (
      !referencePattern.test(part)
      && !complementPattern.test(part)
      && !/^\d/.test(part)
    ))
    if (!neighborhood && neighborhoodIndex >= 0) neighborhood = remaining[neighborhoodIndex]
  } else if (address && segments.length) {
    const firstNonReference = normalizedSegments.findIndex((part) => !referencePattern.test(part))
    if (!neighborhood && firstNonReference >= 0 && !/\d/.test(segments[firstNonReference])) {
      neighborhood = segments[firstNonReference].replace(/^.*?\bbairro\s+/i, '')
    }
  }

  const interpretedAddress = clean(interpretation.delivery_address)
  const interpretedNeighborhood = clean(
    interpretation.delivery_neighborhood || interpretation.neighborhood,
  )
  const interpretedCity = clean(interpretation.delivery_city || interpretation.city)
  const interpretedReference = clean(
    interpretation.delivery_reference || interpretation.reference,
  )
  const hasAddressEvidence = streetIndex >= 0 && segments.some((part) => /\d/.test(part))
  if (!address && hasAddressEvidence && messageContainsNormalizedValue(raw, interpretedAddress)) {
    address = interpretedAddress
  }
  if (!neighborhood && messageContainsNormalizedValue(raw, interpretedNeighborhood)) {
    neighborhood = interpretedNeighborhood
  }
  if (!city && messageContainsNormalizedValue(raw, interpretedCity)) city = interpretedCity
  if (!reference && messageContainsNormalizedValue(raw, interpretedReference)) {
    reference = interpretedReference
  }

  return {
    delivery_address: address,
    delivery_neighborhood: neighborhood,
    delivery_city: city,
    delivery_reference: reference,
  }
}

export function buildPetbotConversationOpening({
  message = '',
  history = [],
  customerName = '',
} = {}) {
  const alreadyIntroduced = (history || []).some((entry) => entry?.role === 'assistant')
  if (alreadyIntroduced) return ''

  const normalizedMessage = normalizeCatalogText(message)
  const greeting = /\bbom dia\b/.test(normalizedMessage)
    ? 'Bom dia'
    : /\bboa tarde\b/.test(normalizedMessage)
      ? 'Boa tarde'
      : /\bboa noite\b/.test(normalizedMessage)
        ? 'Boa noite'
        : 'Olá'
  const name = clean(customerName)
  return `${greeting}${name ? `, ${name}` : ''}! Eu sou a Luna, assistente virtual da Quatro Patas! 😊`
}

export function prependPetbotConversationOpening({
  reply = '',
  message = '',
  history = [],
  customerName = '',
} = {}) {
  const opening = buildPetbotConversationOpening({ message, history, customerName })
  const body = clean(reply)
  if (!opening) return body
  return body ? `${opening}\n\n${body}` : opening
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
    if (name === 'handoff_to_human') capabilities.add('human_handoff')
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
  const selectedCandidateAvailable = (toolRuns || []).some((run) => (
    run?.name === 'search_petshop_products'
    && run?.result?.selected_candidate?.available === true
    && run?.result?.selected_candidate?.sufficient_stock === true
  ))
  const claimsSelectedProductUnavailable = /\b(?:nao temos|nao esta disponivel|indisponivel|sem estoque|acabou)\b/.test(normalizedReply)
  if (selectedCandidateAvailable && claimsSelectedProductUnavailable) {
    problems.push('produto escolhido foi revalidado com estoque suficiente; não o apresente como indisponível')
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

  const claimsHandoff = /\b(?:vou|vamos|estou|estamos)\b.{0,35}\b(?:transferir|transferindo|chamar|chamando|passar|passando)\b/.test(normalizedReply)
    || /\b(?:transferencia|encaminhamento)\b.{0,35}\b(?:atendente|equipe|veterinaria|humano)\b/.test(normalizedReply)
  if (claimsHandoff && !capabilities.has('human_handoff')) {
    problems.push('transferência humana anunciada sem executar o handoff')
  }

  return {
    ok: problems.length === 0,
    problems,
    claims: { money: moneyClaims, times: timeClaims, dates: dateClaims },
  }
}

export function validatePetbotConversationReply({ reply = '', facts = {}, pendingOrder = null, currentMessageIsConfirmation = false, serviceContext = false, productContext = false, toolRuns = [] } = {}) {
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
  const asksPaymentConfirmation = /(?:confirma|confirmar).{0,45}(?:forma de pagamento|pagamento|pix|dinheiro|cartao)/.test(normalized)
    || /(?:forma de pagamento|pagamento|pix|dinheiro|cartao).{0,45}(?:confirma|confirmar|certo)/.test(normalized)
  const asksChange = /\btroco\b/.test(normalized)
  const asksProductFulfillment = /(?:entrega ou retirada|retirada na loja|servico de entrega|entregar ou retirar|vai retirar|prefere retirada)/.test(normalized)
  const asksServiceNotes = /(?:alguma|tem|possui|precisa de|gostaria de adicionar).{0,45}(?:observacao|observacoes|recado|cuidado especial)/.test(normalized)
    || /(?:observacao|observacoes).{0,45}(?:banho|tosa|servico|agendamento)/.test(normalized)
  const asksPetName = /(?:qual|como).{0,30}(?:nome).{0,20}(?:pet|cachorro|cao|cadela|gato|gata|dele|dela)/.test(normalized)
    || /(?:nome).{0,20}(?:do|da|desse|dessa).{0,15}(?:pet|cachorro|cao|cadela|gato|gata)/.test(normalized)
    || /(?:preciso|poderia|pode|informe|diga).{0,35}\bnome\b.{0,30}(?:pet|animal|cachorro|cao|cadela|gato|gata|dele|dela|seu|sua)/.test(normalized)
  const asksPetTransport = /(?:como|quem|voce|cliente|tutor|prefere).{0,55}(?:chegar|levar|trazer|motodog)/.test(normalized)
    || /(?:levar|trazer).{0,45}(?:loja|motodog)/.test(normalized)
  const asksServiceAddon = /(?:adicionar|incluir|gostaria|quer|deseja).{0,60}(?:outro servico|outro produto|algum servico|algum produto|corte de unhas|algo mais)/.test(normalized)
    || /(?:outro servico|outro produto|corte de unhas).{0,45}(?:adicionar|incluir|quer|deseja)/.test(normalized)
  const asksConfirmationAgain = /(?:confirma(?:r)?|voce confirma|pode confirmar).{0,50}(?:agendamento|pedido|horario)/.test(normalized)
    || /(?:para finalizar|so preciso confirmar).{0,80}/.test(normalized)
  const transportMode = normalizeCatalogText(facts.service_transport_mode)
  const customerBringsPet = /^(?:cliente leva|cliente_leva|sem transporte|sem_transporte|tutor leva|tutor_leva)$/.test(transportMode)
  const exactMotodogMode = Boolean(transportMode && transportMode !== 'motodog' && !customerBringsPet)
  const transportAddressComplete = Boolean(
    clean(facts.service_transport_address)
    && /\d/.test(clean(facts.service_transport_address))
    && clean(facts.service_transport_neighborhood)
    && clean(facts.service_transport_city)
    && clean(facts.service_transport_reference),
  )
  const transportAddressConfirmed = facts.service_transport_address_confirmed === true
  const transportResolved = Boolean(
    customerBringsPet
    || (exactMotodogMode && transportAddressComplete && transportAddressConfirmed),
  )
  const asksTransportOption = /(?:buscar e levar|somente buscar|so buscar|somente levar|so levar|qual opcao|qual modalidade)/.test(normalized)
  const asksTransportAddress = /(?:endereco|rua|numero|bairro|cidade|ponto de referencia|referencia)/.test(normalized)
  const offersPrematureSummary = /(?:posso|vou|quer que eu).{0,45}(?:preparar|montar).{0,30}(?:resumo|agendamento)/.test(normalized)
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
  if (productContext && asksPetName) {
    problems.push('nome do pet não é obrigatório para concluir uma compra de produto')
  }
  if (productContext && clean(facts.fulfillment_type) === 'retirada' && asksPaymentMethod) {
    problems.push('na retirada o pagamento é a combinar; não pergunte forma de pagamento')
  }
  if (productContext && clean(facts.payment_method) && (asksPaymentMethod || asksPaymentConfirmation)) {
    problems.push('forma de pagamento já registrada; não peça confirmação novamente')
  }
  if (isBathConversation && transportMode === 'motodog') {
    if (offersPrematureSummary || asksConfirmationAgain) {
      problems.push('MotoDog ainda precisa de modalidade; não apresente resumo nem peça confirmação final')
    }
    if (!asksTransportOption) {
      problems.push('MotoDog genérico exige escolher uma opção real da loja com a respectiva taxa')
    }
  }
  if (isBathConversation && exactMotodogMode && !transportAddressComplete) {
    if (offersPrematureSummary || asksConfirmationAgain) {
      problems.push('endereço do MotoDog está incompleto; não apresente resumo nem peça confirmação final')
    }
    if (!asksTransportAddress) {
      problems.push('modalidade MotoDog escolhida; pergunte somente os dados de endereço ainda ausentes')
    }
  }
  if (isBathConversation && exactMotodogMode && transportAddressComplete && !transportAddressConfirmed) {
    if (offersPrematureSummary || asksConfirmationAgain) {
      problems.push('endereço do MotoDog ainda não foi confirmado; não apresente o resumo final')
    }
    if (!asksTransportAddress) {
      problems.push('confirme com o cliente o endereço completo do MotoDog antes do resumo')
    }
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
    package_preference: rationPackagePreferenceForProduct(metadata),
    package_kg: metadata.packageKg || null,
    category: clean(product.category),
    type: clean(metadata.type),
  }
}

const PRODUCT_DIMENSIONS = [
  ['package_preference', 'formato da ração'],
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
  storeInformation = {},
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
    'Você é a Luna, assistente virtual da Quatro Patas.',
    'Converse em português do Brasil de maneira acolhedora, simpática e natural, com contexto e iniciativa comercial, sem soar como formulário nem exagerar nos emojis.',
    'A saudação e a apresentação da Luna na primeira resposta são acrescentadas pelo servidor. Não repita a apresentação por conta própria.',
    'Você decide como conduzir a conversa e quais ferramentas chamar. O servidor é a fonte de verdade para catálogo, preço, estoque, agenda, taxas e gravações.',
    '',
    'Princípios operacionais:',
    '- Nunca afirme preço, estoque, serviço exato, duração, data ou horário sem um resultado de ferramenta no turno atual ou um pedido pendente validado.',
    '- Para produtos, pesquise o catálogo. Quando houver várias opções, use somente os diferenciadores retornados pela ferramenta e pergunte apenas o que realmente separa as opções.',
    '- Para toda compra de ração, antes de listar produtos descubra o formato: granel, pacote pequeno de 1 ou 2 kg, ou saco maior de 7, 10, 15, 20 ou 25 kg. Se o cliente já informou o formato ou o peso da embalagem, não pergunte novamente.',
    '- Antes de oferecer ração, confirme também a espécie, a raça ou porte quando for cachorro, e a fase de vida: filhote, adulto, sênior ou castrado. Quando uma raça cadastrada estiver informada, o servidor já deriva o porte; nunca pergunte o porte novamente.',
    '- Quando o cliente informar uma raça, considere tanto produtos específicos daquela raça quanto produtos gerais do porte correspondente. Nunca ofereça produto específico de outra raça nem ração de outro porte.',
    '- Quando o cliente informar uma marca, preserve-a nos turnos seguintes e mostre somente produtos dessa marca. Não substitua silenciosamente por outra marca; ofereça alternativas apenas depois que o cliente aceitar ampliar a busca.',
    '- Em ração a granel, valores em kg pedidos depois da escolha são quantidade da venda, não tamanho de embalagem. Preserve package_preference="granel" e use quantity com os kg solicitados.',
    '- Se selected_product_candidate estiver preenchido, o cliente escolheu uma opção apresentada anteriormente. Use exatamente o ID desse candidato e o estoque revalidado; não substitua por uma nova busca aproximada nem diga que acabou quando sufficient_stock=true.',
    '- Em compras de produto, o nome do pet não é obrigatório. Nunca peça o nome do animal apenas para concluir uma venda.',
    '- Nunca suponha retirada, entrega ou forma de pagamento. Depois que produto e quantidade estiverem definidos, confirme retirada na loja ou entrega. Para entrega, pergunte Pix, dinheiro ou cartão. Para retirada, use pagamento "a combinar" e não pergunte a forma de pagamento. Use somente fulfillment_type e payment_method presentes no Estado confiável.',
    '- Para entrega, use o endereço, bairro e referência já presentes no Estado confiável. Pergunte somente os campos de entrega que ainda estiverem ausentes e nunca peça confirmação de um pagamento já registrado.',
    '- Para banho/tosa ou veterinária, resolva primeiro o serviço exato. Se a ferramenta indicar campos ausentes, peça-os naturalmente. Quando o serviço estiver resolvido, consulte a agenda.',
    '- Quando o bloco Contexto operacional pré-carregado já contiver resolução de serviço ou agenda, use esses dados diretamente e não repita a mesma consulta sem um novo fato do cliente.',
    '- Nunca pergunte tipo de pelo ou pelagem. A pelagem é uma classificação interna derivada da raça cadastrada no YuiSync.',
    '- Para banho/tosa, os únicos fatos de classificação que podem ser solicitados ao cliente são raça e peso aproximado. Se ambos já estiverem no estado confiável, não os pergunte nem peça confirmação novamente.',
    '- Se o cliente disser apenas MotoDog, consulte as opções reais e peça uma única escolha entre buscar e levar, somente buscar ou somente levar, com as taxas retornadas pela loja.',
    '- Depois da modalidade MotoDog, obtenha rua e número, bairro, cidade e ponto de referência. Nunca apresente resumo nem peça confirmação final enquanto qualquer um desses dados estiver ausente.',
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
    '- Se veterinary_risk estiver como emergency, chame handoff_to_human para veterinaria imediatamente e não continue a venda ou o agendamento.',
    '- Nunca diga que está transferindo ou chamando uma pessoa sem executar handoff_to_human no mesmo turno.',
    '- Em compras de produtos, faça venda consultiva com no máximo uma sugestão complementar relevante e aceite a recusa sem insistência. Essa regra não se aplica a agendamentos.',
    '- Para dúvidas sobre a loja, responda somente com as Informações verificadas da loja abaixo. Use a mensagem aprovada correspondente quando existir.',
    '- Perguntas sobre o que um banho ou uma tosa inclui são informativas: responda pela base service_knowledge e preserve o serviço e todos os fatos já coletados. Não transforme a pergunta em troca de serviço nem transfira por isso.',
    '- Se a resposta não estiver nas informações verificadas, diga claramente que precisa confirmar com a equipe e ofereça falar com um atendente. Não invente nem transfira antes de o cliente aceitar.',
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
    'Informações verificadas da loja:',
    JSON.stringify(storeInformation && typeof storeInformation === 'object' ? storeInformation : {}),
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
  const breedClassification = classifyCommonPetBreed(
    interpretation.breed || serviceFacts.breed,
  )
  const packageKg = Number(interpretation.package_kg || 0) || null
  return {
    product_kind: clean(interpretation.product_kind),
    pet_name: clean(interpretation.pet_name || serviceFacts.pet_name),
    species: clean(interpretation.species || serviceFacts.species || breedClassification?.species),
    breed: clean(breedClassification?.canonical || interpretation.breed || serviceFacts.breed),
    age_category: clean(interpretation.age_category),
    size: clean(
      interpretation.size
      || serviceFacts.size
      || breedClassification?.size
      || detectCatalogPetSize(interpretation.breed || serviceFacts.breed),
    ),
    brand: normalizeCatalogText(interpretation.brand),
    package_preference: normalizeRationPackagePreference(
      interpretation.package_preference,
      packageKg,
    ),
    package_kg: packageKg,
    quantity: Number(interpretation.quantity || 0) || null,
    payment_method: ['pix', 'dinheiro', 'cartao', 'a_combinar'].includes(clean(interpretation.payment_method))
      ? clean(interpretation.payment_method)
      : '',
    fulfillment_type: ['entrega', 'retirada'].includes(clean(interpretation.fulfillment_type))
      ? clean(interpretation.fulfillment_type)
      : '',
    delivery_address: clean(interpretation.delivery_address),
    delivery_neighborhood: clean(
      interpretation.delivery_neighborhood || interpretation.neighborhood,
    ),
    delivery_city: clean(interpretation.delivery_city || interpretation.city),
    delivery_reference: clean(
      interpretation.delivery_reference || interpretation.reference,
    ),
  }
}

export function mergeProductQueryFacts({
  interpretation = {},
  previousFacts = {},
  serviceFacts = {},
  message = '',
  semantics = {},
} = {}) {
  const current = normalizeProductQueryFacts(interpretation, serviceFacts)
  const previous = normalizeProductQueryFacts(previousFacts, serviceFacts)
  const messageBreed = classifyCommonPetBreed(message)
  const messageSize = detectCatalogPetSize(message)
  const messageSpecies = detectCatalogSpecies(message)
  const messageAge = detectCatalogAgeCategory(message)
  const normalizedMessage = normalizeCatalogText(message)
  const messagePaymentMethod = detectExplicitProductPaymentMethod(message)
  const messageFulfillmentType = detectExplicitProductFulfillmentType(message)
  const semanticPaymentMethod = ['pix', 'dinheiro', 'cartao'].includes(clean(semantics.payment_method))
    ? clean(semantics.payment_method)
    : ''
  const semanticFulfillmentType = ['entrega', 'retirada'].includes(clean(semantics.fulfillment_type))
    ? clean(semantics.fulfillment_type)
    : ''
  const semanticPackagePreference = normalizeRationPackagePreference(
    semantics.package_preference,
    semantics.package_kg,
  )
  const semanticQuantity = Number(semantics.quantity || 0) > 0
    ? Number(semantics.quantity)
    : null
  const explicitMessageFormat = /\b(?:granel|pacote|embalagem|saco|sacaria)\b/.test(normalizedMessage)
    ? normalizeRationPackagePreference(message)
    : ''
  const petChanged = Boolean(
    current.pet_name
    && previous.pet_name
    && normalizeCatalogText(current.pet_name) !== normalizeCatalogText(previous.pet_name),
  )
  const rejectsOtherBrand = /\bnao (?:quero|aceito|pode ser) (?:de )?outra marca\b/.test(normalizedMessage)
  const clearsBrandPreference = !rejectsOtherBrand && Boolean(
    /\b(?:outra marca|qualquer marca|sem preferencia de marca|nao tenho preferencia de marca)\b/.test(normalizedMessage)
    || (
      previous.brand
      && /\bnao precisa ser\b/.test(normalizedMessage)
      && normalizedMessage.includes(normalizeCatalogText(previous.brand))
    ),
  )
  const currentRequest = detectCatalogRequest(message, {
    productKind: current.product_kind || previous.product_kind,
    packagePreference: current.package_preference,
    packageKg: current.package_kg,
  })
  const bulkQuantityContinuation = Boolean(
    previous.package_preference === 'granel'
    && !explicitMessageFormat
    && !semanticPackagePreference
    && (semanticQuantity || detectExplicitProductQuantity(message, 'granel')),
  )
  const currentPackagePreference = bulkQuantityContinuation
    ? 'granel'
    : (
      explicitMessageFormat
      || semanticPackagePreference
      || previous.package_preference
      || currentRequest.packagePreference
    )
  const explicitQuantity = detectExplicitProductQuantity(
    message,
    bulkQuantityContinuation ? 'granel' : (currentPackagePreference || previous.package_preference),
  )
  const changedPackageFormat = Boolean(
    currentPackagePreference
    && previous.package_preference
    && currentPackagePreference !== previous.package_preference,
  )
  const fulfillmentType = semanticFulfillmentType || messageFulfillmentType || previous.fulfillment_type
  const paymentMethod = fulfillmentType === 'retirada'
    ? 'a_combinar'
    : fulfillmentType === 'entrega'
      ? (
        semanticPaymentMethod
        || messagePaymentMethod
        || (previous.payment_method === 'a_combinar' ? '' : previous.payment_method)
      )
      : ''
  const deliveryDetails = detectExplicitProductDeliveryDetails({
    message,
    interpretation,
    previousFacts: previous,
    fulfillmentType,
  })
  const merged = {
    product_kind: current.product_kind || previous.product_kind,
    pet_name: current.pet_name || previous.pet_name,
    species: current.species
      || messageSpecies
      || clean(messageBreed?.species)
      || (petChanged ? '' : previous.species),
    breed: current.breed
      || clean(messageBreed?.canonical)
      || (petChanged ? '' : previous.breed),
    age_category: current.age_category
      || messageAge
      || (petChanged ? '' : previous.age_category),
    size: current.size
      || clean(messageBreed?.size)
      || messageSize
      || (petChanged ? '' : previous.size),
    brand: clearsBrandPreference ? '' : (current.brand || previous.brand),
    package_preference: currentPackagePreference || previous.package_preference,
    package_kg: bulkQuantityContinuation
      ? null
      : (
        Number(semantics.package_kg || 0)
        || currentRequest.packageKg
        || (changedPackageFormat ? null : previous.package_kg)
      ),
    quantity: semanticQuantity
      || explicitQuantity
      || (changedPackageFormat ? null : previous.quantity),
    payment_method: paymentMethod,
    fulfillment_type: fulfillmentType,
    ...deliveryDetails,
  }
  const request = detectCatalogRequest(message, {
    productKind: merged.product_kind,
    packagePreference: merged.package_preference,
    packageKg: merged.package_kg,
    brand: merged.brand,
    breed: merged.breed,
    ageCategory: merged.age_category,
  })

  return {
    ...merged,
    product_kind: merged.product_kind || (['racao', 'granel'].includes(request.type) ? 'food' : ''),
    package_preference: request.packagePreference || merged.package_preference,
    package_kg: merged.package_preference === 'granel'
      ? null
      : (request.packageKg || merged.package_kg),
  }
}

export function recoverProductQueryFactsFromHistory({
  facts = {},
  history = [],
  serviceFacts = {},
} = {}) {
  return (history || [])
    .filter((entry) => entry?.role === 'user' && clean(entry?.content))
    .reduce((recovered, entry) => mergeProductQueryFacts({
      interpretation: {},
      previousFacts: recovered,
      serviceFacts,
      message: entry.content,
    }), normalizeProductQueryFacts(facts, serviceFacts))
}

export function enrichProductQueryFactsFromSavedPet({
  facts = {},
  savedPets = [],
} = {}) {
  const petName = normalizeCatalogText(facts.pet_name)
  if (!petName) return facts
  const matches = (savedPets || []).filter((pet) => normalizeCatalogText(pet?.name || pet?.pet_name) === petName)
  if (matches.length !== 1) return facts

  const savedPet = matches[0]
  return mergeProductQueryFacts({
    interpretation: {
      ...facts,
      pet_name: facts.pet_name || savedPet.name || savedPet.pet_name,
      species: facts.species || savedPet.species,
      breed: facts.breed || savedPet.breed,
      size: facts.size || savedPet.size,
    },
    previousFacts: facts,
    message: '',
  })
}

export function buildRationQualificationReply({ message = '', facts = {} } = {}) {
  const request = detectCatalogRequest(message, facts)
  if (!['racao', 'granel'].includes(request.type)) return ''

  const packageReply = buildRationPackagePreferenceReply(message, facts)
  if (packageReply) return packageReply

  const petName = clean(facts.pet_name)
  if (!clean(facts.species)) {
    return petName
      ? `${petName} é cachorro ou gato?`
      : 'A ração é para cachorro ou gato?'
  }
  if (clean(facts.species) === 'dog' && !clean(facts.size)) {
    return clean(facts.breed)
      ? `Qual é o porte do ${petName || 'seu cachorro'}?`
      : `Qual é a raça ou o porte do ${petName || 'seu cachorro'}?`
  }
  if (['dog', 'cat'].includes(clean(facts.species)) && !clean(facts.age_category)) {
    return `${petName || 'O pet'} é filhote, adulto, sênior ou castrado?`
  }
  return ''
}

export function buildProductCheckoutQualificationReply({
  facts = {},
  selectedProduct = null,
} = {}) {
  if (!selectedProduct || Number(facts.quantity || 0) <= 0) return ''
  if (!clean(facts.fulfillment_type)) {
    return 'Perfeito! Você prefere retirar na loja ou receber por entrega?'
  }
  if (clean(facts.fulfillment_type) === 'entrega' && !clean(facts.payment_method)) {
    return 'Certo! Para a entrega, como você prefere pagar: Pix, dinheiro ou cartão?'
  }
  if (clean(facts.fulfillment_type) === 'entrega') {
    const missingAddress = !clean(facts.delivery_address) || !/\d/.test(clean(facts.delivery_address))
    const missingNeighborhood = !clean(facts.delivery_neighborhood)
    const missingReference = !clean(facts.delivery_reference)
    if (missingAddress && missingNeighborhood && missingReference) {
      return 'Perfeito! Agora me informe o endereço da entrega: rua e número, bairro e um ponto de referência.'
    }
    const missing = [
      ...(missingAddress ? ['rua e número'] : []),
      ...(missingNeighborhood ? ['bairro'] : []),
      ...(missingReference ? ['ponto de referência'] : []),
    ]
    if (missing.length) {
      return `Só falta informar ${missing.join(' e ')} para a entrega.`
    }
  }
  return ''
}

export function productFactsSignature(facts = {}) {
  return JSON.stringify({
    product_kind: clean(facts.product_kind),
    species: clean(facts.species),
    breed: normalizeCatalogText(facts.breed),
    size: clean(facts.size),
    age_category: clean(facts.age_category),
    brand: normalizeCatalogText(facts.brand),
    package_preference: clean(facts.package_preference),
    package_kg: Number(facts.package_kg || 0) || null,
  })
}

export function resolveRecentProductCandidate(message = '', candidates = []) {
  const normalized = normalizeCatalogText(message)
  if (!normalized || !(candidates || []).length) return null
  const directNumber = normalized.match(/^\s*([1-9]\d?)\s*(?:mesmo)?\s*$/)
  const numberMatch = directNumber || normalized.match(
    /\b(?:opcao|numero|quero|prefiro|escolho|vou levar|a|da)\s*(?:a\s*)?([1-9]\d?)\b(?!\s*(?:kg|g|ml|un)\b)/,
  )
  let index = numberMatch ? Number(numberMatch[1]) - 1 : -1
  if (/\b(?:primeir[oa]|a primeira|o primeiro)\b/.test(normalized)) index = 0
  if (/\b(?:segund[oa]|a segunda|o segundo)\b/.test(normalized)) index = 1
  if (/\b(?:terceir[oa]|a terceira|o terceiro)\b/.test(normalized)) index = 2
  if (index < 0 || index >= candidates.length) return null
  return candidates[index] || null
}

export function isPetshopServiceKnowledgeQuestion(message = '') {
  const normalized = normalizeCatalogText(message)
  const asksContent = /\b(?:inclui|incluso|inclusa|contem|vem com|faz parte|o que tem|o que inclui|como funciona)\b/.test(normalized)
  const mentionsService = /\b(?:banho|tosa|higienica|higienico|unha|unhas|ouvido|ouvidos|escovacao dental|consulta veterinaria)\b/.test(normalized)
  return Boolean(mentionsService && (asksContent || String(message).includes('?')))
}

function serviceKnowledgeEntries(storeInformation = {}) {
  const knowledge = storeInformation?.service_knowledge
  return knowledge && typeof knowledge === 'object' ? knowledge : {}
}

function selectServiceKnowledge(message = '', storeInformation = {}) {
  const normalized = normalizeCatalogText(message)
  const entries = serviceKnowledgeEntries(storeInformation)
  const preferred = []
  if (/consulta|veterin/.test(normalized)) preferred.push('veterinary_consultation')
  if (/escovacao|dental|dente/.test(normalized)) preferred.push('dental_brushing')
  if (/tesoura/.test(normalized)) preferred.push('small_scissor_grooming')
  if (/maquina/.test(normalized)) preferred.push('small_machine_grooming')
  if (/tosa total|tosa do corpinho|banho e tosa/.test(normalized)) preferred.push('medium_full_grooming', 'small_machine_grooming', 'small_scissor_grooming')
  if (/banho|higien/.test(normalized)) preferred.push('small_bath_service', 'medium_double_coat_bath', 'medium_coat_bath')
  for (const key of preferred) {
    if (clean(entries[key])) return clean(entries[key])
  }
  return ''
}

export function buildVerifiedStoreQuestionReply({ message = '', storeInformation = {} } = {}) {
  const normalized = normalizeCatalogText(message)
  const lines = []
  const address = clean(storeInformation?.address)
  const phone = clean(storeInformation?.phone)
  const businessHours = storeInformation?.business_hours && typeof storeInformation.business_hours === 'object'
    ? storeInformation.business_hours
    : {}

  if (/\b(?:endereco|localizacao|onde fica|como chegar)\b/.test(normalized) && address) {
    lines.push(`Endereço: ${address}.`)
  }
  if (/\b(?:telefone|whatsapp|contato)\b/.test(normalized) && phone) {
    lines.push(`Telefone: ${phone}.`)
  }
  if (/\b(?:horario|funcionamento|abre|abrem|fecha|fecham)\b/.test(normalized)) {
    const requestedDay = Object.keys(businessHours).find((day) => normalized.includes(normalizeCatalogText(day)))
    const entries = (requestedDay ? [[requestedDay, businessHours[requestedDay]]] : Object.entries(businessHours))
      .map(([day, periods]) => {
        const values = Array.isArray(periods) ? periods.filter(Boolean) : []
        return `${day}: ${values.length ? values.join(' e ') : 'fechado'}`
      })
    if (entries.length) lines.push(`Horário de funcionamento: ${entries.join('; ')}.`)
  }
  if (/\b(?:forma|formas|meio|meios)\b.{0,25}\bpagamento\b|\bpagamento\b/.test(normalized)) {
    const methods = Array.isArray(storeInformation?.product_payment_methods)
      ? storeInformation.product_payment_methods.filter(Boolean)
      : []
    if (methods.length) lines.push(`Para produtos, aceitamos ${methods.join(', ')}.`)
    if (clean(storeInformation?.service_payment_policy)) lines.push(clean(storeInformation.service_payment_policy))
  }
  if (isPetshopServiceKnowledgeQuestion(message)) {
    const serviceAnswer = selectServiceKnowledge(message, storeInformation)
    if (serviceAnswer) lines.push(serviceAnswer)
  }

  return lines.join('\n')
}

export function buildUnknownStoreQuestionReply({ storeInformation = {} } = {}) {
  const approved = storeInformation?.approved_messages && typeof storeInformation.approved_messages === 'object'
    ? storeInformation.approved_messages
    : {}
  return clean(
    approved.unknown_information
    || approved.unknown_question
    || approved.human_assistance_offer,
  ) || 'Não tenho essa informação confirmada no cadastro da loja. Posso chamar um atendente para verificar para você?'
}

export function shouldAnswerVerifiedStoreQuestion({
  message = '',
  detectedIntent = '',
  interpretedIntent = '',
  serviceOrderType = '',
  hasPendingOrder = false,
} = {}) {
  if (hasPendingOrder) return false
  const serviceKnowledgeQuestion = isPetshopServiceKnowledgeQuestion(message)
  if (!serviceKnowledgeQuestion && clean(detectedIntent).toLowerCase() !== 'duvida') return false
  if (!serviceKnowledgeQuestion && clean(serviceOrderType)) return false
  if (!serviceKnowledgeQuestion && ['produto', 'banho_tosa', 'veterinaria', 'multi'].includes(clean(interpretedIntent).toLowerCase())) return false

  const normalized = normalizeCatalogText(message)
  return String(message).includes('?')
    || /\b(?:qual|quais|onde|quando|como|voces|tem|teria|fazem|oferecem|aceitam|abre|abrem|fecha|fecham|funciona|funcionamento|horario|endereco|telefone|pagamento)\b/.test(normalized)
}
