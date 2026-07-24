import { DateTime } from 'luxon'
import { HttpError } from './http.js'
import { serverEnv } from './env.js'
import { logger } from './logger.js'
import {
  buildPetbotSearchText,
  recoverPetbotContextFromHistory,
} from './petbotContext.js'
import {
  buildInterpretedPetbotSearchText,
  interpretPetbotMessageWithLlm,
  resolveEffectiveVeterinaryRisk,
  resolvePetbotTurnSemantics,
} from './petbotAi.js'
import {
  detectCatalogRequest,
  rankCatalogProducts,
} from './petbotCatalog.js'
import {
  PETBOT_AGENT_TOOLS,
  acceptedPetbotHandoffOffer,
  buildPetbotOperationalPreflight,
  buildServiceAvailability,
  explicitPetbotHandoffTarget,
  findPetshopSubscriptionBenefit,
  groundPetbotServiceArgs,
  isExplicitPetbotConfirmation,
  mergeInterpretedPetbotServiceFacts,
  isServiceCatalogProduct,
  listPetTransportOptions,
  mergePetshopServiceCatalogs,
  normalizePetbotSchedulingSettings,
  preparePetshopOrderDraft,
  resolvePetshopService,
  resolvePetTransportSelection,
  runPetbotAgent,
  shouldForcePetbotServicePreparation,
} from './petbotAgent.js'
import {
  completeLunaTurnTrace,
  createLunaTurnTrace,
  deriveLegacyOperationEvent,
  operationStateFromLegacyContext,
  verifyOperationTurn,
  isCustomerNamePlaceholder,
  normalizeCustomerDisplayName,
  recoverCommittedResultFromContext,
  resolveTransportModeFromSemantics,
  runBathShadowTurn,
} from './luna/index.js'
import {
  analyzeProductDifferentiation,
  buildPetbotAgentV3Prompt,
  buildProductCheckoutQualificationReply,
  buildRationQualificationReply,
  acceptedVeterinaryConsultationOffer,
  buildUnknownStoreQuestionReply,
  buildVerifiedStoreQuestionReply,
  buildVeterinaryConsultationReply,
  declinedVeterinaryConsultationOffer,
  detectExplicitProductQuantity,
  enrichProductQueryFactsFromSavedPet,
  mergeProductQueryFacts,
  prependPetbotConversationOpening,
  isPetshopServiceKnowledgeQuestion,
  isVeterinaryConsultationQuestion,
  isVeterinaryTreatmentAdviceRequest,
  productFactsSignature,
  recoverProductQueryFactsFromHistory,
  resolveRecentProductCandidate,
  shouldAnswerVerifiedStoreQuestion,
  validatePetbotConversationReply,
  validatePetbotOperationalReply,
} from './petbotGrounding.js'

const SUPPORTED_MODULES = new Set(['petshop'])
const PRODUCT_CONTEXT_LIMIT = 18
const RECENT_HISTORY_LIMIT = 14
const PRODUCT_CATALOG_CACHE_MS = 5 * 60 * 1000
const SETTINGS_CACHE_MS = 60 * 1000
const APPOINTMENTS_CACHE_MS = 30 * 1000
const MAX_CACHED_PRODUCTS = 1500
const CLIENT_PROFILE_SELECT = 'id,name,phone,address,neighborhood,city,details'
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
  'ola',
  'opa',
  'bom',
  'boa',
  'dia',
  'ela',
  'ele',
  'ja',
  'meu',
  'minha',
  'nao',
  'tarde',
  'noite',
  'pra',
  'pro',
  'racao',
  'racoes',
  'sei',
  'ser',
  'seu',
  'sua',
  'um',
  'uma',
])

const DEFAULT_BOT_MODEL = serverEnv.openAiModel
const DEFAULT_BOT_TEMPERATURE = 0.5
function parsePetbotAgentReply(value = '') {
  const text = cleanText(value)
  if (!text) return { message: '' }
  try {
    const parsed = JSON.parse(text)
    return { message: cleanText(parsed?.message) }
  } catch {
    return { message: text }
  }
}

const DEFAULT_DELIVERY_FEE = 8
const AVAILABLE_STATUSES = new Set(['available', 'livre', 'disponivel', 'aberto', 'open'])
const BUSY_STATUSES = new Set(['agendado', 'confirmado', 'em_andamento', 'booked', 'ocupado', 'blocked', 'bloqueado'])
const KNOWN_BREED_TERMS = new Set([
  'akita',
  'beagle',
  'border',
  'boxer',
  'buldogue',
  'bulldog',
  'chihuahua',
  'collie',
  'dachshund',
  'doberman',
  'golden',
  'husky',
  'labrador',
  'lhasa',
  'maltese',
  'pastor',
  'pinscher',
  'pitbull',
  'poodle',
  'pug',
  'rottweiler',
  'schnauzer',
  'shi',
  'shih',
  'spitz',
  'tzu',
  'vira',
  'york',
  'yorkshire',
])
const AGE_CATEGORY_TERMS = new Set([
  'adulto',
  'adultos',
  'adulta',
  'adultas',
  'filhote',
  'filhotes',
  'puppy',
  'junior',
  'senior',
  'idoso',
  'castrado',
  'castrada',
  'castrados',
  'indoor',
  'light',
])
const SIZE_CATEGORY_TERMS = new Set([
  'mini',
  'pequeno',
  'pequenos',
  'pequena',
  'pequenas',
  'medio',
  'medios',
  'media',
  'medias',
  'grande',
  'grandes',
  'gigante',
  'gigantes',
])

const productCatalogCache = new Map()
const storeSettingsCache = new Map()
const appointmentsCache = new Map()

function scopeCacheKey(moduleId, tenantId) {
  return `${String(tenantId || '')}:${String(moduleId || '').toLowerCase()}`
}

async function cachedLoad(cache, key, ttlMs, loader) {
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && now - cached.loadedAt < ttlMs) return cached.value

  try {
    const value = await loader()
    cache.set(key, { loadedAt: now, value })
    return value
  } catch (error) {
    if (cached?.value) return cached.value
    throw error
  }
}

function detectIntent(message = '') {
  const lower = normalizeSearchText(message)

  if (/racao|petisc|brinquedo|shampoo|coleira|antipulga|carrapato|areia|produto|comprar|preco|estoque/i.test(lower)) {
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

function normalizePhone(value = '') {
  return String(value || '').replace(/\D/g, '')
}

function cleanText(value = '') {
  return String(value || '').trim()
}

function petbotServiceFactsSignature(facts = {}) {
  return JSON.stringify({
    pet_name: normalizeSearchText(facts.pet_name),
    species: normalizeSearchText(facts.species),
    breed: normalizeSearchText(facts.breed),
    weight_kg: Number(facts.weight_kg || 0) || null,
  })
}

function isExplicitNoServiceNotesAnswer(message = '', history = []) {
  const answer = normalizeSearchText(message)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!/^(?:nao|n|nenhuma|nenhum|nada|sem observacao|sem observacoes|tudo certo|normal)$/.test(answer)) return false

  const previousAssistant = [...(history || [])]
    .reverse()
    .find((entry) => ['assistant', 'human_agent'].includes(entry?.role))
  const previousText = normalizeSearchText(previousAssistant?.content)
  return /\b(?:observacao|observacoes|recado|alergia|perfume|cuidado especial)\b/.test(previousText)
}

function isServiceInformationQuestion(message = '') {
  const raw = cleanText(message)
  const normalized = normalizeSearchText(raw)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return false
  const serviceSubject = /\b(?:banho|tosa|servico|consulta|hidratacao|escovacao|unha|ouvido)\b/.test(normalized)
  const questionForm = /[?？]/.test(raw)
    || /^(?:o que|que |qual |quais |como |quando |onde |quanto |tem |inclui |vem |pode me dizer|gostaria de saber)\b/.test(normalized)
  return serviceSubject && questionForm
}

function inferExplicitServiceNoteUpdate(message = '') {
  const raw = cleanText(message)
  const normalized = normalizeSearchText(raw)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized || isServiceInformationQuestion(raw)) return ''

  if (/\bsem perfume\b/.test(normalized)) return 'sem perfume'
  if (/\bnao usar perfume\b/.test(normalized)) return 'sem perfume'
  if (/\bsem laco\b/.test(normalized)) return 'sem laço'
  if (/\bsem gravata\b/.test(normalized)) return 'sem gravata'
  if (/\b(?:com bastante cuidado|com cuidado|aparar com cuidado)\b/.test(normalized)) return 'fazer com cuidado'
  return ''
}

export function inferExplicitPetTransportMode(message = '', history = []) {
  const answer = normalizeSearchText(message)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!answer) return ''
  const previousAssistant = [...(history || [])]
    .reverse()
    .find((entry) => ['assistant', 'human_agent'].includes(entry?.role))
  const previousText = normalizeSearchText(previousAssistant?.content)
  const selectingMotodogOption = /(?:qual modalidade|buscar e levar).*(?:somente buscar).*(?:somente levar)/.test(previousText)

  if (/\b(?:buscar e levar|busca e leva|buscar e trazer|ida e volta|levar e buscar)\b/.test(answer)) return 'buscar_e_levar'
  if (/\b(?:somente buscar|so buscar|apenas buscar|buscar apenas|vir buscar)\b/.test(answer)) return 'somente_buscar'
  if (/\b(?:somente levar|so levar|apenas levar|levar apenas|levar de volta|trazer de volta)\b/.test(answer)) return 'somente_levar'

  const genericPickupQuestion = (
    /\b(?:consegue|conseguem|pode|podem|tem como|voces|vcs)\b.*\b(?:buscar|buscam|busca|pegar|pegam|pega|recolher|recolhem)\b/.test(answer)
    || /^(?:buscam|busca|buscar|pegam|pega|pegar|recolhem|recolhe|recolher|vir buscar)(?: (?:ele|ela|o pet|a pet|meu pet|minha pet))?(?: aqui| em casa| no endereco| no meu endereco)?$/.test(answer)
  )
  if (!selectingMotodogOption && genericPickupQuestion) return 'motodog'

  if (selectingMotodogOption && /^(?:1|primeira|primeiro|primeira opcao|opcao 1)$/.test(answer)) return 'buscar_e_levar'
  if (selectingMotodogOption && /^(?:2|segunda|segundo|segunda opcao|opcao 2|buscar)$/.test(answer)) return 'somente_buscar'
  if (selectingMotodogOption && /^(?:3|terceira|terceiro|terceira opcao|opcao 3|levar)$/.test(answer)) return 'somente_levar'
  if (/\b(?:motodog|moto dog)\b/.test(answer)) return 'motodog'
  if (/\b(?:vou levar|eu levo|eu vou levar|vou trazer|eu trago|levo ele|levo ela|por conta propria)\b/.test(answer)) {
    return 'cliente_leva'
  }

  if (/^(?:vou|eu|sim|isso)$/.test(answer) && /\b(?:levar|trazer)\b/.test(previousText)) {
    return 'cliente_leva'
  }
  return ''
}

export function didCurrentTurnSelectPetbotSchedule({ interpretation = {}, previousFacts = {}, semantics = {} } = {}) {
  const target = cleanText(semantics?.target)
  if (['appointment_time', 'service_time'].includes(target)) return true

  const interpretedTime = cleanText(
    interpretation?.service_preferred_time
    || interpretation?.service_time_preference,
  )
  if (!interpretedTime) return false

  const previousTime = cleanText(
    previousFacts?.service_preferred_time
    || previousFacts?.service_time_preference,
  )
  return interpretedTime !== previousTime
}

function isPetbotCustomerBringsMode(value = '') {
  return /^(?:cliente_leva|cliente leva|sem_transporte|sem transporte|tutor_leva|tutor leva)$/.test(normalizeSearchText(value))
}

function hasPetbotStreetNumber(value = '') {
  return Boolean(cleanText(value) && /\d/.test(cleanText(value)))
}

function enrichPetbotMotodogAddressFromCustomer(facts = {}, customer = null) {
  const mode = cleanText(facts.service_transport_mode)
  if (
    !mode
    || mode === 'motodog'
    || isPetbotCustomerBringsMode(mode)
    || facts.service_transport_address_profile_rejected
  ) return facts

  const alreadyHasAddress = [
    facts.service_transport_address,
    facts.service_transport_neighborhood,
    facts.service_transport_city,
    facts.service_transport_reference,
  ].some((value) => cleanText(value))
  if (alreadyHasAddress) return facts

  const client = customer?.client || {}
  const details = parseJsonObject(client.details)
  const profileAddress = cleanText(client.address)
  const profileNeighborhood = cleanText(client.neighborhood)
  const profileCity = cleanText(client.city)
  const profileReference = cleanText(details.address_reference)
  if (![profileAddress, profileNeighborhood, profileCity, profileReference].some(Boolean)) return facts

  return {
    ...facts,
    service_transport_address: profileAddress || null,
    service_transport_neighborhood: profileNeighborhood || null,
    service_transport_city: profileCity || null,
    service_transport_reference: profileReference || null,
    service_transport_address_confirmed: false,
    service_transport_address_from_profile: true,
  }
}

function looksLikePetbotTransportReference(value = '') {
  const normalized = normalizeSearchText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return false
  return /\b(?:em frente|ao lado|proximo|perto|referencia|portao|mercearia|mercado|igreja|escola|farmacia|posto|esquina|casa azul|predio|condominio)\b/.test(normalized)
}

export function sanitizePetbotTransportAddress(fields = {}) {
  const next = {
    service_transport_address: cleanText(fields.service_transport_address) || null,
    service_transport_neighborhood: cleanText(fields.service_transport_neighborhood) || null,
    service_transport_city: cleanText(fields.service_transport_city) || null,
    service_transport_reference: cleanText(fields.service_transport_reference) || null,
  }
  if (looksLikePetbotTransportReference(next.service_transport_city)) {
    next.service_transport_reference ||= next.service_transport_city
    next.service_transport_city = null
  }
  if (
    next.service_transport_city
    && next.service_transport_reference
    && normalizeSearchText(next.service_transport_city) === normalizeSearchText(next.service_transport_reference)
  ) {
    next.service_transport_city = null
  }
  return next
}

function inferPetbotTransportAddress(message = '', history = []) {
  const previousAssistant = [...(history || [])]
    .reverse()
    .find((entry) => ['assistant', 'human_agent'].includes(entry?.role))
  const previousText = normalizeSearchText(previousAssistant?.content)
  if (!/(?:motodog|endereco|rua e numero|bairro|cidade|distrito|referencia)/.test(previousText)) return {}

  const raw = cleanText(message)
  if (!raw || raw.length < 6) return {}
  const referenceMatch = raw.match(/(?:referencia|referência|ponto de referencia|ponto de referência)\s*[:\-]?\s*(.+)$/i)
  const reference = cleanText(referenceMatch?.[1])
  const withoutReference = referenceMatch ? raw.slice(0, referenceMatch.index).replace(/[,;\s-]+$/, '') : raw
  const labeledAddress = withoutReference.match(/(?:rua|avenida|av\.?|travessa|estrada)\s+(.+?)\s*(?:,|\-|numero|número|nº)\s*(\d+[a-zA-Z-]*)/i)
  const neighborhoodMatch = withoutReference.match(/(?:bairro)\s*[:\-]?\s*([^,;]+)/i)
  const cityMatch = withoutReference.match(/(?:cidade|distrito)\s*[:\-]?\s*([^,;]+)/i)
  const inferred = {}

  if (labeledAddress) {
    const streetPrefix = withoutReference.match(/\b(rua|avenida|av\.?|travessa|estrada)\b/i)?.[1] || 'Rua'
    inferred.service_transport_address = `${streetPrefix} ${cleanText(labeledAddress[1])}, ${cleanText(labeledAddress[2])}`
  }
  if (neighborhoodMatch) inferred.service_transport_neighborhood = cleanText(neighborhoodMatch[1])
  if (cityMatch) inferred.service_transport_city = cleanText(cityMatch[1])
  if (reference) inferred.service_transport_reference = reference

  const parts = withoutReference.split(/[,;]/).map(cleanText).filter(Boolean)
  if (!inferred.service_transport_address) {
    if (parts.length >= 4 && /^\d+[a-zA-Z-]*$/.test(parts[1])) {
      inferred.service_transport_address = `${parts[0]}, ${parts[1]}`
      inferred.service_transport_neighborhood ||= parts[2]
      inferred.service_transport_city ||= parts[3]
    } else if (parts.length >= 3 && /\d/.test(parts[0])) {
      inferred.service_transport_address = parts[0]
      inferred.service_transport_neighborhood ||= parts[1]
      if (looksLikePetbotTransportReference(parts[2])) {
        inferred.service_transport_reference ||= parts[2]
      } else {
        inferred.service_transport_city ||= parts[2]
      }
    }
  }

  return sanitizePetbotTransportAddress(inferred)
}

function inferPetbotTransportAddressConfirmation(message = '', history = []) {
  const previousAssistant = [...(history || [])]
    .reverse()
    .find((entry) => ['assistant', 'human_agent'].includes(entry?.role))
  const previousText = normalizeSearchText(previousAssistant?.content)
  if (!/(?:posso usar|confirma).*(?:endereco|motodog)/.test(previousText)) return null

  const answer = normalizeSearchText(message)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (/^(?:sim|s|pode|pode usar|confirmo|correto|isso|esse mesmo|esta certo)$/.test(answer)) return true
  if (/^(?:nao|n|outro|outro endereco|nao pode|esta errado|mudei)$/.test(answer)) return false
  return null
}

function buildPetbotTransportQualificationReply({ facts = {}, settings = {} } = {}) {
  const mode = cleanText(facts.service_transport_mode)
  if (!mode || isPetbotCustomerBringsMode(mode)) return ''
  const options = listPetTransportOptions(settings)
  const formatOption = (option) => `• ${option.label} — ${formatPetbotCurrency(option.fee)}`

  if (mode === 'motodog') {
    if (!options.length) {
      return 'O MotoDog ainda não está configurado para esta loja. Você consegue levar o pet até a unidade?'
    }
    return [
      'Claro! Temos estas opções de MotoDog:',
      '',
      ...options.map(formatOption),
      '',
      'Qual delas você prefere?',
    ].join('\n')
  }

  const selection = resolvePetTransportSelection({
    args: {
      service_transport_mode: mode,
      service_transport_label: facts.service_transport_label,
    },
    settings,
    orderType: 'banho_tosa',
    requireDecision: true,
  })
  if (!selection.ok) {
    if (!options.length) return 'Essa modalidade do MotoDog não está disponível. Você consegue levar o pet até a loja?'
    return [
      'Essa modalidade não está disponível. Escolha uma das opções ativas:',
      '',
      ...options.map(formatOption),
    ].join('\n')
  }

  const missing = []
  if (!hasPetbotStreetNumber(facts.service_transport_address)) missing.push('rua e número')
  if (!cleanText(facts.service_transport_neighborhood)) missing.push('bairro')
  if (!cleanText(facts.service_transport_city)) missing.push('cidade ou distrito')
  if (!cleanText(facts.service_transport_reference)) missing.push('ponto de referência')
  if (missing.length) {
    return [
      `${selection.label} selecionado por ${formatPetbotCurrency(selection.fee)}.`,
      `Agora me informe ${missing.join(', ')} para o MotoDog.`,
    ].join('\n')
  }

  if (facts.service_transport_address_confirmed !== true) {
    const address = [
      cleanText(facts.service_transport_address),
      cleanText(facts.service_transport_neighborhood),
      cleanText(facts.service_transport_city),
    ].filter(Boolean).join(' - ')
    return [
      `${selection.label} selecionado por ${formatPetbotCurrency(selection.fee)}.`,
      facts.service_transport_address_from_profile
        ? 'Encontrei este endereço no cadastro:'
        : 'Confirme o endereço do MotoDog:',
      address,
      `Referência: ${cleanText(facts.service_transport_reference)}`,
      'Posso usar este endereço para o MotoDog?',
    ].join('\n')
  }

  return ''
}


