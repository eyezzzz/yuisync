import { clean, normalizeText, tokenize } from './text.js'

const PRODUCT_STOP_WORDS = new Set([
  'quero',
  'queria',
  'preciso',
  'comprar',
  'produto',
  'produtos',
  'para',
  'pra',
  'pro',
  'uma',
  'um',
  'esse',
  'essa',
  'mesmo',
  'mesma',
  'pode',
  'ser',
  'tem',
  'voces',
  'vcs',
  'tambem',
  'também',
  'adicionar',
])

const GENERIC_SELECTION_TERMS = new Set([
  'racao',
  'petisco',
  'produto',
  'produtos',
  'cao',
  'caes',
  'gato',
  'gatos',
  'shih',
  'tzu',
])

export function isSellableProduct(product) {
  const name = clean(product?.name)
  return Boolean(product?.active)
    && name.toLowerCase() !== 'produto importado'
    && Number(product?.stock_quantity || 0) > 0
    && Number(product?.price || 0) > 0
}

export async function loadCatalog(supabase, { tenantId, moduleId }) {
  let query = supabase
    .from('products')
    .select('id, name, category, description, species_target, price, stock_quantity, active')
    .eq('module_id', moduleId)
    .eq('active', true)

  if (tenantId) query = query.eq('tenant_id', tenantId)

  const { data, error } = await query
    .order('stock_quantity', { ascending: false })
    .limit(200)

  if (error) {
    throw new Error(`Nao foi possivel carregar o catalogo: ${error.message}`)
  }

  return (data || []).filter(isSellableProduct)
}

function productSearchText(product) {
  return normalizeText([
    product.name,
    product.category,
    product.description,
    product.species_target,
  ].filter(Boolean).join(' '))
}

function productTerms(product) {
  return tokenize(productSearchText(product)).filter((term) => term.length >= 2)
}

function queryTerms(message) {
  return tokenize(message)
    .filter((term) => term.length >= 2 && !PRODUCT_STOP_WORDS.has(term))
    .slice(0, 8)
}

function scoreProduct(product, terms, orderSession) {
  const searchable = productSearchText(product)
  const category = normalizeText(product.category)
  const name = normalizeText(product.name)
  let score = 0
  const reasons = []

  for (const term of terms) {
    if (name.includes(term)) {
      score += 8
      reasons.push(`nome:${term}`)
    }
    if (category.includes(term)) {
      score += 5
      reasons.push(`categoria:${term}`)
    }
    if (searchable.includes(term)) {
      score += 3
      reasons.push(`texto:${term}`)
    }
  }

  if (category.includes('racao') && terms.some((term) => ['racao', 'mini', 'puppy', 'junior', 'adulto', 'shi', 'shih', 'tzu'].includes(term))) {
    score += 3
    reasons.push('categoria-racao')
  }

  const suggestedIndex = (orderSession.lastSuggestedProducts || []).findIndex((item) => item.id === product.id)
  if (suggestedIndex >= 0) {
    score += 10 - suggestedIndex
    reasons.push('sugestao-recente')
  }

  if (orderSession.lastFocusedProduct?.id === product.id) {
    score += 4
    reasons.push('produto-em-foco')
  }

  score += Math.min(Number(product.stock_quantity || 0), 20) / 20
  const confidence = Math.min(0.99, score / 22)
  return { score, confidence, reasons }
}

function resolveNumericChoice(message, orderSession) {
  const match = normalizeText(message).match(/\b(?:opcao|opção)?\s*(\d{1,2})\b/)
  if (!match) return null
  const index = Number(match[1]) - 1
  const product = orderSession.lastSuggestedProducts?.[index]
  return product || null
}

function isContextualProductConfirmation(message) {
  const text = normalizeText(message)
  return /^(sim|ok|beleza|fechado|isso|pode ser|esse|essa|essa mesma|esse mesmo|pode|confirmo)$/i.test(text)
    || /\b(pode ser|esse mesmo|essa mesma|vou levar|manda esse|manda essa)\b/.test(text)
}

export function matchProduct({ message, catalog, orderSession, slots }) {
  const numericChoice = resolveNumericChoice(message, orderSession)
  if (numericChoice) {
    const full = catalog.find((product) => product.id === numericChoice.id) || numericChoice
    return {
      product: full,
      confidence: 0.96,
      reason: 'numeric_choice',
      candidates: [full],
    }
  }

  if ((slots?.signals?.contextualConfirm || isContextualProductConfirmation(message)) && orderSession.lastFocusedProduct) {
    const full = catalog.find((product) => product.id === orderSession.lastFocusedProduct.id) || orderSession.lastFocusedProduct
    return {
      product: full,
      confidence: 0.9,
      reason: 'contextual_confirmation',
      candidates: [full],
    }
  }

  const terms = queryTerms(message)
  if (!terms.length) {
    return {
      product: null,
      confidence: 0,
      reason: 'no_terms',
      candidates: [],
    }
  }

  const ranked = catalog
    .map((product) => {
      const score = scoreProduct(product, terms, orderSession)
      return { product, ...score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]
  const candidates = ranked.slice(0, 5).map((item) => item.product)

  if (!best) {
    return {
      product: null,
      confidence: 0,
      reason: 'no_match',
      candidates: [],
    }
  }

  const exactNameTerm = productTerms(best.product).some((term) => (
    terms.includes(term)
    && term.length >= 3
    && !GENERIC_SELECTION_TERMS.has(term)
  ))
  const hasSpecificTerm = terms.some((term) => term.length >= 3 && !GENERIC_SELECTION_TERMS.has(term))
  const confidence = exactNameTerm && hasSpecificTerm
    ? Math.max(best.confidence, 0.72)
    : Math.min(best.confidence, 0.62)

  return {
    product: best.product,
    confidence,
    reason: best.reasons.join(',') || 'ranked_match',
    candidates,
  }
}

export function suggestProducts(message, catalog, orderSession) {
  const match = matchProduct({ message, catalog, orderSession })
  if (match.candidates.length) return match.candidates.slice(0, 4)

  const terms = queryTerms(message)
  const wantsRation = terms.some((term) => ['racao', 'mini', 'puppy', 'junior', 'shih', 'tzu'].includes(term))

  return catalog
    .filter((product) => {
      if (!wantsRation) return true
      return normalizeText(product.category).includes('racao') || normalizeText(product.name).includes('racao')
    })
    .sort((a, b) => clean(a.name).localeCompare(clean(b.name), 'pt-BR'))
    .slice(0, 4)
}