export function buildPetbotAvailableSlotContinuation({
  availability = {},
  facts = {},
  settings = {},
  timezone = 'America/Sao_Paulo',
  currentTurnSelectedSchedule = false,
  customerName = '',
} = {}) {
  const requested = availability?.requested_slot
  if (!currentTurnSelectedSchedule || requested?.available !== true) return ''

  const requestedDateTime = DateTime.fromISO(cleanText(requested.scheduled_at), { setZone: true }).setZone(timezone)
  const requestedTime = requestedDateTime.isValid
    ? requestedDateTime.toFormat('HH:mm')
    : cleanText(facts.service_preferred_time)
  const availabilityPrefix = requestedTime
    ? `Sim, ${requestedTime} está disponível.`
    : 'Sim, o horário solicitado está disponível.'
  if (!normalizeCustomerDisplayName(customerName)) {
    return `${availabilityPrefix}\n\nAntes de continuar, qual é o seu nome?`
  }

  const transportReply = buildPetbotTransportQualificationReply({ facts, settings })
  if (transportReply) return `${availabilityPrefix}\n\n${transportReply}`
  if (!cleanText(facts.service_transport_mode)) {
    const petName = cleanText(facts.pet_name)
    return [
      availabilityPrefix,
      '',
      petName
        ? `Como o ${petName} chegará à loja: você vai levar ou prefere usar o MotoDog?`
        : 'Como o pet chegará à loja: você vai levar ou prefere usar o MotoDog?',
    ].join('\n')
  }
  return ''
}

function appointmentDateIso(row = {}) {
  if (row.service_date) return String(row.service_date).slice(0, 10)
  if (!row.scheduled_at) return ''
  return new Date(row.scheduled_at).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

function appointmentTimeText(row = {}) {
  if (row.start_time) return String(row.start_time).slice(0, 5)
  if (!row.scheduled_at) return ''
  return new Date(row.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

function normalizeAppointmentRows(rows = []) {
  const byId = new Map()
  for (const row of rows || []) {
    if (!row) continue
    const date = appointmentDateIso(row)
    const time = appointmentTimeText(row)
    const scheduledAt = row.scheduled_at || (date && time ? `${date}T${time}:00-03:00` : null)
    byId.set(row.id || `${date}-${time}-${row.service_type}`, {
      ...row,
      scheduled_at: scheduledAt,
      service_date: row.service_date || date || null,
      start_time: row.start_time || (time ? `${time}:00` : null),
    })
  }
  return [...byId.values()].filter((row) => row.scheduled_at)
}

function parseJsonObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(String(value))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function hasPetbotState(context) {
  const parsed = parseJsonObject(context)
  const legacyState = parsed.petbot && typeof parsed.petbot === 'object' && parsed.petbot.updatedAt
  const agentState = parsed.petbot_agent && typeof parsed.petbot_agent === 'object' && parsed.petbot_agent.updatedAt
  return Boolean(legacyState || agentState)
}

function isUuid(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanText(value))
}

function parseRating(value = '') {
  const text = cleanText(value)
  if (!/^(10|[0-9])$/.test(text)) return null
  return Number(text)
}

function hasConfirmedOrderContext(session) {
  const context = parseJsonObject(session?.context)
  return Boolean(context.last_sale_id || context.last_order_id || context.last_appointment_id)
}

function parseRegistrationUpdateFromMessage(message = '') {
  const text = cleanText(message)
  const details = {}
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

async function updateCustomerRegistrationFromMessage(supabase, session, message) {
  if (!session.client_id) return false
  const parsed = parseRegistrationUpdateFromMessage(message)
  if (!parsed.document && !Object.keys(parsed.details).length) return false

  const { data: current } = await supabase
    .from('clients')
    .select('document,details')
    .eq('id', session.client_id)
    .maybeSingle()

  const nextDetails = {
    ...(parseJsonObject(current?.details)),
    ...parsed.details,
  }

  const { error } = await supabase
    .from('clients')
    .update({
      ...(parsed.document ? { document: parsed.document } : {}),
      details: {
        ...nextDetails,
        registration_status: nextDetails.tutor_birth_date && nextDetails.zip_code && nextDetails.address_number && nextDetails.address_reference && (parsed.document || current?.document)
          ? 'completo'
          : 'pendente',
      },
    })
    .eq('id', session.client_id)

  return !error
}

function isPlaceholderName(value = '') {
  return isCustomerNamePlaceholder(value)
}

function normalizeSpecies(value = '') {
  const lower = cleanText(value).toLowerCase()
  if (lower.includes('cach') || lower.includes('dog')) return 'dog'
  if (lower.includes('gat') || lower.includes('cat')) return 'cat'
  return lower || ''
}

function buildSearchTerms(message = '') {
  const terms = normalizeSearchText(message)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !PRODUCT_STOP_WORDS.has(term))
    .flatMap((term) => {
      if (term === 'shi') return ['shi', 'shih', 'tzu', 'shihtzu']
      if (term === 'shihtzu') return ['shih', 'tzu', 'shihtzu']
      if (term === 'york') return ['york', 'yorkshire']
      return [term]
    })

  return [...new Set(terms)].slice(0, 12)
}

function buildCatalogSearchText(history = [], message = '') {
  const recentUserText = (history || [])
    .filter((entry) => entry?.role === 'user')
    .slice(-6)
    .map((entry) => cleanText(entry.content))
    .filter(Boolean)
    .join(' ')
  return [recentUserText, message].filter(Boolean).join(' ')
}

function isMissingTenantColumnError(error) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('tenant_id') && (
    message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('column')
  )
}

function isSellableProduct(product) {
  const name = String(product?.name || '').trim()
  return Boolean(product?.active)
    && !isServiceCatalogProduct(product)
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

function requestedWeightKg(terms = []) {
  for (const term of terms || []) {
    const match = String(term).match(/^(\d{1,2})(?:kg)?$/)
    if (match) return Number(match[1])
  }
  return null
}

function productWeightRangeScore(product, weightKg) {
  if (!weightKg) return 0
  const raw = String(product?.name || '').toLowerCase().replace(/,/g, '.')
  const ranges = [...raw.matchAll(/(\d+(?:\.\d+)?)\s*(?:a|-|ate|até)\s*(\d+(?:\.\d+)?)\s*kg/g)]
  if (!ranges.length) return 0
  const matches = ranges.some((range) => {
    const min = Number(range[1])
    const max = Number(range[2])
    return Number.isFinite(min) && Number.isFinite(max) && weightKg >= min && weightKg <= max
  })
  return matches ? 18 : -10
}

function productPackageKgScore(product, packageKg) {
  if (!packageKg) return 0
  const raw = normalizeSearchText(product?.name).replace(/,/g, '.')
  const compact = raw.replace(/\s+/g, '')
  const spaced = new RegExp(`\\b${packageKg}\\s*kg\\b`)
  if (spaced.test(raw) || compact.includes(`${packageKg}kg`)) return 24
  return -14
}

function hasDogBreedProductText(searchable = '') {
  return /shih tzu|shi tzu|shihtzu|yorkshire|lhasa|spitz|poodle|pinscher|bulldog|pug|maltes|maltês/.test(searchable)
}

function rankProduct(product, terms) {
  const searchable = productSearchText(product)
  const name = normalizeSearchText(product?.name)
  const category = normalizeSearchText(product?.category)
  let score = 0
  const weightKg = requestedWeightKg(terms)
  const packageKg = terms.some((term) => /kg$/.test(term)) ? weightKg : null
  const wantsAdult = terms.some((term) => ['adulto', 'adultos', 'adulta', 'adultas'].includes(term))
  const wantsPuppy = terms.some((term) => ['filhote', 'filhotes', 'puppy', 'junior'].includes(term))
  const wantsFlea = terms.some((term) => ['antipulga', 'antipulgas', 'pulga', 'pulgas', 'carrapato', 'carrapatos', 'bravecto', 'nexgard', 'simparic', 'credeli'].includes(term))
  const wantsLitter = terms.some((term) => ['areia', 'higienica', 'higiênica'].includes(term))
  const fleaProduct = /(antipulga|pulga|carrapato|bravecto|nexgard|simparic|credeli|matacura|coleira contra)/.test(searchable)
  const oralFleaProduct = /(bravecto|nexgard|simparic|credeli)/.test(searchable)
  const topicalFleaProduct = /(shampoo|sabonete|spray|talco|coleira|matacura)/.test(searchable)
  const wantsCat = terms.some((term) => ['gato', 'gatos', 'gata', 'gatas', 'cat', 'felino', 'felinos'].includes(term))
  const wantsDog = terms.some((term) => ['cao', 'caes', 'cachorro', 'cachorros', 'cachorra', 'dog', 'canino', 'caninos'].includes(term) || KNOWN_BREED_TERMS.has(term))
  const catProduct = /(gato|gatos|gata|felino|cat|whiskas|kitekat)/.test(searchable)
  const dogProduct = /\b(cao|caes|cachorro|canino|dog|pedigree|bifinho|ossinho)\b/.test(searchable)
    || /special dog/.test(searchable)
    || hasDogBreedProductText(searchable)
  const breedTerms = terms.filter((term) => KNOWN_BREED_TERMS.has(term))
  const categoryTerms = terms.filter((term) => AGE_CATEGORY_TERMS.has(term))
  const sizeTerms = terms.filter((term) => SIZE_CATEGORY_TERMS.has(term))

  for (const term of terms) {
    if (name.includes(term)) score += 8
    if (category.includes(term)) score += 4
    if (searchable.includes(term)) score += 2
  }

  for (const term of breedTerms) {
    if (name.includes(term)) score += 10
    if (!name.includes(term) && !searchable.includes(term)) score -= 2
  }

  for (const term of categoryTerms) {
    if (name.includes(term)) score += 8
    if (!name.includes(term) && !searchable.includes(term)) score -= 2
  }

  for (const term of sizeTerms) {
    if (name.includes(term)) score += 7
    if (!name.includes(term) && !searchable.includes(term)) score -= 1
  }

  if (wantsAdult && /adult/.test(name)) score += 8
  if (wantsAdult && /(filhote|puppy|junior)/.test(name)) score -= 12
  if (wantsPuppy && /(filhote|puppy|junior)/.test(name)) score += 8
  if (wantsPuppy && /adult/.test(name)) score -= 12
  if (wantsFlea && fleaProduct) score += 18
  if (wantsFlea && !fleaProduct) score -= 18
  if (wantsFlea && oralFleaProduct) score += 20
  if (wantsFlea && topicalFleaProduct && terms.some((term) => /\d/.test(term) || ['pequeno', 'medio', 'grande'].includes(term))) score -= 12
  if (wantsFlea && weightKg) score += productWeightRangeScore(product, weightKg)
  if (wantsLitter && /(areia|higienica|pa higienica)/.test(searchable)) score += 14
  if (wantsLitter && !/(areia|higienica|pa higienica)/.test(searchable)) score -= 25
  if (wantsCat && catProduct) score += 18
  if (wantsCat && dogProduct) score -= 35
  if (wantsDog && dogProduct) score += 12
  if (wantsDog && catProduct) score -= 35
  if (category.includes('racao') && packageKg) score += productPackageKgScore(product, packageKg)
  if (!breedTerms.length && hasDogBreedProductText(searchable)) score -= 10
  if (category.includes('racao')) score += 2
  score += Math.min(Number(product?.stock_quantity || 0), 20) / 20
  return score
}

function selectRelevantProducts(products, message, state = {}) {
  const available = (products || []).filter(isSellableProduct)
  const searchTerms = buildSearchTerms(message)
  const intent = detectIntent(message)

  if (!available.length) return []

  const catalogRequest = detectCatalogRequest(message, state)
  const catalogMatched = rankCatalogProducts(available, state, message)
    .filter((item) => item.score > 0)
    .map((item) => item.product)
  if (catalogMatched.length) return catalogMatched.slice(0, PRODUCT_CONTEXT_LIMIT)
  if (catalogRequest.type) return []

  const matched = searchTerms.length
    ? available
      .map((product) => ({ product, score: rankProduct(product, searchTerms) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.product)
    : []

  if (matched.length) return matched.slice(0, PRODUCT_CONTEXT_LIMIT)

  if (intent !== 'produto') return []

  return available
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

function expandDbSearchTerms(terms = []) {
  const extras = {
    racao: ['racao', 'ração'],
    caes: ['caes', 'cães'],
    cao: ['cao', 'cão'],
    sache: ['sache', 'sachê'],
    higienica: ['higienica', 'higiênica'],
    antipulga: ['antipulga', 'antipulgas', 'pulga', 'carrapato', 'bravecto', 'nexgard', 'simparic', 'credeli'],
    antipulgas: ['antipulga', 'antipulgas', 'pulga', 'carrapato', 'bravecto', 'nexgard', 'simparic', 'credeli'],
    pulga: ['pulga', 'pulgas', 'carrapato', 'bravecto', 'nexgard', 'simparic', 'credeli'],
    pulgas: ['pulga', 'pulgas', 'carrapato', 'bravecto', 'nexgard', 'simparic', 'credeli'],
    carrapato: ['carrapato', 'carrapatos', 'bravecto', 'nexgard', 'simparic', 'credeli'],
  }
  return [...new Set((terms || []).flatMap((term) => {
    const kg = String(term).match(/^(\d{1,2})kg$/)
    if (kg) return [term, `${kg[1]} kg`]
    return extras[term] || [term]
  }))].slice(0, 12)
}

function mergeProductsById(...lists) {
  const map = new Map()
  for (const list of lists) {
    for (const product of list || []) {
      if (product?.id && !map.has(String(product.id))) map.set(String(product.id), product)
    }
  }
  return [...map.values()]
}

async function searchProductsByTerms(supabase, moduleId, tenantId, terms, selectColumns) {
  const dbTerms = expandDbSearchTerms(terms)
  if (!dbTerms.length) return []

  const orFilter = dbTerms
    .flatMap((term) => ['name', 'category', 'description', 'barcode'].map((column) => `${column}.ilike.%${term}%`))
    .join(',')

  let query = supabase
    .from('products')
    .select(selectColumns)
    .eq('module_id', moduleId)
    .eq('active', true)
    .gt('stock_quantity', 0)
    .or(orFilter)
    .limit(120)

  if (tenantId) query = query.eq('tenant_id', tenantId)

  const { data, error } = await query
  if (error) {
    if (tenantId && isMissingTenantColumnError(error)) {
      throw new HttpError(500, 'Tenant isolation is not enabled in products table.')
    }
    throw new HttpError(500, 'Unable to search product context.')
  }
  return data || []
}

async function loadUpsellProducts(supabase, moduleId, tenantId, selectColumns) {
  let query = supabase
    .from('products')
    .select(selectColumns)
    .eq('module_id', moduleId)
    .eq('active', true)
    .gt('stock_quantity', 0)
    .or([
      'name.ilike.%petisco%',
      'name.ilike.%bifinho%',
      'name.ilike.%dental%',
      'name.ilike.%ossinho%',
      'name.ilike.%sache%',
      'name.ilike.%sachê%',
      'name.ilike.%areia%',
      'name.ilike.%shampoo%',
      'category.ilike.%petisco%',
      'category.ilike.%sache%',
      'category.ilike.%sachê%',
      'category.ilike.%higien%',
    ].join(','))
    .limit(40)

  if (tenantId) query = query.eq('tenant_id', tenantId)

  const { data, error } = await query
  if (error) return []
  return data || []
}

function buildCustomerContext(customer) {
  if (!customer?.client) {
    return [
      'Cliente nao encontrado no cadastro pelo telefone.',
      `Telefone: ${customer?.phone || 'Nao informado'}`,
      'Nome confirmado: nao. Pergunte o nome antes de vender.',
    ].join('\n')
  }

  const details = customer.client.details || {}
  const nameConfirmed = !isPlaceholderName(customer.client.name) && details.name_confirmed !== false
  return [
    `Cliente cadastrado pelo telefone: sim`,
    `Nome do tutor: ${nameConfirmed ? customer.client.name : 'desconhecido'}`,
    ...(nameConfirmed ? [] : ['Nunca use "desconhecido", "não confirmado" ou o telefone como nome do cliente.']),
    `Telefone: ${customer.client.phone || customer.phone || 'Nao informado'}`,
    `Pet: ${details.pet_name || 'Nao informado'}`,
    `Especie: ${details.species || 'Nao informado'}`,
    `Porte: ${details.size || 'Nao informado'}`,
    `Peso: ${details.weight_kg ? `${details.weight_kg} kg` : 'Nao informado'}`,
    `Tipo de pelo: ${details.coat_type || 'Nao informado'}`,
    `Raca: ${details.breed || 'Nao informado'}`,
    `Endereco cadastrado: ${[customer.client.address, customer.client.neighborhood, customer.client.city].filter(Boolean).join(' - ') || 'Nao informado'}`,
    `Nome confirmado: ${nameConfirmed ? 'sim' : 'nao'}`,
  ].join('\n')
}

async function loadStoreSettings(supabase, moduleId, tenantId) {
  return cachedLoad(storeSettingsCache, scopeCacheKey(moduleId, tenantId), SETTINGS_CACHE_MS, async () => {
    let query = supabase
      .from('settings')
      .select('store_name,store_phone,store_address,store_neighborhood,store_city,bot_prompt,delivery_fee,pet_transport_fee,pix_key,pix_holder_name,message_templates,pet_transport_options,petbot_autonomy_mode,petbot_autonomy_allowlist,petbot_timezone,store_business_hours,petbot_business_hours,petbot_slot_interval_min,petbot_booking_lead_time_min,petbot_booking_capacity')
      .eq('module_id', moduleId)

    if (tenantId) {
      query = query.eq('tenant_id', tenantId)
    }

    let result = await query.maybeSingle()
    if (result.error && /(pet_transport_fee|pix_key|pix_holder_name|message_templates|pet_transport_options|petbot_autonomy_mode|petbot_autonomy_allowlist|petbot_timezone|store_business_hours|petbot_business_hours|petbot_slot_interval_min|petbot_booking_lead_time_min|petbot_booking_capacity)/i.test(String(result.error.message || ''))) {
      let fallbackQuery = supabase
        .from('settings')
        .select('store_name,store_phone,store_address,store_neighborhood,store_city,bot_prompt,delivery_fee')
        .eq('module_id', moduleId)
      if (tenantId) fallbackQuery = fallbackQuery.eq('tenant_id', tenantId)
      result = await fallbackQuery.maybeSingle()
    }
    const { data, error } = result
    if (error) {
      if (tenantId && isMissingTenantColumnError(error)) {
        throw new HttpError(500, 'Tenant isolation is not enabled in settings table.')
      }
      throw new HttpError(500, 'Unable to load store configuration.')
    }

    return {
      storeName: data?.store_name || 'YuiSync',
      storePhone: data?.store_phone || '',
      storeAddress: data?.store_address || '',
      storeNeighborhood: data?.store_neighborhood || '',
      storeCity: data?.store_city || '',
      botPrompt: data?.bot_prompt || '',
      deliveryFee: Number(data?.delivery_fee ?? DEFAULT_DELIVERY_FEE),
      petTransportFee: Number(data?.pet_transport_fee ?? 20),
      pixKey: data?.pix_key || '',
      pixHolderName: data?.pix_holder_name || '',
      messageTemplates: data?.message_templates || {},
      petTransportOptions: Array.isArray(data?.pet_transport_options) ? data.pet_transport_options : [],
      // Until the canary migration is applied, preserve the currently deployed
      // behavior instead of unexpectedly routing every conversation to a human.
      autonomyMode: data?.petbot_autonomy_mode || 'canary',
      autonomyAllowlist: Array.isArray(data?.petbot_autonomy_allowlist) ? data.petbot_autonomy_allowlist : [],
      petbotTimezone: data?.petbot_timezone || 'America/Sao_Paulo',
      storeBusinessHours: data?.store_business_hours && typeof data.store_business_hours === 'object'
        ? data.store_business_hours
        : null,
      petbotBusinessHours: data?.petbot_business_hours && typeof data.petbot_business_hours === 'object'
        ? data.petbot_business_hours
        : null,
      petbotSlotIntervalMin: Number(data?.petbot_slot_interval_min || 30),
      petbotBookingLeadTimeMin: Number(data?.petbot_booking_lead_time_min || 15),
      petbotBookingCapacity: Number(data?.petbot_booking_capacity || 1),
    }
  })
}

function canPetbotCreateOrders(settings = {}, session = {}) {
  const mode = cleanText(settings.autonomyMode).toLowerCase() || 'canary'
  if (mode === 'enabled') return true
  if (mode !== 'canary') return false

  const phone = cleanText(session.customer_phone).replace(/\D/g, '')
  const allowlist = Array.isArray(settings.autonomyAllowlist) ? settings.autonomyAllowlist : []
  return Boolean(phone) && allowlist
    .map((entry) => cleanText(entry).replace(/\D/g, ''))
    .includes(phone)
}

function isCatalogColumnCompatibilityError(error) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('schema cache')
    || message.includes('column')
    || message.includes('does not exist')
    || message.includes('could not find')
}

async function loadPetshopServices(supabase, moduleId, tenantId) {
  const runDedicatedQuery = async (includeSourceProductId) => {
    const columns = includeSourceProductId
      ? 'id,code,name,group_type,default_price,default_duration_min,active,sort_order,source_product_id'
      : 'id,code,name,group_type,default_price,default_duration_min,active,sort_order'
    let query = supabase
      .from('petshop_services')
      .select(columns)
      .eq('module_id', moduleId)
      .eq('active', true)
      .order('sort_order')
      .order('name')

    if (tenantId) query = query.eq('tenant_id', tenantId)
    return query
  }

  let dedicatedResult = await runDedicatedQuery(true)
  if (dedicatedResult.error && isCatalogColumnCompatibilityError(dedicatedResult.error)) {
    dedicatedResult = await runDedicatedQuery(false)
  }

  let { data: dedicatedServices, error: dedicatedError } = dedicatedResult
  if (dedicatedError) {
    if (tenantId && isMissingTenantColumnError(dedicatedError)) {
      logger.warn('PetBot auxiliary service catalog has no tenant column; using tenant-scoped products instead', {
        moduleId,
        tenantId,
        message: dedicatedError.message,
      })
      dedicatedServices = []
      dedicatedError = null
    } else {
      logger.warn('PetBot dedicated service catalog unavailable; continuing with products', {
        moduleId,
        tenantId,
        message: dedicatedError.message,
      })
      dedicatedServices = []
    }
  }

  const runProductQuery = async (columns) => {
    let query = supabase
      .from('products')
      .select(columns)
      .eq('module_id', moduleId)
      .eq('active', true)
      .limit(MAX_CACHED_PRODUCTS)
    if (tenantId) query = query.eq('tenant_id', tenantId)
    return query
  }

  const productColumnSets = [
    'id,name,category,description,species_target,price,active,bot_metadata,updated_at',
    'id,name,category,description,species_target,price,active,bot_metadata',
    'id,name,category,description,price,active,bot_metadata',
    'id,name,category,price,active,bot_metadata',
    'id,name,category,description,species_target,price,active',
    'id,name,category,description,price,active',
    'id,name,category,price,active',
  ]
  let productResult = null
  for (const columns of productColumnSets) {
    productResult = await runProductQuery(columns)
    if (!productResult.error) break
    if (!isCatalogColumnCompatibilityError(productResult.error)) break
  }

  const { data: productRows, error: productError } = productResult || { data: [], error: null }
  if (productError) {
    if (tenantId && isMissingTenantColumnError(productError)) {
      throw new HttpError(500, 'Tenant isolation is not enabled in products table.')
    }
    if (!(dedicatedServices || []).length) {
      throw new HttpError(500, `Unable to load the service catalog from products: ${productError.message || 'unknown error'}`)
    }
    logger.warn('PetBot product service catalog unavailable; using dedicated services', {
      moduleId,
      tenantId,
      message: productError.message,
    })
  }

  return mergePetshopServiceCatalogs(
    (dedicatedServices || []).filter((service) => service.active !== false),
    productRows || [],
  )
}

async function loadProductsByIds(supabase, moduleId, tenantId, productIds = []) {
  const ids = [...new Set((productIds || []).map(cleanText).filter(isUuid))]
  if (!ids.length) return []

  let query = supabase
    .from('products')
    .select('id, name, category, description, species_target, barcode, image_url, price, stock_quantity, active, bot_metadata')
    .eq('module_id', moduleId)
    .in('id', ids)

  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { data, error } = await query
  if (error) throw new HttpError(500, 'Unable to refresh product stock.')
  return data || []
}

async function loadProducts(supabase, moduleId, tenantId, message, state = {}) {
  const selectColumns = 'id, name, category, description, species_target, barcode, image_url, price, stock_quantity, active, bot_metadata'
  const loadCatalog = () => cachedLoad(productCatalogCache, scopeCacheKey(moduleId, tenantId), PRODUCT_CATALOG_CACHE_MS, async () => {
    let query = supabase
      .from('products')
      .select(selectColumns)
      .eq('module_id', moduleId)
      .eq('active', true)
      .gt('stock_quantity', 0)
      .limit(MAX_CACHED_PRODUCTS)

    if (tenantId) {
      query = query.eq('tenant_id', tenantId)
    }

    const { data, error } = await query
    if (error) {
      if (tenantId && isMissingTenantColumnError(error)) {
        throw new HttpError(500, 'Tenant isolation is not enabled in products table.')
      }
      throw new HttpError(500, 'Unable to load product context.')
    }

    return data || []
  })

  const terms = buildSearchTerms(message)
  if (terms.length > 0) {
    const [searchedProducts, upsellProducts] = await Promise.all([
      searchProductsByTerms(supabase, moduleId, tenantId, terms, selectColumns),
      loadUpsellProducts(supabase, moduleId, tenantId, selectColumns),
    ])
    const selected = selectRelevantProducts(searchedProducts, message, state)
    const request = detectCatalogRequest(message, state)
    if (selected.length > 0 && !['racao', 'granel'].includes(request.type)) {
      return mergeProductsById(selected.slice(0, PRODUCT_CONTEXT_LIMIT), upsellProducts)
    }
    const catalog = await loadCatalog()
    const fallbackSelected = selectRelevantProducts(catalog || [], message, state)
    const combined = rankCatalogProducts(
      mergeProductsById(selected, fallbackSelected),
      state,
      message,
    ).map((item) => item.product).slice(0, PRODUCT_CONTEXT_LIMIT)
    if (combined.length > 0) return mergeProductsById(combined, upsellProducts)
    return []
  }

  const catalog = await loadCatalog()

  const selected = selectRelevantProducts(catalog || [], message, state)
  if (selected.length > 0) return selected.slice(0, PRODUCT_CONTEXT_LIMIT)
  return (catalog || []).slice(0, PRODUCT_CONTEXT_LIMIT)
}

async function queryAppointments(supabase, moduleId, tenantId, settings = {}) {
  const schedule = normalizePetbotSchedulingSettings(settings)
  const localNow = DateTime.now().setZone(schedule.timezone)
  const today = localNow.toISODate()
  const end = localNow.plus({ days: 14 }).toISODate()
  const rangeStart = localNow.startOf('day').toUTC().toISO()
  const rangeEnd = localNow.plus({ days: 14 }).endOf('day').toUTC().toISO()
  const selectColumns = 'id, service_type, scheduled_at, service_date, start_time, status, price, duration_min, employee_id, groomer_id'
  let query = supabase
    .from('appointments')
    .select(selectColumns)
    .eq('module_id', moduleId)
    .gte('scheduled_at', rangeStart)
    .lte('scheduled_at', rangeEnd)
    .order('scheduled_at')
    .limit(1000)

  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { data, error } = await query
  if (error) {
    if (tenantId && isMissingTenantColumnError(error)) {
      throw new HttpError(500, 'Tenant isolation is not enabled in appointments table.')
    }
    throw new HttpError(500, 'Unable to load appointment context.')
  }

  let byServiceDate = []
  let serviceDateQuery = supabase
    .from('appointments')
    .select(selectColumns)
    .eq('module_id', moduleId)
    .gte('service_date', today)
    .lte('service_date', end)
    .order('service_date')
    .order('start_time')
    .limit(100)

  if (tenantId) serviceDateQuery = serviceDateQuery.eq('tenant_id', tenantId)
  const serviceDateResult = await serviceDateQuery
  if (!serviceDateResult.error) byServiceDate = serviceDateResult.data || []

  return normalizeAppointmentRows([...(data || []), ...byServiceDate])
}

async function loadAppointments(supabase, moduleId, tenantId, settings = {}) {
  return cachedLoad(
    appointmentsCache,
    scopeCacheKey(moduleId, tenantId),
    APPOINTMENTS_CACHE_MS,
    () => queryAppointments(supabase, moduleId, tenantId, settings),
  )
}

async function loadAppointmentsFresh(supabase, moduleId, tenantId, settings = {}) {
  const rows = await queryAppointments(supabase, moduleId, tenantId, settings)
  appointmentsCache.set(scopeCacheKey(moduleId, tenantId), { loadedAt: Date.now(), value: rows })
  return rows
}

async function loadRecentMessages(supabase, sessionId) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, metadata, tokens_used, sent_at')
    .eq('session_id', sessionId)
    .order('sent_at', { ascending: false })
    .limit(RECENT_HISTORY_LIMIT)

  if (error) {
    throw new HttpError(500, 'Unable to load conversation history.')
  }

  return (data || []).reverse().map((message) => ({
    ...message,
    role: message.role === 'human_agent' ? 'assistant' : message.role,
    content: message.content,
    metadata: message.metadata || {},
  }))
}

async function findClientByPhone(supabase, moduleId, tenantId, phone) {
  const digits = normalizePhone(phone)
  if (!digits) return null

  const candidates = [...new Set([digits, cleanText(phone), `+${digits}`].filter(Boolean))]
  const { data, error } = await supabase
    .from('clients')
    .select(CLIENT_PROFILE_SELECT)
    .eq('module_id', moduleId)
    .eq('tenant_id', tenantId)
    .in('phone', candidates)
    .limit(5)

  if (error) {
    if (isMissingTenantColumnError(error)) {
      throw new HttpError(500, 'Tenant isolation is not enabled in clients table.')
    }
    throw new HttpError(500, 'Unable to load customer profile.')
  }

  return (data || []).find((client) => normalizePhone(client.phone) === digits) || null
}

async function loadCustomerPets(supabase, session) {
  const phone = normalizePhone(session.customer_phone)
  if (!phone) return []

  try {
    const { data, error } = await supabase
      .from('pets')
      .select('id,pet_name,species,breed,weight_kg,notes,updated_at')
      .eq('tenant_id', session.tenant_id)
      .eq('module_id', session.module_id)
      .in('phone', [...new Set([phone, cleanText(session.customer_phone), `+${phone}`].filter(Boolean))])
      .order('updated_at', { ascending: false })
      .limit(20)

    if (error) {
      logger.warn('PetBot saved pets load failed', {
        sessionId: session.id,
        error: error.message,
      })
      return []
    }

    return (data || []).map((pet) => ({
      id: cleanText(pet.id),
      name: cleanText(pet.pet_name),
      species: cleanText(pet.species),
      breed: cleanText(pet.breed),
      weight_kg: Number(pet.weight_kg || 0) || null,
      notes: cleanText(pet.notes) || null,
    })).filter((pet) => pet.name)
  } catch (error) {
    logger.warn('PetBot saved pets load failed', {
      sessionId: session.id,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

async function loadCustomerSubscriptionBenefits(supabase, session, clientId) {
  const resolvedClientId = cleanText(clientId)
  if (!resolvedClientId) return []

  try {
    const { data, error } = await supabase
      .from('client_subscriptions')
      .select('id,services_used,started_at,subscription_plans(name,services)')
      .eq('tenant_id', session.tenant_id)
      .eq('module_id', session.module_id)
      .eq('client_id', resolvedClientId)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(10)

    if (error) {
      logger.warn('PetBot subscription benefits load failed', {
        sessionId: session.id,
        error: error.message,
      })
      return []
    }

    const benefits = []
    for (const subscription of data || []) {
      const plan = Array.isArray(subscription.subscription_plans)
        ? subscription.subscription_plans[0]
        : subscription.subscription_plans
      const services = Array.isArray(plan?.services) ? plan.services : []
      const usage = subscription.services_used && typeof subscription.services_used === 'object'
        ? subscription.services_used
        : {}
      for (const service of services) {
        const serviceType = cleanText(service?.service_type).toLowerCase()
        const total = Math.max(0, Number(service?.qty_per_cycle || 0))
        const used = Math.max(0, Number(usage?.[serviceType] || 0))
        const remaining = Math.max(0, total - used)
        if (!serviceType || remaining <= 0) continue
        benefits.push({
          subscription_id: cleanText(subscription.id),
          plan_name: cleanText(plan?.name) || null,
          service_type: serviceType,
          remaining,
          total,
          used,
        })
      }
    }

    const byServiceType = new Map()
    for (const benefit of benefits) {
      if (!byServiceType.has(benefit.service_type)) byServiceType.set(benefit.service_type, benefit)
    }
    return [...byServiceType.values()]
  } catch (error) {
    logger.warn('PetBot subscription benefits load failed', {
      sessionId: session.id,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

async function ensureCustomerProfile(supabase, session, patch = {}) {
  const moduleId = String(session.module_id || '').trim().toLowerCase()
  const tenantId = session.tenant_id
  const phone = normalizePhone(session.customer_phone)
  let client = session.client_id ? null : await findClientByPhone(supabase, moduleId, tenantId, phone)

  if (session.client_id) {
    const { data, error } = await supabase
      .from('clients')
      .select(CLIENT_PROFILE_SELECT)
      .eq('id', session.client_id)
      .maybeSingle()
    if (error) throw new HttpError(500, 'Unable to load linked customer profile.')
    client = data || null
  }

  const customerName = normalizeCustomerDisplayName(patch.customer_name)
    || normalizeCustomerDisplayName(client?.name)
    || normalizeCustomerDisplayName(session.customer_name)
  const hasConfirmedName = Boolean(normalizeCustomerDisplayName(patch.customer_name))
    || Boolean(client && normalizeCustomerDisplayName(client.name) && client.details?.name_confirmed !== false)
  const nextDetails = {
    ...(client?.details || {}),
    ...(cleanText(patch.pet_name) ? { pet_name: cleanText(patch.pet_name) } : {}),
    ...(cleanText(patch.species) ? { species: normalizeSpecies(patch.species) } : {}),
    ...(cleanText(patch.size) ? { size: cleanText(patch.size) } : {}),
    ...(cleanText(patch.breed) ? { breed: cleanText(patch.breed) } : {}),
    ...(Number(patch.weight_kg) > 0 ? { weight_kg: Number(patch.weight_kg) } : {}),
    ...(cleanText(patch.coat_type) ? { coat_type: cleanText(patch.coat_type) } : {}),
    ...(cleanText(patch.symptom) ? { last_symptom: cleanText(patch.symptom) } : {}),
    ...(cleanText(patch.address_reference) ? { address_reference: cleanText(patch.address_reference) } : {}),
    name_confirmed: hasConfirmedName,
  }

  const payload = {
    module_id: moduleId,
    tenant_id: tenantId,
    type: 'pet',
    name: customerName || `Cliente ${phone || 'WhatsApp'}`,
    phone: phone || session.customer_phone || null,
    address: cleanText(patch.address) || client?.address || null,
    neighborhood: cleanText(patch.neighborhood) || client?.neighborhood || null,
    city: cleanText(patch.city) || client?.city || null,
    active: true,
    details: nextDetails,
  }

  if (!client) {
    const { data, error } = await supabase
      .from('clients')
      .insert(payload)
      .select(CLIENT_PROFILE_SELECT)
      .single()

    if (error) throw new HttpError(500, 'Unable to create customer profile.')
    client = data
  } else if (Object.keys(patch || {}).length > 0 || session.client_id !== client.id) {
    const { data, error } = await supabase
      .from('clients')
      .update(payload)
      .eq('id', client.id)
      .select(CLIENT_PROFILE_SELECT)
      .single()

    if (error) throw new HttpError(500, 'Unable to update customer profile.')
    client = data
  }

  const sessionPatch = {
    client_id: client.id,
    customer_phone: phone || session.customer_phone,
    ...(hasConfirmedName && client.name ? { customer_name: client.name } : {}),
  }

  await supabase
    .from('chat_sessions')
    .update(sessionPatch)
    .eq('id', session.id)

  return {
    client,
    phone: phone || session.customer_phone,
    isKnown: hasConfirmedName,
  }
}

function buildPetbotOrderTransactionPayload(session, customer, settings, args = {}) {
  const orderType = cleanText(args.order_type) || 'produto'
  const transport = resolvePetTransportSelection({ args, settings, orderType })
  if (!transport.ok) throw new Error('Opcao de transporte do pet invalida ou desatualizada.')

  return {
    session_id: session.id,
    tenant_id: session.tenant_id,
    module_id: session.module_id,
    idempotency_key: cleanText(args.idempotency_key),
    timezone: cleanText(settings.petbotTimezone) || 'America/Sao_Paulo',
    booking_capacity: Math.max(1, Number(settings.petbotBookingCapacity || 1) || 1),
    client_id: customer.client?.id || null,
    customer_name: cleanText(args.customer_name) || cleanText(customer.client?.name) || session.customer_name || 'Cliente',
    customer_phone: customer.phone || session.customer_phone || null,
    pet_name: cleanText(args.pet_name),
    species: cleanText(args.species),
    size: cleanText(args.size),
    breed: cleanText(args.breed),
    weight_kg: Number(args.weight_kg || 0),
    weight_label: cleanText(args.weight_label),
    coat_type: cleanText(args.coat_type),
    symptom: cleanText(args.symptom),
    order_type: orderType,
    payment_method: cleanText(args.payment_method),
    fulfillment_type: cleanText(args.fulfillment_type),
    delivery_address: cleanText(args.delivery_address),
    delivery_neighborhood: cleanText(args.delivery_neighborhood),
    delivery_city: cleanText(args.delivery_city),
    delivery_reference: cleanText(args.delivery_reference),
    delivery_fee: Number(settings.deliveryFee ?? DEFAULT_DELIVERY_FEE),
    service_transport_fee: Number(transport.fee || 0),
    service_transport_mode: cleanText(transport.mode),
    service_transport_label: cleanText(transport.label),
    service_transport_address: cleanText(args.service_transport_address),
    service_transport_neighborhood: cleanText(args.service_transport_neighborhood),
    service_transport_city: cleanText(args.service_transport_city),
    service_transport_reference: cleanText(args.service_transport_reference),
    service_grooming_detail: cleanText(args.service_grooming_detail),
    expected_total: Number(args.total || 0),
    appointment_id: cleanText(args.appointment_id),
    scheduled_at: cleanText(args.scheduled_at),
    service_product_id: cleanText(args.service_product_id),
    service_type: cleanText(args.service_type),
    service_label: cleanText(args.service_label),
    service_kind: cleanText(args.service_kind),
    duration_min: Number(args.duration_min || 60),
    change_for: Number(args.change_for || 0),
    notes: cleanText(args.notes),
    items: Array.isArray(args.items) ? args.items : [],
    additional_services: Array.isArray(args.additional_services) ? args.additional_services : [],
  }
}

function isMissingPetbotTransactionRpcError(error) {
  const code = cleanText(error?.code).toUpperCase()
  const message = cleanText(error?.message).toLowerCase()
  return code === 'PGRST202'
    || code === '42883'
    || (message.includes('create_petbot_order_transaction') && (
      message.includes('schema cache')
      || message.includes('could not find')
      || message.includes('does not exist')
      || message.includes('not found')
    ))
}

async function createConfirmedPetshopOrderViaRpc(supabase, session, settings, args = {}) {
  const customer = await ensureCustomerProfile(supabase, session, args)
  const payload = buildPetbotOrderTransactionPayload(session, customer, settings, args)
  if (!payload.idempotency_key) throw new Error('Chave idempotente do pedido ausente.')
  if (!payload.items.length) throw new Error('Pedido sem itens para registrar.')
  if (payload.order_type === 'produto') {
    const validProductPayment = payload.fulfillment_type === 'retirada'
      ? payload.payment_method === 'a_combinar'
      : ['pix', 'dinheiro', 'cartao'].includes(payload.payment_method)
    if (!validProductPayment) {
      throw new Error('Forma de pagamento ausente ou invalida para a modalidade escolhida.')
    }
  }

  const { data, error } = await supabase.rpc('create_petbot_order_transaction', {
    p_payload: payload,
  })

  if (error) {
    if (isMissingPetbotTransactionRpcError(error)) {
      throw new Error('A migracao transacional do PetBot nao foi aplicada no banco de producao.')
    }
    throw new Error(`Falha ao registrar pedido transacional: ${error.message}`)
  }

  return {
    sale_id: cleanText(data?.sale_id),
    order_id: cleanText(data?.order_id) || null,
    appointment_id: cleanText(data?.appointment_id) || null,
    total: Number(data?.total || payload.expected_total || 0),
    payment_status: args.order_type === 'produto'
      ? cleanText(data?.payment_status)
      : 'a_receber',
    subscription_benefit_used: Boolean(data?.subscription_benefit_used),
    subscription_plan_name: cleanText(data?.subscription_plan_name) || null,
    duplicated: Boolean(data?.duplicated),
  }
}

async function saveSatisfactionRating(supabase, sessionId, rating) {
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

  if (error) {
    throw new HttpError(500, 'Unable to save satisfaction rating.')
  }
}

async function loadBotRuntimeConfig(supabase, tenantId, moduleId) {
  try {
    const { data: company, error: companyErr } = await supabase
      .from('companies')
      .select('id, model_name, temperature, system_prompt')
      .eq('module_id', moduleId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (companyErr || !company) return { modelName: DEFAULT_BOT_MODEL, temperature: DEFAULT_BOT_TEMPERATURE, systemPrompt: '' }

    return {
      modelName: company.model_name || DEFAULT_BOT_MODEL,
      temperature: Number(company.temperature ?? DEFAULT_BOT_TEMPERATURE),
      systemPrompt: cleanText(company.system_prompt),
    }
  } catch (err) {
    logger.warn('Bot runtime config load failed', { tenantId, moduleId, error: err.message })
    return { modelName: DEFAULT_BOT_MODEL, temperature: DEFAULT_BOT_TEMPERATURE, systemPrompt: '' }
  }
}

async function callOpenAIWithTimeout(params, timeoutMs) {
  const maxRetries = Math.max(0, Number(serverEnv.openAiMaxRetries || 0))
  let lastError = null

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
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
      if (response.ok) return payload

      const detail = payload?.error?.message || `HTTP ${response.status}`
      const requestId = response.headers.get('x-request-id') || response.headers.get('openai-request-id') || null
      const retryable = [408, 409, 429].includes(response.status) || response.status >= 500
      const error = new HttpError(502, `OpenAI request failed: ${detail}`)
      error.openai = {
        status: response.status,
        request_id: requestId,
        type: payload?.error?.type || null,
        code: payload?.error?.code || null,
        param: payload?.error?.param || null,
      }
      logger.warn('OpenAI chat completion failed', {
        status: response.status,
        request_id: requestId,
        type: payload?.error?.type || null,
        code: payload?.error?.code || null,
        param: payload?.error?.param || null,
        message: detail,
      })
      if (!retryable || attempt >= maxRetries) throw error
      lastError = error
    } catch (error) {
      const timedOut = error?.name === 'AbortError'
      const normalizedError = timedOut
        ? new HttpError(504, 'AI response timed out. Please try again.')
        : error
      if ((!timedOut && error instanceof HttpError) || attempt >= maxRetries) throw normalizedError
      lastError = normalizedError
    } finally {
      clearTimeout(timer)
    }

    await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)))
  }

  throw lastError || new HttpError(502, 'OpenAI request failed.')
}

function normalizeDashboardUserMessages(message, options = {}) {
  const batch = Array.isArray(options.userMessages) ? options.userMessages : []
  const source = options.source || 'dashboard_simulation'
  const sharedMetadata = options.userMetadata || {}
  const now = new Date().toISOString()

  const normalized = batch
    .map((entry) => {
      const content = cleanText(entry?.content)
      if (!content) return null

      const parsedSentAt = cleanText(entry?.sent_at)
      const sentAtDate = parsedSentAt ? new Date(parsedSentAt) : null
      const sentAt = sentAtDate && !Number.isNaN(sentAtDate.getTime())
        ? sentAtDate.toISOString()
        : now
      const clientMessageId = cleanText(entry?.client_message_id || entry?.id)

      return {
        id: isUuid(clientMessageId) ? clientMessageId : null,
        content,
        sent_at: sentAt,
        metadata: {
          source,
          ...(clientMessageId ? { client_message_id: clientMessageId } : {}),
          ...sharedMetadata,
        },
      }
    })
    .filter(Boolean)
    .slice(0, 10)

  if (normalized.length) return normalized

  return [{
    content: message,
    sent_at: now,
    metadata: {
      source,
      ...sharedMetadata,
    },
  }]
}

async function insertUserMessages(supabase, sessionId, userMessages) {
  const identifiedMessages = userMessages.filter((userMessage) => isUuid(userMessage.id))
  const anonymousMessages = userMessages.filter((userMessage) => !isUuid(userMessage.id))
  const toRow = (userMessage) => ({
    ...(isUuid(userMessage.id) ? { id: userMessage.id } : {}),
    session_id: sessionId,
    role: 'user',
    content: userMessage.content,
    metadata: userMessage.metadata,
    sent_at: userMessage.sent_at,
  })

  if (identifiedMessages.length) {
    const { error } = await supabase.from('chat_messages').upsert(
      identifiedMessages.map(toRow),
      { onConflict: 'id', ignoreDuplicates: true },
    )
    if (error) throw new HttpError(500, 'Unable to save identified user message.')
  }

  if (anonymousMessages.length) {
    const { error } = await supabase.from('chat_messages').insert(
      anonymousMessages.map(toRow),
    )
    if (error) throw new HttpError(500, 'Unable to save user message.')
  }
}

function buildVerifiedStoreInformation(settings = {}) {
  const weekdayLabels = {
    1: 'segunda-feira',
    2: 'terça-feira',
    3: 'quarta-feira',
    4: 'quinta-feira',
    5: 'sexta-feira',
    6: 'sábado',
    7: 'domingo',
  }
  const businessHours = Object.fromEntries(
    Object.entries(settings.storeBusinessHours || settings.petbotBusinessHours || {}).map(([weekday, periods]) => [
      weekdayLabels[weekday] || weekday,
      (Array.isArray(periods) ? periods : [])
        .map((period) => `${cleanText(period?.open)}-${cleanText(period?.close)}`)
        .filter((period) => period !== '-'),
    ]),
  )
  const approvedMessages = Object.fromEntries(
    Object.entries(settings.messageTemplates || {})
      .filter(([, value]) => typeof value === 'string' && cleanText(value))
      .sort(([left], [right]) => {
        const priority = ['unknown_information', 'unknown_question', 'human_assistance_offer']
        return Number(priority.includes(right)) - Number(priority.includes(left))
      })
      .slice(0, 12)
      .map(([key, value]) => [key, cleanText(value).slice(0, 1600)]),
  )

  const serviceKnowledgeKeys = [
    'veterinary_consultation',
    'monthly_plan',
    'small_bath_service',
    'small_machine_grooming',
    'small_scissor_grooming',
    'medium_double_coat_bath',
    'medium_coat_bath',
    'medium_full_grooming',
    'dental_brushing',
  ]
  const serviceKnowledge = Object.fromEntries(
    serviceKnowledgeKeys
      .map((key) => [key, cleanText(settings.messageTemplates?.[key])])
      .filter(([, value]) => value)
      .map(([key, value]) => [key, value.slice(0, 2200)]),
  )

  return {
    address: [settings.storeAddress, settings.storeNeighborhood, settings.storeCity].filter(Boolean).join(' - ') || null,
    phone: cleanText(settings.storePhone) || null,
    business_hours: businessHours,
    product_payment_methods: ['Pix', 'dinheiro', 'cartão'],
    service_payment_policy: 'Pagamento após a conclusão do serviço.',
    approved_messages: approvedMessages,
    service_knowledge: serviceKnowledge,
  }
}

async function recordPetbotEvent(supabase, payload) {
  try {
    const { error } = await supabase.from('petbot_events').insert(payload)
    if (error) {
      logger.warn('Unable to persist PetBot audit event', { code: error.code, message: error.message })
    }
  } catch (error) {
    // The table is introduced by a migration. A missing audit table must never
    // prevent an active WhatsApp conversation from receiving its reply.
    logger.warn('PetBot audit event unavailable', { message: error instanceof Error ? error.message : String(error) })
  }
}

function parseAgentToolArguments(toolCall) {
  try {
    const parsed = JSON.parse(cleanText(toolCall?.function?.arguments) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function getPendingAgentOrder(context) {
  const parsed = parseJsonObject(context)
  const pending = parsed?.petbot_agent?.pending_order
  if (!pending || typeof pending !== 'object' || !pending.id || !pending.order) return null
  return pending
}

function inferSpecificPetbotServiceType(message = '') {
  const text = normalizeSearchText(message)
  if (/\btosa\b.{0,24}\btesoura\b|\btesoura\b.{0,24}\btosa\b/.test(text)) return 'tosa tesoura'
  if (/\btosa\b.{0,24}\bmaquina\b|\bmaquina\b.{0,24}\btosa\b/.test(text)) return 'tosa maquina'
  if (/\btosa\b.{0,24}\btotal\b|\btosa completa\b/.test(text)) return 'tosa total'
  if (/\btosa\b.{0,24}\bhigienic/.test(text)) return 'tosa higienica'
  if (/\bescovacao\b.{0,18}\bdent|\bescovar\b.{0,18}\bdent/.test(text)) return 'escovacao dentaria'
  if (/\bhidratacao\b|\bhidratar\b.{0,20}\bpelo/.test(text)) return 'hidratacao'
  if (/\bcorte\b.{0,14}\bunhas?\b|\bcortar\b.{0,14}\bunhas?\b/.test(text)) return 'corte de unha'
  if (/\bdesembolo\b|\bdesembolar\b/.test(text)) return 'desembolo'
  return ''
}

function inferPetbotServiceAddonRequest(message = '') {
  const text = normalizeSearchText(message)
  const asksAddition = /\b(?:adicionar|adicione|acrescentar|acrescente|incluir|inclua|colocar|coloque|tambem quero|quero tambem)\b/.test(text)
  if (!asksAddition) return ''
  return inferSpecificPetbotServiceType(message)
}

function samePetbotScheduleInstant(left = '', right = '', timezone = 'America/Sao_Paulo') {
  const leftDate = DateTime.fromISO(cleanText(left), { setZone: true }).setZone(timezone)
  const rightDate = DateTime.fromISO(cleanText(right), { setZone: true }).setZone(timezone)
  return leftDate.isValid && rightDate.isValid && leftDate.toMillis() === rightDate.toMillis()
}

function inferPetbotServiceOrderType({ interpretation = {}, facts = {}, message = '', history = [] } = {}) {
  const interpretedIntent = cleanText(interpretation?.intent).toLowerCase()
  // Product conversations can contain words such as "banho" (for example,
  // shampoo para banho). Never preload the service catalog when the structured
  // interpreter has already classified the turn as a product sale.
  if (interpretedIntent === 'produto') return ''
  if (interpretedIntent === 'veterinaria') return 'veterinaria'
  if (interpretedIntent === 'banho_tosa') return 'banho_tosa'

  const text = normalizeSearchText([
    facts?.service_type,
    interpretation?.service_type,
    ...(history || []).slice(-6).map((entry) => entry?.content),
    message,
  ].filter(Boolean).join(' '))
  if (/veterin|consulta|vacina|exame|cirurg/.test(text)) return 'veterinaria'
  if (/banho|tosa|escovac|desembolo|hidrat|higien/.test(text)) return 'banho_tosa'
  return ''
}

const PETBOT_FRIENDLY_CLOSING = 'Agradecemos pela preferência! Estamos à disposição. Volte sempre! 😊'

async function respondToAlreadyCommittedConfirmation({
  supabase,
  session,
  expectedLastMessageAt,
  options = {},
  turnSemantics = {},
}) {
  const sentAt = new Date().toISOString()
  const existingContext = parseJsonObject(session.context)
  const previousAgentState = existingContext.petbot_agent
    && typeof existingContext.petbot_agent === 'object'
    ? existingContext.petbot_agent
    : {}
  const isAppointment = Boolean(cleanText(existingContext.last_appointment_id))
  const reply = [
    isAppointment
      ? 'Esse agendamento já foi confirmado e continua salvo na agenda.'
      : 'Esse pedido já foi confirmado e continua salvo.',
    'A confirmação repetida não criou outro registro.',
    PETBOT_FRIENDLY_CLOSING,
  ].join('\n')
  const nextContext = {
    ...existingContext,
    petbot_agent: {
      ...previousAgentState,
      version: 3,
      engine_version: 'petbot_agent_v3',
      updatedAt: sentAt,
      pending_order: null,
      last_action: 'duplicate_confirmation_ignored',
      last_turn_semantics: turnSemantics,
      order_saved: true,
    },
  }

  let sessionUpdate = supabase
    .from('chat_sessions')
    .update({
      intent: 'pedido_confirmado',
      context: nextContext,
      last_message_at: sentAt,
    })
    .eq('id', session.id)
  if (cleanText(expectedLastMessageAt)) {
    sessionUpdate = sessionUpdate.eq('last_message_at', expectedLastMessageAt)
  }
  const { data: updatedSession, error: sessionUpdateError } = await sessionUpdate
    .select('id')
    .maybeSingle()
  if (!sessionUpdateError && !updatedSession && cleanText(expectedLastMessageAt)) {
    const staleError = new HttpError(409, 'A newer customer message superseded this PetBot turn.')
    staleError.code = 'PETBOT_STALE_TURN'
    throw staleError
  }
  if (sessionUpdateError || !updatedSession) {
    throw new HttpError(500, 'Unable to persist duplicate confirmation state.')
  }

  const { data: savedReply, error: replyInsertError } = await supabase
    .from('chat_messages')
    .insert({
      session_id: session.id,
      role: 'assistant',
      content: reply,
      metadata: {
        source: options.source || 'dashboard_simulation',
        ...(options.assistantMetadata || {}),
        petbot_agent: {
          engine_version: 'petbot_agent_v3',
          terminal: true,
          order_saved: true,
          duplicate_confirmation_ignored: true,
          turn_semantics: turnSemantics,
        },
      },
      tokens_used: 0,
      sent_at: sentAt,
    })
    .select('id, role, content, metadata, tokens_used, sent_at')
    .single()
  if (replyInsertError) throw new HttpError(500, 'Unable to save assistant response.')

  await recordPetbotEvent(supabase, {
    tenant_id: session.tenant_id,
    module_id: session.module_id,
    session_id: session.id,
    message_id: savedReply.id,
    event_type: 'duplicate_confirmation_ignored',
    engine_version: 'petbot_agent_v3',
    intent: 'pedido_confirmado',
    action: 'duplicate_confirmation_ignored',
    outcome: 'already_saved',
    handoff_target: null,
    metadata: {
      source: options.source || 'dashboard_simulation',
      turn_semantics: turnSemantics,
    },
  })

  return { reply, savedMessage: savedReply }
}

function buildPetbotDayAgendaReply(availability = {}, timezone = 'America/Sao_Paulo') {
  const requested = availability?.requested_slot
  const rows = Array.isArray(availability?.day_schedule) ? availability.day_schedule : []
  if (!requested || requested.available !== false || !rows.length) return ''

  const requestedDateTime = DateTime.fromISO(cleanText(requested.scheduled_at), { setZone: true }).setZone(timezone)
  const requestedTime = requestedDateTime.isValid ? requestedDateTime.toFormat('HH:mm') : ''
  const dateLabel = requestedDateTime.isValid
    ? requestedDateTime.toFormat('dd/MM/yyyy')
    : cleanText(availability.business_date)
  const lines = [
    requestedTime
      ? `O horário de ${requestedTime} já está ocupado.`
      : 'O horário solicitado já está ocupado.',
    '',
    `Agenda de ${dateLabel}:`,
    '',
    ...rows
      .filter((row) => row?.status !== 'fora_do_funcionamento')
      .map((row) => `${cleanText(row.time)} — ${row.status === 'ocupado' ? 'Ocupado' : 'Disponível'}`),
    '',
    'Qual horário disponível você prefere?',
  ]
  return lines.join('\n')
}

function buildPetbotLocalRecoveryReply({ facts = {}, toolRuns = [], resolvedService = null, settings = {}, timezone = 'America/Sao_Paulo' } = {}) {
  const runs = Array.isArray(toolRuns) ? toolRuns : []
  const availabilityRun = [...runs].reverse().find((run) => (
    run?.name === 'check_petshop_availability'
    && run?.ok !== false
    && run?.result
  )) || [...runs].reverse().find((run) => run?.name === 'check_petshop_availability')
  const resolutionRun = [...runs].reverse().find((run) => (
    run?.name === 'resolve_petshop_service'
    && run?.ok !== false
    && run?.result
  )) || [...runs].reverse().find((run) => run?.name === 'resolve_petshop_service')
  const availability = availabilityRun?.result || null
  const resolution = resolutionRun?.result || null
  const petName = cleanText(facts.pet_name)

  const committedRun = [...runs].reverse().find((run) => (
    run?.name === 'create_confirmed_petshop_order'
    && run?.ok !== false
    && ['committed', 'already_committed'].includes(run?.result?.status)
  ))
  if (committedRun) {
    const committedMessage = petName
      ? `Pronto! O agendamento do ${petName} foi confirmado com sucesso.`
      : 'Pronto! O agendamento foi confirmado com sucesso.'
    return `${committedMessage}\n${PETBOT_FRIENDLY_CLOSING}`
  }

  const preparedRun = [...runs].reverse().find((run) => (
    ['prepare_petshop_service_booking', 'prepare_petshop_product_order', 'prepare_petshop_order'].includes(run?.name)
    && run?.ok !== false
    && run?.result?.status === 'prepared'
  ))
  if (preparedRun?.result?.summary) return cleanText(preparedRun.result.summary)

  const transportQualificationReply = buildPetbotTransportQualificationReply({ facts, settings })
  if (transportQualificationReply) return transportQualificationReply

  const rejectedAgendaReply = buildPetbotDayAgendaReply(availability, timezone)
  if (rejectedAgendaReply) return rejectedAgendaReply

  if (availability?.status === 'available') {
    if (availability.requested_slot?.available) {
      const time = cleanText(availability.requested_slot.scheduled_at)
      const formatted = time
        ? DateTime.fromISO(time, { setZone: true }).setZone(timezone).toFormat('HH:mm')
        : cleanText(facts.service_preferred_time)
      const availabilityPrefix = formatted ? `Sim, ${formatted} está disponível.` : 'Sim, o horário solicitado está disponível.'
      if (!petName) return `${availabilityPrefix} Qual é o nome do seu pet?`
      if (!cleanText(facts.service_transport_mode)) {
        return `${availabilityPrefix} Você vai levar o pet ou prefere usar o MotoDog?`
      }
      if (!facts.service_notes_resolved) {
        return `${availabilityPrefix} Há alguma observação para o serviço, como alergia ou preferência de perfume?`
      }
      return `${availabilityPrefix} Vou preparar o resumo com os dados confirmados.`
    }
    const slots = (availability.available_slots || []).slice(0, 6).map((slot) => cleanText(slot.time)).filter(Boolean)
    if (slots.length) {
      return `Encontrei estes horários disponíveis: ${slots.join(', ')}. Qual deles você prefere?`
    }
  }

  if (availability?.status === 'unavailable') {
    return 'Não encontrei horário disponível nessa data. Você prefere tentar outro dia ou outro período?'
  }

  const missingFields = new Set(resolution?.missing_fields || [])
  if (missingFields.has('breed') && missingFields.has('weight_kg')) {
    return 'Qual é a raça e o peso aproximado do seu pet?'
  }
  if (missingFields.has('breed')) return 'Qual é a raça do seu pet?'
  if (missingFields.has('weight_kg')) return 'Qual é o peso aproximado do seu pet?'
  if (resolvedService && !cleanText(facts.service_date)) return 'Qual dia você prefere para o agendamento?'

  if (availability?.status === 'temporarily_unavailable') {
    return 'Já guardei as informações do seu pet, mas não consegui atualizar a agenda agora. Posso tentar a consulta novamente?'
  }
  if (resolution?.status === 'ambiguous' || resolution?.status === 'not_found') {
    return 'Não consegui identificar com segurança um único serviço compatível no cadastro. Vou precisar que a equipe revise o catálogo antes de confirmar o agendamento.'
  }

  return 'Já guardei as informações que você enviou. Vou continuar o atendimento a partir delas, sem pedir que você repita os dados.'
}

function formatPetbotCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function buildPetbotCommittedReply({ pendingOrder = null, result = {}, timezone = 'America/Sao_Paulo' } = {}) {
  const order = pendingOrder?.order || {}
  const customerName = cleanText(order.customer_name)
  const greeting = `Pronto${customerName ? `, ${customerName}` : ''}!`
  const duplicated = cleanText(result.status) === 'already_committed'

  if (order.order_type !== 'produto') {
    const scheduled = DateTime.fromISO(cleanText(order.scheduled_at), { setZone: true }).setZone(timezone)
    const scheduleLabel = scheduled.isValid
      ? scheduled.setLocale('pt-BR').toFormat("dd/MM/yyyy 'às' HH:mm")
      : cleanText(order.scheduled_at)
    const petLabel = cleanText(order.pet_name) ? ` do ${cleanText(order.pet_name)}` : ''
    const lines = [
      duplicated
        ? `${greeting} Esse agendamento${petLabel} já estava confirmado para ${scheduleLabel}.`
        : `${greeting} O agendamento${petLabel} foi confirmado para ${scheduleLabel}.`,
    ]

    if (order.order_type === 'banho_tosa') {
      if (Number(order.service_transport_fee || 0) > 0) {
        lines.push(`MotoDog: ${cleanText(order.service_transport_label) || 'transporte do pet'} (${formatPetbotCurrency(order.service_transport_fee)}).`)
      } else {
        lines.push('Chegada do pet: cliente leva à loja.')
      }
    }
    if (cleanText(order.notes)) lines.push(`Observação registrada: ${cleanText(order.notes)}.`)
    lines.push(`Total: ${formatPetbotCurrency(result.total ?? order.total)}. Pagamento após a conclusão do serviço.`)
    lines.push(PETBOT_FRIENDLY_CLOSING)
    return lines.join('\n')
  }

  const lines = [
    duplicated
      ? `${greeting} Esse pedido já estava confirmado.`
      : `${greeting} Seu pedido foi confirmado.`,
    `Total: ${formatPetbotCurrency(result.total ?? order.total)}.`,
  ]
  if (cleanText(result.pix_key)) {
    lines.push(`Chave Pix: ${cleanText(result.pix_key)}${cleanText(result.pix_holder_name) ? ` — ${cleanText(result.pix_holder_name)}` : ''}.`)
  }
  lines.push(PETBOT_FRIENDLY_CLOSING)
  return lines.join('\n')
}

async function reconcilePetbotCommittedConfirmation({
  supabase,
  session,
  pendingOrder,
  options = {},
  turnSemantics = {},
} = {}) {
  if (!pendingOrder?.id || !session?.id) return null

  const { data: freshSession, error } = await supabase
    .from('chat_sessions')
    .select('id, tenant_id, module_id, context, last_message_at')
    .eq('id', session.id)
    .maybeSingle()
  if (error || !freshSession) return null

  const committed = recoverCommittedResultFromContext({
    context: freshSession.context,
    pendingOrder,
    sessionId: session.id,
  })
  if (!committed) return null

  logger.warn('PetBot confirmation reconciled after an ambiguous failure', {
    sessionId: session.id,
    pendingOrderId: pendingOrder.id,
    saleId: committed.sale_id,
    orderId: committed.order_id,
    appointmentId: committed.appointment_id,
  })

  return respondToAlreadyCommittedConfirmation({
    supabase,
    session: {
      ...session,
      ...freshSession,
    },
    expectedLastMessageAt: freshSession.last_message_at,
    options,
    turnSemantics,
  })
}


async function respondWithPetbotAgent({
  supabase,
  sessionId,
  trimmedMessage,
  options,
  session,
  sessionForAgent,
  moduleId,
  intent,
  history,
  storeSettings,
  runtimeConfig,
  customer,
  llmInterpretation,
  turnSemantics,
  initialProductFacts,
  products,
  services,
  appointments,
  customInstructions,
}) {
  const lunaStateBefore = operationStateFromLegacyContext(sessionForAgent.context, {
    tenantId: session.tenant_id,
    sessionId,
    moduleId,
    customerId: session.client_id,
    customerName: normalizeCustomerDisplayName(session.customer_name),
    intent,
  })
  const lunaTraceStart = createLunaTurnTrace({
    sessionId,
    tenantId: session.tenant_id,
    moduleId,
    message: trimmedMessage,
    stateBefore: lunaStateBefore,
  })
  const pendingAtTurnStart = getPendingAgentOrder(sessionForAgent.context)
  const explicitCurrentMessageConfirmation = Boolean(
    pendingAtTurnStart
    && isExplicitPetbotConfirmation(trimmedMessage)
  )
  const trustedCurrentMessageConfirmation = Boolean(
    explicitCurrentMessageConfirmation
    || turnSemantics?.confirms_pending_order
  )
  const previousAgentContext = parseJsonObject(sessionForAgent.context)?.petbot_agent || {}
  const previousProductFacts = initialProductFacts || previousAgentContext.product_facts || {}
  const currentTurnIntent = cleanText(llmInterpretation?.intent || intent)
  const productConversationAtTurnStart = Boolean(
    cleanText(previousProductFacts.product_kind)
    && !['banho_tosa', 'veterinaria'].includes(currentTurnIntent),
  )
  const semanticTransportMode = productConversationAtTurnStart
    ? ''
    : resolveTransportModeFromSemantics({
      semantics: turnSemantics,
      options: listPetTransportOptions(storeSettings),
    })
  const explicitTransportMode = productConversationAtTurnStart
    ? ''
    : inferExplicitPetTransportMode(trimmedMessage, history)
  const inferredTransportMode = productConversationAtTurnStart
    ? ''
    : (
      semanticTransportMode
      || explicitTransportMode
      || cleanText(turnSemantics?.service_transport_mode)
    )
  const productBulkQuantityMessage = Boolean(
    cleanText(previousProductFacts.package_preference) === 'granel'
    && Number(detectExplicitProductQuantity(trimmedMessage, 'granel') || 0) > 0,
  )
  const previousServiceFacts = previousAgentContext.facts || previousAgentContext.explicit_facts || {}
  const inferredTransportAddress = productConversationAtTurnStart
    ? {}
    : inferPetbotTransportAddress(trimmedMessage, history)
  const transportAddressConfirmation = productConversationAtTurnStart
    ? null
    : inferPetbotTransportAddressConfirmation(trimmedMessage, history)
  const currentTransportAddress = sanitizePetbotTransportAddress({
    service_transport_address: cleanText(llmInterpretation?.service_transport_address)
      || cleanText(inferredTransportAddress.service_transport_address)
      || null,
    service_transport_neighborhood: cleanText(llmInterpretation?.service_transport_neighborhood)
      || cleanText(inferredTransportAddress.service_transport_neighborhood)
      || null,
    service_transport_city: cleanText(llmInterpretation?.service_transport_city)
      || cleanText(inferredTransportAddress.service_transport_city)
      || null,
    service_transport_reference: cleanText(llmInterpretation?.service_transport_reference)
      || cleanText(inferredTransportAddress.service_transport_reference)
      || null,
  })
  const currentTurnProvidesTransportAddress = Object.values(currentTransportAddress).some(Boolean)
  const resetSavedTransportAddress = transportAddressConfirmation === false
    || (currentTurnProvidesTransportAddress && previousServiceFacts.service_transport_address_from_profile)
  const serviceFactsBeforeTurn = productConversationAtTurnStart
    ? {
      ...previousServiceFacts,
      weight_kg: null,
      weight_label: null,
      weight_estimated: false,
      service_type: null,
      service_date: null,
      service_time_preference: null,
      service_preferred_time: null,
      service_notes: null,
      service_notes_resolved: false,
      service_transport_mode: null,
      service_transport_label: null,
      service_transport_address: null,
      service_transport_neighborhood: null,
      service_transport_city: null,
      service_transport_reference: null,
      service_transport_address_confirmed: false,
      service_transport_address_from_profile: false,
      service_transport_address_profile_rejected: false,
      symptom: null,
    }
    : previousServiceFacts
  const explicitServiceAddonAtTurnStart = pendingAtTurnStart?.order?.order_type === 'banho_tosa'
    ? inferPetbotServiceAddonRequest(trimmedMessage)
    : ''
  const explicitSpecificServiceType = productConversationAtTurnStart || explicitServiceAddonAtTurnStart
    ? ''
    : inferSpecificPetbotServiceType(trimmedMessage)
  const informationalServiceQuestion = !productConversationAtTurnStart
    && (isPetshopServiceKnowledgeQuestion(trimmedMessage) || isServiceInformationQuestion(trimmedMessage))
  const explicitServiceNoteUpdate = productConversationAtTurnStart
    ? ''
    : inferExplicitServiceNoteUpdate(trimmedMessage)
  const interpretationForFacts = {
    ...(llmInterpretation || {}),
    ...(explicitSpecificServiceType ? { service_type: explicitSpecificServiceType } : {}),
    ...(productConversationAtTurnStart || productBulkQuantityMessage
      ? {
        weight_kg: null,
        weight_label: null,
        weight_estimated: false,
        service_type: null,
        service_date: null,
        service_time_preference: null,
        service_preferred_time: null,
        service_notes: null,
        service_notes_resolved: false,
        service_transport_mode: null,
        symptom: null,
      }
      : {}),
    ...(isExplicitNoServiceNotesAnswer(trimmedMessage, history)
      ? { service_notes: null, service_notes_resolved: true }
      : informationalServiceQuestion
        ? {
          service_notes: null,
          service_notes_resolved: previousServiceFacts.service_notes_resolved === true,
        }
        : {}),
    ...(explicitServiceNoteUpdate
      ? { service_notes: explicitServiceNoteUpdate, service_notes_resolved: true }
      : {}),
    service_transport_mode: inferredTransportMode || null,
    ...currentTransportAddress,
    service_transport_address_reset: resetSavedTransportAddress,
    service_transport_address_confirmed: transportAddressConfirmation === true || currentTurnProvidesTransportAddress,
    service_transport_address_from_profile: currentTurnProvidesTransportAddress ? false : undefined,
    service_transport_address_profile_rejected: resetSavedTransportAddress,
  }
  let serviceFacts = mergeInterpretedPetbotServiceFacts({
    interpretation: interpretationForFacts,
    previousFacts: serviceFactsBeforeTurn,
  })
  const productConversationText = buildCatalogSearchText(history, trimmedMessage)
  let productFacts = mergeProductQueryFacts({
    interpretation: llmInterpretation || {},
    previousFacts: previousProductFacts,
    serviceFacts,
    message: trimmedMessage,
    semantics: turnSemantics,
  })
  let pendingOrder = pendingAtTurnStart
  let orderResult = null
  let needsHuman = false
  let handoffTarget = null
  let updatedCustomerName = normalizeCustomerDisplayName(session.customer_name)
  let activeCustomer = customer
  const mediaMessages = []
  let liveProducts = Array.isArray(products) ? products : []
  let liveServices = Array.isArray(services) ? services : []
  let liveAppointments = Array.isArray(appointments) ? appointments : []
  let liveSubscriptionBenefits = []
  let lastProductCandidates = []
  let selectedRecentProductCandidate = null
  const previousResolvedServiceState = previousAgentContext.resolved_service && typeof previousAgentContext.resolved_service === 'object'
    ? previousAgentContext.resolved_service
    : null
  const currentFactsSignature = petbotServiceFactsSignature(serviceFacts)
  let resolvedServiceThisTurn = previousResolvedServiceState?.fact_signature === currentFactsSignature
    ? (previousResolvedServiceState.service || previousResolvedServiceState)
    : null

  const refreshServiceCatalog = async ({ required = false } = {}) => {
    try {
      const freshServices = await loadPetshopServices(supabase, moduleId, session.tenant_id)
      if (freshServices.length) liveServices = freshServices
      if (liveServices.length) return liveServices
      if (required) throw new Error('Nenhum serviço ativo foi carregado do catálogo.')
      return []
    } catch (error) {
      logger.warn('PetBot service catalog refresh failed', {
        sessionId,
        moduleId,
        error: error instanceof Error ? error.message : String(error),
        fallback_count: liveServices.length,
      })
      if (liveServices.length) return liveServices
      if (required) throw error
      return []
    }
  }

  const refreshAppointmentContext = async () => {
    try {
      const freshAppointments = await loadAppointmentsFresh(supabase, moduleId, session.tenant_id, storeSettings)
      liveAppointments = freshAppointments
      return { ok: true, appointments: liveAppointments }
    } catch (error) {
      logger.warn('PetBot appointment refresh failed', {
        sessionId,
        moduleId,
        error: error instanceof Error ? error.message : String(error),
        fallback_count: liveAppointments.length,
      })
      return {
        ok: false,
        appointments: liveAppointments,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  const mergeServiceFactsFromToolArgs = (toolArgs = {}) => {
    const previousSignature = petbotServiceFactsSignature(serviceFacts)
    serviceFacts = mergeInterpretedPetbotServiceFacts({
      interpretation: toolArgs,
      previousFacts: serviceFacts,
    })
    if (petbotServiceFactsSignature(serviceFacts) !== previousSignature) resolvedServiceThisTurn = null
    return groundPetbotServiceArgs(toolArgs, serviceFacts)
  }

  const interpretedProfilePatch = {
    customer_name: cleanText(llmInterpretation?.customer_name),
    pet_name: cleanText(serviceFacts.pet_name),
    species: cleanText(serviceFacts.species),
    size: cleanText(serviceFacts.size),
    breed: cleanText(serviceFacts.breed),
    weight_kg: cleanText(productFacts.product_kind)
      ? null
      : (Number(serviceFacts.weight_kg || 0) || null),
    coat_type: cleanText(serviceFacts.coat_type),
    symptom: cleanText(serviceFacts.symptom),
    address: cleanText(productFacts.delivery_address || llmInterpretation?.delivery_address),
    neighborhood: cleanText(
      productFacts.delivery_neighborhood || llmInterpretation?.neighborhood,
    ),
    city: cleanText(productFacts.delivery_city || llmInterpretation?.city),
  }
  if (Object.values(interpretedProfilePatch).some(Boolean)) {
    try {
      const persistedCustomer = await ensureCustomerProfile(supabase, sessionForAgent, interpretedProfilePatch)
      activeCustomer = persistedCustomer
      updatedCustomerName = normalizeCustomerDisplayName(persistedCustomer.client?.name) || updatedCustomerName
    } catch (error) {
      logger.warn('PetBot fact persistence failed', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const trustedCustomerName = () => {
    const candidates = [
      cleanText(llmInterpretation?.customer_name),
      cleanText(activeCustomer?.client?.name),
      cleanText(updatedCustomerName),
      cleanText(sessionForAgent.customer_name),
      cleanText(session.customer_name),
    ]
    return candidates.find((value) => value && !isPlaceholderName(value)) || ''
  }

  const [savedPets, subscriptionBenefits] = await Promise.all([
    loadCustomerPets(supabase, sessionForAgent),
    loadCustomerSubscriptionBenefits(
      supabase,
      sessionForAgent,
      activeCustomer?.client?.id || sessionForAgent.client_id,
    ),
  ])
  liveSubscriptionBenefits = subscriptionBenefits

  const profilePet = activeCustomer?.client?.details?.pet_name
    ? [{
      name: cleanText(activeCustomer.client.details.pet_name),
      species: cleanText(activeCustomer.client.details.species),
      breed: cleanText(activeCustomer.client.details.breed),
      size: cleanText(activeCustomer.client.details.size),
    }]
    : []
  productFacts = enrichProductQueryFactsFromSavedPet({
    facts: productFacts,
    savedPets: [...savedPets, ...profilePet],
  })
  const currentProductFactsSignature = productFactsSignature(productFacts)
  const previousCandidateState = previousAgentContext.last_product_candidates
    && typeof previousAgentContext.last_product_candidates === 'object'
    ? previousAgentContext.last_product_candidates
    : null
  const previousCandidates = Array.isArray(previousCandidateState?.products)
    ? previousCandidateState.products
    : []
  const rejectsPreviousProductCandidate = /\b(?:nao quero (?:essa|esse|ele|ela)|outra opcao|outro produto|trocar (?:a|o) produto)\b/.test(
    normalizeSearchText(trimmedMessage),
  )
  if (
    previousCandidateState?.fact_signature === currentProductFactsSignature
    && previousCandidates.length
  ) {
    try {
      const refreshedCandidates = await loadProductsByIds(
        supabase,
        moduleId,
        session.tenant_id,
        previousCandidates.map((candidate) => candidate.id),
      )
      const refreshedById = new Map(refreshedCandidates.map((product) => [cleanText(product.id), product]))
      lastProductCandidates = previousCandidates
        .map((candidate) => {
          const product = refreshedById.get(cleanText(candidate.id))
          if (!product) return null
          return {
            id: product.id,
            name: product.name,
            category: product.category || null,
            species_target: product.species_target || null,
            price: Number(product.price || 0),
            stock_quantity: Number(product.stock_quantity || 0),
            active: product.active !== false,
            image_available: Boolean(cleanText(product.image_url)),
          }
        })
        .filter(Boolean)
      liveProducts = mergeProductsById(refreshedCandidates, liveProducts)
      const explicitlySelectedCandidate = resolveRecentProductCandidate(
        trimmedMessage,
        lastProductCandidates,
      )
      const semanticSelectedCandidate = Number(turnSemantics?.option_index || 0) > 0
        ? lastProductCandidates[Number(turnSemantics.option_index) - 1] || null
        : null
      const persistedSelectedCandidate = lastProductCandidates.find((candidate) => (
        cleanText(candidate.id) === cleanText(previousCandidateState.selected_product_id)
      ))
      const quantitySelectedSoleCandidate = (
        lastProductCandidates.length === 1
        && Number(productFacts.quantity || 0) > 0
      )
        ? lastProductCandidates[0]
        : null
      selectedRecentProductCandidate = semanticSelectedCandidate
        || explicitlySelectedCandidate
        || quantitySelectedSoleCandidate
        || (rejectsPreviousProductCandidate ? null : persistedSelectedCandidate)
    } catch (error) {
      logger.warn('PetBot previous product candidate refresh failed', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      })
      lastProductCandidates = []
    }
  }

  const veterinaryConsultationAccepted = acceptedVeterinaryConsultationOffer(trimmedMessage, history)
  const veterinaryConsultationDeclined = declinedVeterinaryConsultationOffer(trimmedMessage, history)
  const veterinaryConsultationQuestion = isVeterinaryConsultationQuestion(trimmedMessage)
  const veterinaryTreatmentAdvice = isVeterinaryTreatmentAdviceRequest(trimmedMessage)
  const explicitHandoffTarget = explicitPetbotHandoffTarget(trimmedMessage, llmInterpretation || {})
  const acceptedHandoffTarget = acceptedPetbotHandoffOffer(trimmedMessage, history) ? 'atendente' : ''
  const effectiveVeterinaryRisk = resolveEffectiveVeterinaryRisk(
    trimmedMessage,
    llmInterpretation?.veterinary_risk,
  )
  const requestedHandoffTarget = effectiveVeterinaryRisk === 'emergency'
    ? 'veterinaria'
    : explicitHandoffTarget || acceptedHandoffTarget
  const shouldStartVeterinaryFlow = Boolean(
    veterinaryConsultationAccepted
    || veterinaryConsultationQuestion
    || (
      veterinaryTreatmentAdvice
      && cleanText(llmInterpretation?.intent).toLowerCase() !== 'produto'
    )
  )
  const serviceOrderType = requestedHandoffTarget || veterinaryConsultationDeclined
    ? ''
    : shouldStartVeterinaryFlow
      ? 'veterinaria'
      : inferPetbotServiceOrderType({
        interpretation: llmInterpretation,
        facts: serviceFacts,
        message: trimmedMessage,
        history,
      })
  if (serviceOrderType === 'banho_tosa') {
    serviceFacts = enrichPetbotMotodogAddressFromCustomer(serviceFacts, activeCustomer)
  }
  let preloadedToolRuns = []
  let operationalContext = null
  let rejectedRequestedSlot = null
  if (serviceOrderType) {
    // Availability shown to the customer must come from a fresh agenda read.
    // The cached load is useful for initial context, but it is not authoritative
    // enough to advertise a slot. If the refresh fails, preflight returns a
    // temporary-unavailable result while preserving all customer facts.
    const needsAgendaRefresh = Boolean(cleanText(serviceFacts.service_date))
    const appointmentRefresh = needsAgendaRefresh
      ? await refreshAppointmentContext()
      : { ok: true }
    const preflight = buildPetbotOperationalPreflight({
      facts: serviceFacts,
      orderType: serviceOrderType,
      services: liveServices,
      appointments: liveAppointments,
      subscriptionBenefits: liveSubscriptionBenefits,
      settings: storeSettings,
      agendaAvailable: appointmentRefresh.ok,
    })
    serviceFacts = preflight.facts
    rejectedRequestedSlot = preflight.availability?.requested_slot?.available === false
      ? preflight.availability.requested_slot
      : null
    if (rejectedRequestedSlot) {
      serviceFacts = {
        ...serviceFacts,
        service_preferred_time: null,
        service_time_preference: null,
      }
    }
    preloadedToolRuns = preflight.toolRuns
    operationalContext = preflight.context
    if (preflight.resolvedService) resolvedServiceThisTurn = preflight.resolvedService
  }

  let serviceAddonReply = ''
  const requestedServiceAddon = explicitServiceAddonAtTurnStart
  if (requestedServiceAddon) {
    await refreshServiceCatalog({ required: false })
    const addonResolution = resolvePetshopService({
      serviceQuery: requestedServiceAddon,
      orderType: 'banho_tosa',
      services: liveServices,
      weightKg: serviceFacts.weight_kg,
      coatType: serviceFacts.coat_type,
      breed: serviceFacts.breed,
      species: serviceFacts.species,
    })
    if (addonResolution?.ok && addonResolution?.status === 'resolved' && addonResolution.service?.id) {
      const appointmentRefresh = await refreshAppointmentContext()
      if (appointmentRefresh.ok) {
        liveSubscriptionBenefits = await loadCustomerSubscriptionBenefits(
          supabase,
          sessionForAgent,
          activeCustomer?.client?.id || sessionForAgent.client_id,
        )
        const existingAdditionalIds = Array.isArray(pendingAtTurnStart.order.additional_service_ids)
          ? pendingAtTurnStart.order.additional_service_ids
          : []
        const preparedAddon = preparePetshopOrderDraft({
          args: groundPetbotServiceArgs({
            ...pendingAtTurnStart.order,
            additional_service_ids: [...new Set([...existingAdditionalIds, addonResolution.service.id])],
          }, serviceFacts),
          products: liveProducts,
          services: liveServices,
          appointments: appointmentRefresh.appointments,
          subscriptionBenefits: liveSubscriptionBenefits,
          settings: storeSettings,
        })
        if (preparedAddon.ok) {
          pendingOrder = {
            id: preparedAddon.pending_order_id,
            order: preparedAddon.order,
            summary: preparedAddon.summary,
            prepared_at: new Date().toISOString(),
          }
          serviceAddonReply = preparedAddon.summary
        } else {
          serviceAddonReply = `Não consegui adicionar ${requestedServiceAddon} com segurança ao agendamento atual. O serviço principal continua reservado no resumo anterior; escolha outro adicional ativo ou confirme somente o serviço principal.`
        }
      } else {
        serviceAddonReply = 'Não consegui revalidar a agenda agora, então não alterei o agendamento. Tente novamente em instantes sem repetir os outros dados.'
      }
    } else {
      serviceAddonReply = `Não encontrei ${requestedServiceAddon} como serviço adicional ativo e com preço confirmado. Não alterei o agendamento atual.`
    }
  }

  const isProductConversation = !serviceOrderType && Boolean(cleanText(productFacts.product_kind))
  const verifiedStoreInformation = buildVerifiedStoreInformation(storeSettings)
  const systemPrompt = buildPetbotAgentV3Prompt({
    storeName: storeSettings.storeName,
    storePhone: storeSettings.storePhone,
    storeLocation: [storeSettings.storeAddress, storeSettings.storeNeighborhood, storeSettings.storeCity].filter(Boolean).join(' - '),
    storeInformation: verifiedStoreInformation,
    customer: {
      name: cleanText(updatedCustomerName) || null,
      known: Boolean(activeCustomer?.isKnown),
      phone: cleanText(activeCustomer?.phone || session.customer_phone) || null,
      address: cleanText(activeCustomer?.client?.address) || null,
      neighborhood: cleanText(activeCustomer?.client?.neighborhood) || null,
      city: cleanText(activeCustomer?.client?.city) || null,
      saved_pet: {
        name: cleanText(activeCustomer?.client?.details?.pet_name) || null,
        species: cleanText(activeCustomer?.client?.details?.species) || null,
        breed: cleanText(activeCustomer?.client?.details?.breed) || null,
        weight_kg: Number(activeCustomer?.client?.details?.weight_kg || 0) || null,
        coat_type: cleanText(activeCustomer?.client?.details?.coat_type) || null,
        size: cleanText(activeCustomer?.client?.details?.size) || null,
      },
      saved_pets: savedPets,
      subscription_benefits: subscriptionBenefits,
    },
    facts: {
      customer_name: cleanText(llmInterpretation?.customer_name) || cleanText(updatedCustomerName) || null,
      pet_name: isProductConversation ? (productFacts.pet_name || serviceFacts.pet_name) : serviceFacts.pet_name,
      species: isProductConversation ? productFacts.species : serviceFacts.species,
      breed: isProductConversation ? productFacts.breed : serviceFacts.breed,
      size: isProductConversation ? productFacts.size : serviceFacts.size,
      symptom: serviceFacts.symptom,
      veterinary_risk: effectiveVeterinaryRisk,
      weight_kg: isProductConversation ? null : serviceFacts.weight_kg,
      weight_label: isProductConversation ? null : serviceFacts.weight_label,
      weight_estimated: isProductConversation ? false : serviceFacts.weight_estimated,
      coat_type: serviceFacts.coat_type,
      resolved_service: resolvedServiceThisTurn
        ? {
          id: resolvedServiceThisTurn.id,
          product_id: resolvedServiceThisTurn.product_id || null,
          code: resolvedServiceThisTurn.code,
          name: resolvedServiceThisTurn.name,
        }
        : null,
      intent: cleanText(llmInterpretation?.intent) || null,
      service_type: cleanText(serviceFacts.service_type || llmInterpretation?.service_type) || null,
      service_date: cleanText(serviceFacts.service_date || llmInterpretation?.service_date) || null,
      service_time: cleanText(
        serviceFacts.service_preferred_time
        || serviceFacts.service_time_preference
        || llmInterpretation?.service_preferred_time
        || llmInterpretation?.service_time_preference,
      ) || null,
      service_notes: serviceFacts.service_notes,
      service_notes_resolved: Boolean(serviceFacts.service_notes_resolved),
      service_transport_mode: serviceFacts.service_transport_mode,
      service_transport_label: serviceFacts.service_transport_label,
      service_transport_address: serviceFacts.service_transport_address,
      service_transport_neighborhood: serviceFacts.service_transport_neighborhood,
      service_transport_city: serviceFacts.service_transport_city,
      service_transport_reference: serviceFacts.service_transport_reference,
      service_transport_address_confirmed: Boolean(serviceFacts.service_transport_address_confirmed),
      service_transport_address_from_profile: Boolean(serviceFacts.service_transport_address_from_profile),
      service_transport_address_profile_rejected: Boolean(serviceFacts.service_transport_address_profile_rejected),
      product_kind: cleanText(productFacts.product_kind) || null,
      age_category: cleanText(productFacts.age_category) || null,
      brand: cleanText(productFacts.brand) || null,
      package_preference: cleanText(productFacts.package_preference) || null,
      package_kg: Number(productFacts.package_kg || 0) || null,
      quantity: Number(productFacts.quantity || 0) || null,
      payment_method: cleanText(productFacts.payment_method) || null,
      fulfillment_type: cleanText(productFacts.fulfillment_type) || null,
      delivery_address: cleanText(productFacts.delivery_address) || null,
      delivery_neighborhood: cleanText(productFacts.delivery_neighborhood) || null,
      delivery_city: cleanText(productFacts.delivery_city) || null,
      delivery_reference: cleanText(productFacts.delivery_reference) || null,
      recent_product_candidates: lastProductCandidates,
      selected_product_candidate: selectedRecentProductCandidate,
    },
    pendingOrder: pendingAtTurnStart,
    operationalContext,
    customInstructions,
    timezone: storeSettings.petbotTimezone,
  })

  const executeTool = async (toolCall) => {
    const name = cleanText(toolCall?.function?.name)
    const args = parseAgentToolArguments(toolCall)

    if (name === 'search_petshop_products') {
      const requestedQuantity = Number(productFacts.quantity || llmInterpretation?.quantity || 0) || null
      if (selectedRecentProductCandidate) {
        const selectedProduct = liveProducts.find((product) => (
          cleanText(product.id) === cleanText(selectedRecentProductCandidate.id)
        ))
        const selectedPayload = selectedProduct
          ? {
            id: selectedProduct.id,
            name: selectedProduct.name,
            category: selectedProduct.category || null,
            species_target: selectedProduct.species_target || null,
            price: Number(selectedProduct.price || 0),
            stock_quantity: Number(selectedProduct.stock_quantity || 0),
            active: selectedProduct.active !== false,
            image_available: Boolean(cleanText(selectedProduct.image_url)),
          }
          : {
            ...selectedRecentProductCandidate,
            active: false,
            stock_quantity: 0,
          }
        lastProductCandidates = [selectedPayload]
        const available = Boolean(
          selectedProduct
          && selectedProduct.active !== false
          && Number(selectedProduct.price || 0) > 0
          && Number(selectedProduct.stock_quantity || 0) > 0
        )
        const sufficient = available && (
          !requestedQuantity
          || Number(selectedProduct.stock_quantity || 0) >= requestedQuantity
        )
        return {
          ok: true,
          checked: true,
          action: name,
          source: 'products',
          status: !available ? 'selected_unavailable' : (sufficient ? 'resolved' : 'insufficient_stock'),
          requested_quantity: requestedQuantity,
          selected_candidate: {
            ...selectedPayload,
            available,
            sufficient_stock: sufficient,
          },
          differentiators: [],
          products: available ? [selectedPayload] : [],
        }
      }

      const known = mergeProductQueryFacts({
        interpretation: {
          product_kind: productFacts.product_kind || llmInterpretation?.product_kind,
          species: productFacts.species || args.species,
          breed: productFacts.breed,
          age_category: productFacts.age_category || args.age_category,
          size: productFacts.size || args.size,
          brand: productFacts.brand || args.brand,
          package_preference: productFacts.package_preference,
          package_kg: productFacts.package_preference === 'granel'
            ? null
            : (productFacts.package_kg || args.package_kg),
          quantity: productFacts.quantity,
        },
        previousFacts: productFacts,
        serviceFacts,
        message: [trimmedMessage, cleanText(args.query)].filter(Boolean).join(' '),
      })
      const query = [
        cleanText(args.query),
        cleanText(known.species),
        cleanText(known.breed),
        cleanText(known.age_category),
        cleanText(known.size),
        cleanText(known.brand),
        cleanText(known.package_preference),
        Number(known.package_kg || 0) > 0 ? `${Number(known.package_kg)} kg` : '',
      ].filter(Boolean).join(' ')
      if (!query) return { ok: false, action: name, status: 'invalid_input', error: 'missing_query' }
      const productSelectColumns = 'id, name, category, description, species_target, barcode, image_url, price, stock_quantity, active, bot_metadata'
      const [catalogMatches, explicitBrandMatches] = await Promise.all([
        loadProducts(supabase, moduleId, session.tenant_id, query, known),
        cleanText(known.brand)
          ? searchProductsByTerms(
            supabase,
            moduleId,
            session.tenant_id,
            [cleanText(known.brand)],
            productSelectColumns,
          )
          : Promise.resolve([]),
      ])
      const searched = mergeProductsById(explicitBrandMatches, catalogMatches)
        .filter(isSellableProduct)
      const refreshed = await loadProductsByIds(
        supabase,
        moduleId,
        session.tenant_id,
        searched.map((product) => product.id),
      )
      const found = rankCatalogProducts(
        refreshed.filter(isSellableProduct),
        known,
        query,
      ).map((item) => item.product)
      liveProducts = mergeProductsById(liveProducts, found)
      lastProductCandidates = found.slice(0, 12).map((product) => ({
        id: product.id,
        name: product.name,
        category: product.category || null,
        species_target: product.species_target || null,
        price: Number(product.price || 0),
        stock_quantity: Number(product.stock_quantity || 0),
        active: product.active !== false,
        image_available: Boolean(cleanText(product.image_url)),
      }))
      const differentiation = analyzeProductDifferentiation(found.slice(0, 12), known)
      return {
        ok: true,
        checked: true,
        action: name,
        source: 'products',
        status: differentiation.status,
        differentiators: differentiation.differentiators,
        requested_quantity: requestedQuantity,
        products: lastProductCandidates,
      }
    }

    if (name === 'resolve_petshop_service') {
      const groundedArgs = mergeServiceFactsFromToolArgs(args)
      await refreshServiceCatalog({ required: false })
      let resolution = resolvePetshopService({
        serviceQuery: args.service_query || llmInterpretation?.service_type || args.order_type,
        orderType: args.order_type || llmInterpretation?.intent,
        services: liveServices,
        species: groundedArgs.species,
        breed: groundedArgs.breed,
        weightKg: groundedArgs.weight_kg,
        coatType: groundedArgs.coat_type,
      })
      if (resolution.status === 'needs_input') {
        const satisfied = new Set([
          ...(cleanText(serviceFacts.breed) ? ['breed'] : []),
          ...(Number(serviceFacts.weight_kg || 0) > 0 ? ['weight_kg'] : []),
          ...(cleanText(serviceFacts.species) ? ['species'] : []),
        ])
        const missingFields = (resolution.missing_fields || []).filter((field) => !satisfied.has(field))
        const requiredFields = (resolution.required_fields || []).filter((field) => {
          const normalized = normalizeSearchText(field)
          if (satisfied.has('breed') && normalized.includes('raca')) return false
          if (satisfied.has('weight_kg') && normalized.includes('peso')) return false
          if (normalized.includes('pelo') || normalized.includes('pelagem')) return false
          return true
        })
        resolution = {
          ...resolution,
          missing_fields: missingFields,
          required_fields: requiredFields,
          ...(missingFields.length || requiredFields.length ? {} : {
            status: 'ambiguous',
            error: resolution.error || 'O catálogo não conseguiu diferenciar o serviço usando os fatos já informados. Não repita perguntas ao cliente.',
          }),
        }
      }
      const subscriptionBenefit = resolution.ok && resolution.status === 'resolved'
        ? findPetshopSubscriptionBenefit(resolution.service, liveSubscriptionBenefits)
        : null
      const resolvedService = resolution.ok && resolution.status === 'resolved'
        ? {
          ...resolution.service,
          regular_price: Number(resolution.service.price || 0),
          price: subscriptionBenefit ? 0 : Number(resolution.service.price || 0),
          subscription_benefit: subscriptionBenefit,
        }
        : null
      resolvedServiceThisTurn = resolvedService
      const nextAction = resolution.status === 'resolved'
        ? 'check_availability_when_date_is_known'
        : resolution.status === 'needs_input'
          ? 'ask_missing_fields'
          : resolution.status === 'ambiguous'
            ? 'ask_one_differentiating_fact'
            : 'explain_unavailable_or_handoff_if_persistent'
      return {
        action: name,
        ...resolution,
        next_action: nextAction,
        ...(resolvedService ? { service: resolvedService, candidates: [resolvedService], available_services: [resolvedService] } : {}),
      }
    }

    if (name === 'check_petshop_availability') {
      mergeServiceFactsFromToolArgs({
        service_date: args.date,
        service_preferred_time: args.preferred_time,
        service_time_preference: args.period,
      })
      const requestedServiceId = cleanText(args.service_id)
      const allowedServiceIds = new Set([
        cleanText(resolvedServiceThisTurn?.id),
        cleanText(resolvedServiceThisTurn?.code),
        cleanText(resolvedServiceThisTurn?.product_id),
      ].filter(Boolean))
      if (!resolvedServiceThisTurn || !allowedServiceIds.has(requestedServiceId)) {
        return {
          ok: false,
          action: name,
          status: 'needs_service_resolution',
          next_action: 'resolve_service_or_ask_missing_fact',
          error: 'Resolva o serviço exato com os fatos do cliente antes de consultar a agenda.',
        }
      }
      await refreshServiceCatalog({ required: false })
      const appointmentRefresh = await refreshAppointmentContext()
      if (!appointmentRefresh.ok) {
        return {
          ok: false,
          action: name,
          status: 'temporarily_unavailable',
          next_action: 'apologize_briefly_and_offer_to_retry_the_schedule_without_handoff',
          error_code: 'agenda_refresh_failed',
        }
      }
      const availability = buildServiceAvailability({
        serviceQuery: args.service_id,
        orderType: args.order_type || llmInterpretation?.intent,
        species: serviceFacts.species,
        breed: serviceFacts.breed,
        weightKg: serviceFacts.weight_kg,
        coatType: serviceFacts.coat_type,
        date: args.date || serviceFacts.service_date,
        preferredTime: args.preferred_time || serviceFacts.service_preferred_time,
        period: args.period || serviceFacts.service_time_preference,
        services: liveServices,
        appointments: liveAppointments,
        settings: storeSettings,
        requirePetIdentity: false,
        requireServiceClassification: false,
      })
      const subscriptionBenefit = availability?.service
        ? findPetshopSubscriptionBenefit(availability.service, liveSubscriptionBenefits)
        : null
      const decoratePrice = (entry = {}) => ({
        ...entry,
        regular_price: Number(entry.price || availability?.service?.price || 0),
        price: subscriptionBenefit ? 0 : Number(entry.price || 0),
        subscription_benefit: subscriptionBenefit,
      })
      const nextAction = availability?.status === 'available'
        ? 'answer_with_validated_availability'
        : availability?.status === 'unavailable'
          ? 'offer_validated_alternatives_or_ask_another_date'
          : 'ask_missing_schedule_fact'
      return {
        action: name,
        ...availability,
        next_action: nextAction,
        ...(availability?.service ? { service: decoratePrice(availability.service) } : {}),
        day_schedule: Array.isArray(availability?.day_schedule) ? availability.day_schedule : [],
        available_slots: (availability?.available_slots || []).map(decoratePrice),
      }
    }

    if (name === 'get_petshop_transport_options') {
      const options = listPetTransportOptions(storeSettings)
      return {
        ok: true,
        action: name,
        status: options.length ? 'available' : 'unavailable',
        no_transport_allowed: true,
        options,
      }
    }

    if (['prepare_petshop_product_order', 'prepare_petshop_service_booking', 'prepare_petshop_order'].includes(name)) {
      const isProductOrder = name === 'prepare_petshop_product_order'
        || (name === 'prepare_petshop_order' && args.order_type === 'produto')
      const baseArgs = isProductOrder
        ? { ...args, order_type: 'produto' }
        : mergeServiceFactsFromToolArgs({ ...args, order_type: args.order_type || serviceOrderType || 'banho_tosa' })
      const modelCustomerName = cleanText(baseArgs.customer_name)
      const effectiveArgs = {
        ...baseArgs,
        customer_name: trustedCustomerName() || (!isPlaceholderName(modelCustomerName) ? modelCustomerName : ''),
        ...(isProductOrder ? {
          ...(selectedRecentProductCandidate && Number(productFacts.quantity || 0) > 0
            ? {
              items: [{
                product_id: selectedRecentProductCandidate.id,
                name: selectedRecentProductCandidate.name,
                quantity: Number(productFacts.quantity),
                upsell: false,
              }],
            }
            : {}),
          payment_method: cleanText(productFacts.payment_method) || null,
          fulfillment_type: cleanText(productFacts.fulfillment_type) || null,
          delivery_address: cleanText(productFacts.delivery_address) || null,
          delivery_neighborhood: cleanText(productFacts.delivery_neighborhood) || null,
          delivery_city: cleanText(productFacts.delivery_city) || null,
          delivery_reference: cleanText(productFacts.delivery_reference) || null,
        } : {
          items: [],
          payment_method: null,
          fulfillment_type: 'servico',
          delivery_address: null,
          delivery_neighborhood: null,
          delivery_city: null,
          delivery_reference: null,
          change_for: null,
        }),
      }
      if (
        !isProductOrder
        && rejectedRequestedSlot?.scheduled_at
        && effectiveArgs.scheduled_at
        && samePetbotScheduleInstant(
          effectiveArgs.scheduled_at,
          rejectedRequestedSlot.scheduled_at,
          storeSettings.petbotTimezone,
        )
      ) {
        return {
          ok: false,
          action: name,
          status: 'needs_input',
          missing_fields: ['novo horário disponível'],
          error_code: 'rejected_occupied_slot',
        }
      }
      if (isProductOrder) {
        const productIds = (Array.isArray(effectiveArgs.items) ? effectiveArgs.items : [])
          .map((item) => cleanText(item.product_id))
          .filter(Boolean)
        const freshProducts = await loadProductsByIds(supabase, moduleId, session.tenant_id, productIds)
        liveProducts = mergeProductsById(freshProducts, liveProducts)
      } else {
        await refreshServiceCatalog({ required: true })
        const appointmentRefresh = await refreshAppointmentContext()
        if (!appointmentRefresh.ok) {
          return {
            ok: false,
            action: name,
            status: 'temporarily_unavailable',
            missing_fields: [],
            error_code: 'agenda_refresh_failed',
          }
        }
      }

      const prepared = preparePetshopOrderDraft({
        args: effectiveArgs,
        products: liveProducts,
        services: liveServices,
        appointments: liveAppointments,
        subscriptionBenefits: liveSubscriptionBenefits,
        settings: storeSettings,
      })
      if (!prepared.ok) {
        return {
          ok: false,
          action: name,
          status: 'needs_input',
          missing_fields: prepared.missing || [],
        }
      }

      pendingOrder = {
        id: prepared.pending_order_id,
        order: prepared.order,
        summary: prepared.summary,
        prepared_at: new Date().toISOString(),
      }
      return {
        ok: true,
        action: name,
        pending_order_id: pendingOrder.id,
        status: 'prepared',
        summary: pendingOrder.summary,
        order: pendingOrder.order,
      }
    }

    if (name === 'create_confirmed_petshop_order') {
      if (args.confirmation !== true || !trustedCurrentMessageConfirmation) {
        return {
          ok: false,
          action: name,
          error: 'A mensagem atual não contém confirmação explícita do cliente.',
        }
      }
      if (!pendingAtTurnStart) {
        return {
          ok: false,
          action: name,
          error: 'Não existe pedido preparado em mensagem anterior. Prepare e apresente o resumo primeiro.',
        }
      }
      if (!canPetbotCreateOrders(storeSettings, sessionForAgent)) {
        needsHuman = true
        handoffTarget = 'atendente'
        return {
          ok: false,
          action: name,
          error: 'Este contato não está habilitado para criação autônoma de pedidos.',
          handoff: true,
        }
      }

      let refreshedProducts = liveProducts
      let refreshedServices = liveServices
      let refreshedAppointments = liveAppointments
      if (pendingAtTurnStart.order.order_type === 'produto') {
        const productIds = (pendingAtTurnStart.order.items || [])
          .map((item) => cleanText(item.product_id))
          .filter(Boolean)
        refreshedProducts = await loadProductsByIds(supabase, moduleId, session.tenant_id, productIds)
        liveProducts = mergeProductsById(refreshedProducts, liveProducts)
      } else {
        refreshedServices = await refreshServiceCatalog({ required: true })
        const appointmentRefresh = await refreshAppointmentContext()
        if (!appointmentRefresh.ok) {
          return {
            ok: false,
            action: name,
            status: 'temporarily_unavailable',
            reason: 'agenda_refresh_failed',
          }
        }
        refreshedAppointments = appointmentRefresh.appointments
        liveSubscriptionBenefits = await loadCustomerSubscriptionBenefits(
          supabase,
          sessionForAgent,
          activeCustomer?.client?.id || sessionForAgent.client_id,
        )
      }

      const groundedPendingOrder = pendingAtTurnStart.order.order_type === 'produto'
        ? pendingAtTurnStart.order
        : groundPetbotServiceArgs(pendingAtTurnStart.order, serviceFacts)
      const revalidated = preparePetshopOrderDraft({
        args: groundedPendingOrder,
        products: pendingAtTurnStart.order.order_type === 'produto' ? refreshedProducts : liveProducts,
        services: refreshedServices,
        appointments: refreshedAppointments,
        subscriptionBenefits: liveSubscriptionBenefits,
        settings: storeSettings,
      })
      if (!revalidated.ok) {
        return {
          ok: false,
          action: name,
          status: 'needs_refresh',
          reason: 'operational_data_changed',
          missing_fields: revalidated.missing || [],
        }
      }

      if (revalidated.pending_order_id !== pendingAtTurnStart.id) {
        pendingOrder = {
          id: revalidated.pending_order_id,
          order: revalidated.order,
          summary: revalidated.summary,
          prepared_at: new Date().toISOString(),
        }
        return {
          ok: false,
          action: name,
          status: 'changed',
          changed: true,
          pending_order_id: pendingOrder.id,
          summary: revalidated.summary,
          order: revalidated.order,
        }
      }

      orderResult = await createConfirmedPetshopOrderViaRpc(
        supabase,
        sessionForAgent,
        storeSettings,
        {
          ...revalidated.order,
          idempotency_key: `${sessionId}:${pendingAtTurnStart.id}`,
        },
      )
      pendingOrder = null
      return {
        ok: true,
        action: name,
        status: orderResult.duplicated ? 'already_committed' : 'committed',
        sale_id: orderResult.sale_id,
        order_id: orderResult.order_id,
        appointment_id: orderResult.appointment_id,
        total: orderResult.total,
        payment_status: orderResult.payment_status,
        subscription_benefit_used: Boolean(orderResult.subscription_benefit_used),
        subscription_plan_name: orderResult.subscription_plan_name || null,
        pix_key: pendingAtTurnStart.order.payment_method === 'pix' ? storeSettings.pixKey || null : null,
        pix_holder_name: pendingAtTurnStart.order.payment_method === 'pix' ? storeSettings.pixHolderName || null : null,
      }
    }

    if (name === 'cancel_pending_petshop_order') {
      const hadPendingOrder = Boolean(pendingOrder)
      pendingOrder = null
      return {
        ok: true,
        action: name,
        status: hadPendingOrder ? 'cancelled' : 'nothing_to_cancel',
        reason: cleanText(args.reason).slice(0, 240) || null,
      }
    }

    if (name === 'send_product_image') {
      const product = (liveProducts || []).find((item) => cleanText(item.id) === cleanText(args.product_id))
      if (!product) return { ok: false, action: name, error: 'Produto não encontrado no contexto real.' }
      if (!cleanText(product.image_url)) return { ok: false, action: name, error: 'Produto sem foto aprovada no cadastro.' }
      const attachment = {
        type: 'image',
        productId: product.id,
        productName: product.name,
        imageUrl: product.image_url,
      }
      mediaMessages.push(attachment)
      return {
        ok: true,
        action: name,
        product_name: product.name,
        image_attached: true,
      }
    }

    if (name === 'handoff_to_human') {
      needsHuman = true
      handoffTarget = args.target === 'veterinaria' ? 'veterinaria' : 'atendente'
      return {
        ok: true,
        action: name,
        target: handoffTarget,
        reason: cleanText(args.reason).slice(0, 240),
      }
    }

    return { ok: false, error: `Ferramenta desconhecida: ${name}` }
  }

  const currentMessageIsConfirmation = Boolean(
    pendingAtTurnStart
    && trustedCurrentMessageConfirmation,
  )
  const currentMessageUpdatesServiceNotes = Boolean(
    pendingAtTurnStart
    && pendingAtTurnStart.order?.order_type !== 'produto'
    && explicitServiceNoteUpdate
  )
  const currentTurnSelectedSchedule = didCurrentTurnSelectPetbotSchedule({
    interpretation: llmInterpretation,
    previousFacts: previousServiceFacts,
    semantics: turnSemantics,
  })
  const transportQualificationReply = serviceOrderType === 'banho_tosa'
    ? (
      buildPetbotAvailableSlotContinuation({
        availability: operationalContext?.availability,
        facts: serviceFacts,
        settings: storeSettings,
        timezone: storeSettings.petbotTimezone,
        currentTurnSelectedSchedule,
        customerName: trustedCustomerName(),
      })
      || buildPetbotTransportQualificationReply({ facts: serviceFacts, settings: storeSettings })
    )
    : ''

  const veterinaryQualificationReply = !pendingAtTurnStart && veterinaryConsultationDeclined
    ? 'Tudo bem. Como você não deseja agendar a consulta agora, posso chamar um atendente para orientar você?'
    : !pendingAtTurnStart
      && !veterinaryConsultationAccepted
      && (veterinaryConsultationQuestion || veterinaryTreatmentAdvice)
      ? buildVeterinaryConsultationReply({
        service: resolvedServiceThisTurn,
        veterinaryRisk: effectiveVeterinaryRisk,
        treatmentAdvice: veterinaryTreatmentAdvice,
      })
      : ''
  const shouldAnswerStoreQuestion = !veterinaryQualificationReply && shouldAnswerVerifiedStoreQuestion({
    message: trimmedMessage,
    detectedIntent: intent,
    interpretedIntent: llmInterpretation?.intent,
    serviceOrderType,
    hasPendingOrder: Boolean(pendingAtTurnStart),
  })
  const verifiedStoreReply = shouldAnswerStoreQuestion
    ? buildVerifiedStoreQuestionReply({
      message: trimmedMessage,
      storeInformation: verifiedStoreInformation,
    }) || buildUnknownStoreQuestionReply({ storeInformation: verifiedStoreInformation })
    : ''
  const rationQualificationReply = !pendingAtTurnStart && !serviceOrderType
    ? buildRationQualificationReply({
      message: trimmedMessage,
      facts: productFacts,
    })
    : ''
  const productCheckoutQualificationReply = !pendingAtTurnStart && !serviceOrderType
    ? buildProductCheckoutQualificationReply({
      facts: productFacts,
      selectedProduct: selectedRecentProductCandidate,
    })
    : ''
  const shouldForceServicePreparation = !pendingAtTurnStart && shouldForcePetbotServicePreparation({
    orderType: serviceOrderType,
    customerName: trustedCustomerName(),
    facts: serviceFacts,
    resolvedService: resolvedServiceThisTurn,
    operationalContext,
  })
  const shouldForceProductPreparation = Boolean(
    !pendingAtTurnStart
    && !serviceOrderType
    && selectedRecentProductCandidate
    && Number(productFacts.quantity || 0) > 0
    && ['entrega', 'retirada'].includes(cleanText(productFacts.fulfillment_type))
    && (
      (
        cleanText(productFacts.fulfillment_type) === 'retirada'
        && cleanText(productFacts.payment_method) === 'a_combinar'
      )
      || (
        cleanText(productFacts.fulfillment_type) === 'entrega'
        && ['pix', 'dinheiro', 'cartao'].includes(cleanText(productFacts.payment_method))
      )
    ),
  )
  const rejectedAgendaReply = buildPetbotDayAgendaReply(
    operationalContext?.availability || {},
    storeSettings.petbotTimezone,
  )
  const initialToolChoice = shouldForceServicePreparation
    ? { type: 'function', function: { name: 'prepare_petshop_service_booking' } }
    : shouldForceProductPreparation
      ? { type: 'function', function: { name: 'prepare_petshop_product_order' } }
      : selectedRecentProductCandidate
        ? { type: 'function', function: { name: 'search_petshop_products' } }
        : 'auto'

  let agentResult
  if (requestedHandoffTarget) {
    needsHuman = true
    handoffTarget = requestedHandoffTarget
    agentResult = {
      reply: handoffTarget === 'veterinaria'
        ? 'Claro. Vou transferir seu atendimento para nossa equipe veterinária agora.'
        : 'Claro. Vou transferir seu atendimento para um atendente agora.',
      toolRuns: [...preloadedToolRuns, {
        name: 'handoff_to_human',
        ok: true,
        status: 'transferred',
        duration_ms: 0,
        result: {
          ok: true,
          action: 'handoff_to_human',
          target: handoffTarget,
          reason: 'Solicitação explícita do cliente.',
        },
      }],
      tokensUsed: 0,
      messages: [],
      validationRetries: 0,
      steps: 1,
      terminal: true,
      durationMs: 0,
    }
  } else if (currentMessageIsConfirmation) {
    const confirmationStartedAt = Date.now()
    const confirmationToolCall = {
      id: `confirm-${pendingAtTurnStart.id}`,
      type: 'function',
      function: {
        name: 'create_confirmed_petshop_order',
        arguments: JSON.stringify({ confirmation: true }),
      },
    }
    const confirmationResult = await executeTool(confirmationToolCall)
    const confirmationRun = {
      name: 'create_confirmed_petshop_order',
      ok: confirmationResult?.ok !== false,
      status: cleanText(confirmationResult?.status) || null,
      duration_ms: Date.now() - confirmationStartedAt,
      result: confirmationResult,
    }
    if (!['committed', 'already_committed'].includes(confirmationRun.status)) {
      throw new HttpError(409, cleanText(confirmationResult?.error) || 'Não foi possível confirmar o agendamento com os dados atuais.')
    }
    agentResult = {
      reply: buildPetbotCommittedReply({
        pendingOrder: pendingAtTurnStart,
        result: confirmationResult,
        timezone: storeSettings.petbotTimezone,
      }),
      toolRuns: [...preloadedToolRuns, confirmationRun],
      tokensUsed: 0,
      messages: [],
      validationRetries: 0,
      steps: 1,
      terminal: true,
      durationMs: Date.now() - confirmationStartedAt,
    }
  } else if (currentMessageUpdatesServiceNotes) {
    const noteUpdateStartedAt = Date.now()
    const noteUpdateToolCall = {
      id: `service-note-${pendingAtTurnStart.id}`,
      type: 'function',
      function: {
        name: 'prepare_petshop_service_booking',
        arguments: JSON.stringify({
          ...pendingAtTurnStart.order,
          notes: explicitServiceNoteUpdate,
          service_grooming_detail: explicitServiceNoteUpdate,
        }),
      },
    }
    const noteUpdateResult = await executeTool(noteUpdateToolCall)
    const noteUpdateRun = {
      name: 'prepare_petshop_service_booking',
      ok: noteUpdateResult?.ok !== false,
      status: cleanText(noteUpdateResult?.status) || null,
      duration_ms: Date.now() - noteUpdateStartedAt,
      result: noteUpdateResult,
    }
    if (!noteUpdateRun.ok || noteUpdateRun.status !== 'prepared') {
      throw new HttpError(409, 'Não foi possível atualizar a observação do agendamento com os dados atuais.')
    }
    agentResult = {
      reply: noteUpdateResult.summary,
      toolRuns: [...preloadedToolRuns, noteUpdateRun],
      tokensUsed: 0,
      messages: [],
      validationRetries: 0,
      steps: 1,
      terminal: true,
      durationMs: Date.now() - noteUpdateStartedAt,
    }
  } else if (serviceAddonReply) {
    agentResult = {
      reply: serviceAddonReply,
      toolRuns: preloadedToolRuns,
      tokensUsed: 0,
      messages: [],
      validationRetries: 0,
      steps: 0,
      terminal: true,
      durationMs: 0,
    }
  } else if (rejectedAgendaReply) {
    agentResult = {
      reply: rejectedAgendaReply,
      toolRuns: preloadedToolRuns,
      tokensUsed: 0,
      messages: [],
      validationRetries: 0,
      steps: 0,
      terminal: true,
      durationMs: 0,
    }
  } else if (transportQualificationReply) {
    agentResult = {
      reply: transportQualificationReply,
      toolRuns: preloadedToolRuns,
      tokensUsed: 0,
      messages: [],
      validationRetries: 0,
      steps: 0,
      terminal: true,
      durationMs: 0,
    }
  } else if (veterinaryQualificationReply) {
    agentResult = {
      reply: veterinaryQualificationReply,
      toolRuns: preloadedToolRuns,
      tokensUsed: 0,
      messages: [],
      validationRetries: 0,
      steps: 0,
      terminal: true,
      durationMs: 0,
    }
  } else if (verifiedStoreReply) {
    agentResult = {
      reply: verifiedStoreReply,
      toolRuns: preloadedToolRuns,
      tokensUsed: 0,
      messages: [],
      validationRetries: 0,
      steps: 0,
      terminal: true,
      durationMs: 0,
    }
  } else if (rationQualificationReply) {
    agentResult = {
      reply: rationQualificationReply,
      toolRuns: preloadedToolRuns,
      tokensUsed: 0,
      messages: [],
      validationRetries: 0,
      steps: 0,
      terminal: true,
      durationMs: 0,
    }
  } else if (productCheckoutQualificationReply) {
    agentResult = {
      reply: productCheckoutQualificationReply,
      toolRuns: preloadedToolRuns,
      tokensUsed: 0,
      messages: [],
      validationRetries: 0,
      steps: 0,
      terminal: true,
      durationMs: 0,
    }
  } else agentResult = await runPetbotAgent({
    model: runtimeConfig.modelName,
    temperature: runtimeConfig.temperature,
    systemPrompt,
    history,
    message: trimmedMessage,
    tools: PETBOT_AGENT_TOOLS,
    callModel: (params) => callOpenAIWithTimeout(params, serverEnv.openAiTimeoutMs),
    executeTool,
    initialToolChoice,
    // A one-field JSON response format added an unnecessary compatibility
    // surface to multi-turn function calling. Tool arguments remain strict;
    // customer-facing replies are plain text and validated server-side.
    responseFormat: null,
    parseReply: parsePetbotAgentReply,
    initialToolRuns: preloadedToolRuns,
    fallbackReply: ({ toolRuns }) => buildPetbotLocalRecoveryReply({
      facts: serviceFacts,
      toolRuns,
      resolvedService: resolvedServiceThisTurn,
      settings: storeSettings,
      timezone: storeSettings.petbotTimezone,
    }),
    resolveTerminalReply: ({ toolName, result }) => {
      if (
        ['prepare_petshop_product_order', 'prepare_petshop_service_booking'].includes(toolName)
        && cleanText(result?.status) === 'prepared'
      ) {
        return cleanText(result?.summary)
      }
      if (toolName !== 'create_confirmed_petshop_order') return ''
      if (!['committed', 'already_committed'].includes(cleanText(result?.status))) return ''
      return buildPetbotCommittedReply({
        pendingOrder: pendingAtTurnStart,
        result,
        timezone: storeSettings.petbotTimezone,
      })
    },
    validateReply: ({ reply: draftReply, toolRuns }) => {
      const operationalValidation = validatePetbotOperationalReply({
        reply: draftReply,
        toolRuns,
        pendingOrder,
        orderResult,
        timezone: storeSettings.petbotTimezone,
      })
      const conversationValidation = validatePetbotConversationReply({
        reply: draftReply,
        facts: serviceFacts,
        pendingOrder,
        currentMessageIsConfirmation,
        toolRuns,
        serviceContext: Boolean(
          serviceOrderType
          || (pendingOrder?.order?.order_type && pendingOrder.order.order_type !== 'produto'),
        ),
        productContext: Boolean(
          isProductConversation
          || pendingOrder?.order?.order_type === 'produto'
          || selectedRecentProductCandidate,
        ),
      })
      const problems = [
        ...(operationalValidation.problems || []),
        ...(conversationValidation.problems || []),
      ]
      if (!problems.length) return { ok: true }

      return {
        ok: false,
        instruction: [
          'A resposta anterior contradiz os dados confiáveis ou repetiu uma pergunta já respondida.',
          `Problemas: ${problems.join('; ')}.`,
          'Reescreva naturalmente usando o estado confiável e os resultados das ferramentas. Pergunte somente um fato que realmente esteja ausente.',
          'Se os dados do serviço estiverem completos, chame prepare_petshop_service_booking antes de responder e apresente apenas o resumo retornado com uma única pergunta de confirmação.',
          'Nunca pergunte tipo de pelo ou pelagem e não peça novamente raça, peso, data ou horário já conhecidos.',
          'Não mencione validações, ferramentas, regras internas ou este aviso.',
        ].join('\n'),
      }
    },
  })

  const rawReply = cleanText(agentResult.reply)
  if (!rawReply) throw new HttpError(502, 'The PetBot agent response came back empty.')
  const reply = prependPetbotConversationOpening({
    reply: rawReply,
    message: trimmedMessage,
    history,
    customerName: trustedCustomerName(),
  })

  // Tool calls may extract a customer fact that the lightweight interpreter
  // omitted. Persist the final structured state after the autonomous loop, but
  // never let a profile write failure replace a valid customer response.
  const finalProfilePatch = {
    customer_name: cleanText(llmInterpretation?.customer_name) || cleanText(updatedCustomerName),
    pet_name: cleanText(serviceFacts.pet_name),
    species: cleanText(serviceFacts.species),
    breed: cleanText(serviceFacts.breed),
    weight_kg: isProductConversation
      ? null
      : (Number(serviceFacts.weight_kg || 0) || null),
    coat_type: cleanText(serviceFacts.coat_type),
    symptom: cleanText(serviceFacts.symptom),
    address: cleanText(serviceFacts.service_transport_address),
    neighborhood: cleanText(serviceFacts.service_transport_neighborhood),
    city: cleanText(serviceFacts.service_transport_city),
    address_reference: cleanText(serviceFacts.service_transport_reference),
  }
  if (Object.values(finalProfilePatch).some(Boolean)) {
    try {
      const persistedCustomer = await ensureCustomerProfile(supabase, sessionForAgent, finalProfilePatch)
      activeCustomer = persistedCustomer
      updatedCustomerName = normalizeCustomerDisplayName(persistedCustomer.client?.name) || updatedCustomerName
    } catch (error) {
      logger.warn('PetBot final fact persistence failed', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // The transactional RPC updates chat_sessions.last_message_at itself. Keep
  // the concurrency token in sync with that intentional write; otherwise the
  // compare-and-swap below mistakes our own successful commit for a newer
  // customer message and drops the terminal confirmation with HTTP 409.
  let concurrencySession = {
    context: sessionForAgent.context,
    last_message_at: session.last_message_at,
  }
  if (orderResult) {
    const { data: sessionAfterTransaction, error: sessionRefreshError } = await supabase
      .from('chat_sessions')
      .select('context, last_message_at')
      .eq('id', sessionId)
      .maybeSingle()

    if (sessionRefreshError || !sessionAfterTransaction) {
      throw new HttpError(500, 'Unable to refresh PetBot session after order transaction.')
    }
    concurrencySession = sessionAfterTransaction
  }

  const botSentAt = new Date().toISOString()
  const existingContext = {
    ...parseJsonObject(sessionForAgent.context),
    ...parseJsonObject(concurrencySession.context),
  }
  const nextContext = {
    ...existingContext,
    ...(orderResult ? {
      last_sale_id: orderResult.sale_id,
      last_order_id: orderResult.order_id || null,
      last_appointment_id: orderResult.appointment_id || null,
      last_payment_status: orderResult.payment_status || null,
      last_total: Number(orderResult.total || 0),
    } : {}),
    petbot_agent: {
      version: 3,
      engine_version: 'petbot_agent_v3',
      updatedAt: botSentAt,
      pending_order: pendingOrder,
      facts: serviceFacts,
      product_facts: orderResult ? {} : productFacts,
      last_product_candidates: orderResult
        ? null
        : {
          fact_signature: currentProductFactsSignature,
          selected_product_id: selectedRecentProductCandidate?.id || null,
          products: lastProductCandidates,
        },
      resolved_service: resolvedServiceThisTurn
        ? {
          fact_signature: petbotServiceFactsSignature(serviceFacts),
          service: resolvedServiceThisTurn,
        }
        : null,
      last_action: agentResult.recovered ? 'agent_recovery' : (agentResult.toolRuns.at(-1)?.name || 'reply'),
      last_turn_semantics: currentMessageUpdatesServiceNotes
        ? {
          ...(turnSemantics || {}),
          action: 'correct',
          target: 'service_notes',
          cancels_pending_order: false,
          confirms_pending_order: false,
          confirmation_decision_made: false,
        }
        : turnSemantics,
      last_tools: agentResult.toolRuns.map((run) => ({ name: run.name, ok: run.ok, status: run.status || null })),
      needs_human: needsHuman,
      handoff_target: handoffTarget,
      order_saved: Boolean(orderResult),
    },
  }

  const sessionPatch = {
    intent,
    context: nextContext,
    ...(updatedCustomerName ? { customer_name: updatedCustomerName } : {}),
    ...(needsHuman ? { status: 'human' } : {}),
    last_message_at: botSentAt,
  }

  let sessionUpdate = supabase
    .from('chat_sessions')
    .update(sessionPatch)
    .eq('id', sessionId)
  const expectedLastMessageAt = cleanText(concurrencySession.last_message_at)
  if (expectedLastMessageAt) {
    sessionUpdate = sessionUpdate.eq('last_message_at', expectedLastMessageAt)
  }
  const { data: updatedSession, error: sessionUpdateError } = await sessionUpdate
    .select('id, context')
    .maybeSingle()

  if (!sessionUpdateError && !updatedSession && expectedLastMessageAt) {
    const staleError = new HttpError(409, 'A newer customer message superseded this PetBot turn.')
    staleError.code = 'PETBOT_STALE_TURN'
    throw staleError
  }
  if (sessionUpdateError || !updatedSession || !hasPetbotState(updatedSession.context)) {
    throw new HttpError(500, `Unable to persist PetBot agent state${sessionUpdateError?.message ? `: ${sessionUpdateError.message}` : '.'}`)
  }

  const lunaStateAfter = operationStateFromLegacyContext(nextContext, {
    tenantId: session.tenant_id,
    sessionId,
    moduleId,
    customerId: activeCustomer?.client?.id || session.client_id,
    customerName: normalizeCustomerDisplayName(updatedCustomerName)
      || normalizeCustomerDisplayName(session.customer_name),
    intent,
  })
  const lunaSemanticEvent = deriveLegacyOperationEvent({
    message: trimmedMessage,
    turnSemantics,
    orderResult,
    needsHuman,
    pendingBefore: pendingAtTurnStart,
    pendingAfter: pendingOrder,
    toolRuns: agentResult.toolRuns,
  })
  const lunaVerification = verifyOperationTurn({
    stateBefore: lunaStateBefore,
    stateAfter: lunaStateAfter,
    orderResult,
    reply,
    toolRuns: agentResult.toolRuns,
  })
  const lunaTrace = completeLunaTurnTrace(lunaTraceStart, {
    stateAfter: lunaStateAfter,
    semanticEvent: lunaSemanticEvent,
    toolRuns: agentResult.toolRuns,
    outcome: orderResult ? 'saved' : (needsHuman ? 'handoff' : 'ok'),
    verifier: lunaVerification,
  })
  if (!lunaVerification.ok) {
    logger.warn('Luna passive verifier detected an inconsistent turn', {
      traceId: lunaTrace.trace_id,
      sessionId,
      issues: lunaVerification.issues.map((entry) => entry.code),
    })
  }

  const lunaShadow = runBathShadowTurn({
    sessionId,
    stateBefore: lunaStateBefore,
    stateAfter: lunaStateAfter,
    semanticEvent: lunaSemanticEvent,
    reply,
    genericTransportRequested: explicitTransportMode === 'motodog',
    orderResult,
    availability: operationalContext?.availability || null,
    currentTurnSelectedSchedule,
  })
  if (lunaShadow && !lunaShadow.agreement) {
    logger.warn('Luna bath shadow detected a legacy divergence', {
      traceId: lunaTrace.trace_id,
      sessionId,
      differences: lunaShadow.differences.map((entry) => entry.code),
    })
  }

  const primaryImage = mediaMessages.find((item) => item.type === 'image' && item.imageUrl)
  const { data: savedReply, error: replyInsertError } = await supabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      role: 'assistant',
      content: reply,
      metadata: {
        source: options.source || 'dashboard_simulation',
        ...(options.assistantMetadata || {}),
        ...(primaryImage ? {
          image_url: primaryImage.imageUrl,
          media_attachments: mediaMessages,
        } : {}),
        petbot_agent: {
          engine_version: 'petbot_agent_v3',
          model: runtimeConfig.modelName,
          tool_calls: agentResult.toolRuns.map((run) => ({ name: run.name, ok: run.ok, status: run.status || null, duration_ms: run.duration_ms || 0 })),
          steps: agentResult.steps || 0,
          validation_retries: agentResult.validationRetries || 0,
          recovered: Boolean(agentResult.recovered),
          terminal: Boolean(agentResult.terminal),
          recovery_reason: cleanText(agentResult.recoveryReason).slice(0, 160) || null,
          duration_ms: agentResult.durationMs || 0,
          pending_order_id: pendingOrder?.id || null,
          order_saved: Boolean(orderResult),
          needs_human: needsHuman,
          handoff_target: handoffTarget,
          turn_semantics: turnSemantics,
          luna_trace: lunaTrace,
          ...(lunaShadow ? { luna_shadow: lunaShadow } : {}),
        },
      },
      tokens_used: agentResult.tokensUsed,
      sent_at: botSentAt,
    })
    .select('id, role, content, metadata, tokens_used, sent_at')
    .single()

  if (replyInsertError) throw new HttpError(500, 'Unable to save assistant response.')

  await recordPetbotEvent(supabase, {
    tenant_id: session.tenant_id,
    module_id: moduleId,
    session_id: sessionId,
    message_id: savedReply.id,
    event_type: orderResult ? 'order_saved' : (needsHuman ? 'handoff' : 'turn'),
    engine_version: 'petbot_agent_v3',
    intent,
    action: agentResult.toolRuns.at(-1)?.name || 'reply',
    outcome: orderResult ? 'saved' : (needsHuman ? 'handoff' : 'ok'),
    handoff_target: needsHuman ? handoffTarget : null,
    metadata: {
      tools: agentResult.toolRuns.map((run) => ({ name: run.name, ok: run.ok, status: run.status || null, duration_ms: run.duration_ms || 0 })),
      steps: agentResult.steps || 0,
      validation_retries: agentResult.validationRetries || 0,
      recovered: Boolean(agentResult.recovered),
      recovery_reason: cleanText(agentResult.recoveryReason).slice(0, 160) || null,
      duration_ms: agentResult.durationMs || 0,
      pending_order_id: pendingOrder?.id || null,
      source: options.source || 'dashboard_simulation',
      turn_semantics: turnSemantics,
      luna_trace: lunaTrace,
      ...(lunaShadow ? { luna_shadow: lunaShadow } : {}),
    },
  })

  logger.info('Chat response generated', {
    sessionId,
    moduleId,
    intent,
    tokens: agentResult.tokensUsed,
    guarded: false,
    engine: 'petbot_agent_v3',
    dialogue_action: turnSemantics?.action || null,
    dialogue_target: turnSemantics?.target || null,
    semantic_confidence: Number(turnSemantics?.confidence || 0),
  })

  return { reply, savedMessage: savedReply }
}

function isPetbotServiceConversation(intent = '', message = '', history = []) {
  if (['banho_tosa', 'veterinaria'].includes(cleanText(intent))) return true
  const text = [...(history || []).slice(-6).map((entry) => cleanText(entry.content)), cleanText(message)]
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  return /\b(banho|tosa|agendar|agendamento|consulta|vacina|veterin)\b/.test(text)
}

async function respondWithPetbotRecoverableFailure({
  supabase,
  session,
  sessionId,
  moduleId,
  intent,
  options,
  error,
  message = '',
  history = [],
  customerName = '',
}) {
  const serviceConversation = isPetbotServiceConversation(intent)
  const rawReply = serviceConversation
    ? 'Desculpe, não consegui concluir a consulta dos serviços e da agenda agora. As informações que você enviou continuam na conversa; posso tentar novamente sem você repetir os dados.'
    : 'Desculpe, não consegui concluir a consulta agora. As informações que você enviou continuam na conversa; posso tentar novamente sem você repetir os dados.'
  const reply = prependPetbotConversationOpening({
    reply: rawReply,
    message,
    history,
    customerName,
  })
  const botSentAt = new Date().toISOString()
  const existingContext = parseJsonObject(session.context)
  const previousAgentState = existingContext.petbot_agent && typeof existingContext.petbot_agent === 'object'
    ? existingContext.petbot_agent
    : {}
  const nextContext = {
    ...existingContext,
    petbot_agent: {
      ...previousAgentState,
      version: 3,
      engine_version: 'petbot_agent_v3',
      updatedAt: botSentAt,
      pending_order: previousAgentState.pending_order || null,
      last_action: 'recoverable_agent_error',
      last_tools: [],
      needs_human: false,
      handoff_target: null,
      order_saved: false,
      failure: cleanText(error instanceof Error ? error.message : error).slice(0, 300),
    },
  }

  let recoveryUpdate = supabase
    .from('chat_sessions')
    .update({ context: nextContext, last_message_at: botSentAt })
    .eq('id', sessionId)
  if (cleanText(session.last_message_at)) {
    recoveryUpdate = recoveryUpdate.eq('last_message_at', session.last_message_at)
  }
  const { data: recoveredSession, error: sessionError } = await recoveryUpdate
    .select('id')
    .maybeSingle()
  if (!sessionError && !recoveredSession && cleanText(session.last_message_at)) {
    const staleError = new HttpError(409, 'A newer customer message superseded this PetBot recovery turn.')
    staleError.code = 'PETBOT_STALE_TURN'
    throw staleError
  }
  if (sessionError) throw new HttpError(500, 'Unable to persist recoverable PetBot error.')

  const { data: savedReply, error: replyError } = await supabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      role: 'assistant',
      content: reply,
      metadata: {
        source: options.source || 'dashboard_simulation',
        engine_version: 'petbot_agent_v3',
        recoverable_agent_error: true,
        ...(options.assistantMetadata || {}),
      },
      tokens_used: 0,
      sent_at: botSentAt,
    })
    .select('id, role, content, metadata, tokens_used, sent_at')
    .single()
  if (replyError) throw new HttpError(500, 'Unable to save recoverable PetBot reply.')

  await recordPetbotEvent(supabase, {
    tenant_id: session.tenant_id,
    module_id: moduleId,
    session_id: sessionId,
    message_id: savedReply.id,
    event_type: 'agent_error',
    engine_version: 'petbot_agent_v3',
    intent,
    action: 'recoverable_agent_error',
    outcome: 'retry_requested',
    handoff_target: null,
    metadata: {
      source: options.source || 'dashboard_simulation',
      error: cleanText(error instanceof Error ? error.message : error).slice(0, 300),
      openai: error?.openai || null,
    },
  })

  return { reply, savedMessage: savedReply }
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
    .select('id, module_id, tenant_id, customer_phone, customer_name, status, client_id, context, csat_score, last_message_at')
    .eq('id', sessionId)
    .maybeSingle()

  if (sessionError || !session) {
    throw new HttpError(404, 'Chat session not found.')
  }

  if (!session.tenant_id) {
    throw new HttpError(500, 'Chat session is missing tenant_id.')
  }

  const rating = parseRating(trimmedMessage)
  if (rating !== null && hasConfirmedOrderContext(session)) {
    if (!options.skipUserPersistence) {
      await insertUserMessages(supabase, sessionId, normalizeDashboardUserMessages(trimmedMessage, options))
    }
    await saveSatisfactionRating(supabase, sessionId, rating)
    const reply = `Obrigado pela nota ${rating}! Atendimento encerrado.`
    const botSentAt = new Date().toISOString()
    const { data: savedReply, error: replyInsertError } = await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        role: 'assistant',
        content: reply,
        metadata: {
          source: options.source || 'dashboard_simulation',
          csat_score: rating,
          ...(options.assistantMetadata || {}),
        },
        tokens_used: 0,
        sent_at: botSentAt,
      })
      .select('id, role, content, metadata, tokens_used, sent_at')
      .single()

    if (replyInsertError) {
      throw new HttpError(500, 'Unable to save assistant response.')
    }

    return { reply, savedMessage: savedReply }
  }

  if (hasConfirmedOrderContext(session) && await updateCustomerRegistrationFromMessage(supabase, session, trimmedMessage)) {
    if (!options.skipUserPersistence) {
      await insertUserMessages(supabase, sessionId, normalizeDashboardUserMessages(trimmedMessage, options))
    }
    const reply = 'Recebi os dados e atualizei o cadastro. Obrigado!\n\nDe 0 a 10, como avalia o atendimento?'
    const botSentAt = new Date().toISOString()
    const { data: savedReply, error: replyInsertError } = await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        role: 'assistant',
        content: reply,
        metadata: {
          source: options.source || 'dashboard_simulation',
          registration_update: true,
          ...(options.assistantMetadata || {}),
        },
        tokens_used: 0,
        sent_at: botSentAt,
      })
      .select('id, role, content, metadata, tokens_used, sent_at')
      .single()

    if (replyInsertError) {
      throw new HttpError(500, 'Unable to save assistant response.')
    }

    return { reply, savedMessage: savedReply }
  }

  if (session.status === 'human' && !options.allowBotWhenHuman) {
    throw new HttpError(409, 'Chat is currently assigned to a human agent.')
  }

  const moduleId = String(session.module_id || '').trim().toLowerCase()
  if (!SUPPORTED_MODULES.has(moduleId)) {
    throw new HttpError(400, `Unsupported module_id "${session.module_id}".`)
  }

  const intent = detectIntent(trimmedMessage)
  const userMessages = normalizeDashboardUserMessages(trimmedMessage, options)
  const currentMessageIds = new Set(userMessages.map((entry) => entry.id).filter(Boolean))
  const history = (await loadRecentMessages(supabase, sessionId)).filter((entry) => (
    !currentMessageIds.has(cleanText(entry?.metadata?.client_message_id || entry?.id))
  ))
  let concurrencyLastMessageAt = cleanText(session.last_message_at)
  if (!options.skipUserPersistence) {
    // Persist the customer's input before any LLM or catalog work. This is the
    // serialization boundary: a newer request advances last_message_at while
    // an older turn is still running, so its compare-and-swap cannot publish a
    // stale reply or overwrite the newer context.
    await insertUserMessages(supabase, sessionId, userMessages)

    const { data: sessionAfterUserPersistence, error: sessionRefreshError } = await supabase
      .from('chat_sessions')
      .select('last_message_at')
      .eq('id', sessionId)
      .maybeSingle()

    if (sessionRefreshError || !sessionAfterUserPersistence) {
      throw new HttpError(500, 'Unable to refresh chat session after saving customer message.')
    }
    concurrencyLastMessageAt = cleanText(sessionAfterUserPersistence.last_message_at)
  }

  const sessionForTurn = {
    ...session,
    last_message_at: concurrencyLastMessageAt || session.last_message_at,
  }
  const recoveredContext = recoverPetbotContextFromHistory(session.context || {}, sessionForTurn, history)
  const sessionForAgent = { ...sessionForTurn, context: recoveredContext }
  const [storeSettings, runtimeConfig, customer] = await Promise.all([
    loadStoreSettings(supabase, moduleId, session.tenant_id),
    loadBotRuntimeConfig(supabase, session.tenant_id, moduleId),
    ensureCustomerProfile(supabase, sessionForAgent),
  ])
  const customInstructions = [storeSettings.botPrompt, runtimeConfig.systemPrompt]
    .filter(Boolean)
    .join('\n\n')
  const llmInterpretation = await interpretPetbotMessageWithLlm({
    apiKey: serverEnv.openAiApiKey,
    model: runtimeConfig.modelName,
    temperature: runtimeConfig.temperature,
    timeoutMs: serverEnv.openAiTimeoutMs,
    message: trimmedMessage,
    history,
    state: recoveredContext,
    customerContext: buildCustomerContext(customer),
    mediaContext: options.mediaContext || '',
    customInstructions,
  })
  const recoveredAgentContext = parseJsonObject(recoveredContext)?.petbot_agent || {}
  const turnSemantics = resolvePetbotTurnSemantics({
    interpretation: llmInterpretation || {},
    hasPendingOrder: Boolean(getPendingAgentOrder(recoveredContext)),
  })
  const repeatsCompletedConfirmation = Boolean(
    hasConfirmedOrderContext(sessionForAgent)
    && !getPendingAgentOrder(recoveredContext)
    && !turnSemantics.negated
    && (
      isExplicitPetbotConfirmation(trimmedMessage)
      || (
        turnSemantics.confident
        && turnSemantics.action === 'affirm'
        && ['final_confirmation', 'other', ''].includes(cleanText(turnSemantics.target))
      )
    )
  )
  if (repeatsCompletedConfirmation) {
    return respondToAlreadyCommittedConfirmation({
      supabase,
      session: sessionForAgent,
      expectedLastMessageAt: concurrencyLastMessageAt,
      options,
      turnSemantics,
    })
  }
  const productConversationText = buildCatalogSearchText(history, trimmedMessage)
  const recoveredProductFacts = recoverProductQueryFactsFromHistory({
    facts: recoveredAgentContext.product_facts || {},
    history,
    serviceFacts: recoveredAgentContext.facts || recoveredAgentContext.explicit_facts || {},
  })
  const initialProductFacts = mergeProductQueryFacts({
    interpretation: llmInterpretation || {},
    previousFacts: recoveredProductFacts,
    serviceFacts: recoveredAgentContext.facts || recoveredAgentContext.explicit_facts || {},
    message: trimmedMessage,
    semantics: turnSemantics,
  })
  const catalogSearchText = buildPetbotSearchText(
    buildInterpretedPetbotSearchText(productConversationText, {
      ...(llmInterpretation || {}),
      ...initialProductFacts,
    }),
    recoveredContext,
  )
  const [products, services, appointments] = await Promise.all([
    loadProducts(supabase, moduleId, session.tenant_id, catalogSearchText, initialProductFacts),
    loadPetshopServices(supabase, moduleId, session.tenant_id),
    loadAppointments(supabase, moduleId, session.tenant_id, storeSettings),
  ])

  try {
    return await respondWithPetbotAgent({
      supabase,
      sessionId,
      trimmedMessage,
      options,
      session: sessionForTurn,
      sessionForAgent,
      moduleId,
      intent,
      history,
      storeSettings,
      runtimeConfig,
      customer,
      llmInterpretation,
      turnSemantics,
      initialProductFacts,
      products,
      services,
      appointments,
      customInstructions,
    })
  } catch (error) {
    if (error?.code === 'PETBOT_STALE_TURN') throw error
    const pendingOrderAtFailure = getPendingAgentOrder(recoveredContext)
    const confirmationAtFailure = Boolean(
      pendingOrderAtFailure
      && (
        isExplicitPetbotConfirmation(trimmedMessage)
        || turnSemantics?.confirms_pending_order
      )
    )
    if (confirmationAtFailure) {
      const reconciled = await reconcilePetbotCommittedConfirmation({
        supabase,
        session: sessionForAgent,
        pendingOrder: pendingOrderAtFailure,
        options,
        turnSemantics,
      })
      if (reconciled) return reconciled
    }
    logger.warn('PetBot agent failed', {
      sessionId,
      moduleId,
      error: error instanceof Error ? error.message : String(error),
    })
    return respondWithPetbotRecoverableFailure({
      supabase,
      session: sessionForAgent,
      sessionId,
      moduleId,
      intent,
      options,
      error,
      message: trimmedMessage,
      history,
      customerName: cleanText(customer?.client?.name) || cleanText(sessionForAgent.customer_name),
    })
  }
}
