const DEFAULT_LIMIT = 8
const MAX_LIMIT = 10

function clean(value = '') {
  return String(value ?? '').trim()
}

function clampLimit(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)))
}

function isHttpUrl(value = '') {
  return /^https?:\/\/\S+$/i.test(clean(value))
}

function normalizeSearchText(value = '') {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function firstEnv(env, names) {
  for (const name of names) {
    const value = clean(env?.[name])
    if (value) return value
  }
  return ''
}

export function buildProductImageQuery(input = {}) {
  const barcode = clean(input.barcode).replace(/\D/g, '')
  const name = normalizeSearchText(input.name)
  const category = normalizeSearchText(input.category)
  const brand = normalizeSearchText(input.brand)

  const parts = []
  if (barcode.length >= 8) parts.push(barcode)
  if (brand) parts.push(brand)
  if (name) parts.push(name)
  if (category) parts.push(category)
  parts.push('produto petshop embalagem')

  return [...new Set(parts.filter(Boolean))].join(' ')
}

function normalizeGoogleItems(items = []) {
  return items
    .map((item) => ({
      title: clean(item.title),
      imageUrl: clean(item.link),
      thumbnailUrl: clean(item.image?.thumbnailLink || item.link),
      sourceUrl: clean(item.image?.contextLink || item.displayLink),
      provider: 'google_cse',
    }))
    .filter((item) => isHttpUrl(item.imageUrl))
}

export async function searchProductImageCandidates(input = {}, env = process.env) {
  const limit = clampLimit(input.limit)
  const query = buildProductImageQuery(input)

  if (!query) {
    return {
      configured: false,
      provider: 'none',
      query,
      suggestions: [],
      message: 'Informe nome, EAN/codigo de barras ou categoria para buscar imagens.',
    }
  }

  const googleApiKey = firstEnv(env, ['GOOGLE_IMAGE_SEARCH_API_KEY', 'GOOGLE_CUSTOM_SEARCH_API_KEY'])
  const googleCx = firstEnv(env, ['GOOGLE_IMAGE_SEARCH_CX', 'GOOGLE_CUSTOM_SEARCH_CX'])

  if (!googleApiKey || !googleCx) {
    return {
      configured: false,
      provider: 'google_cse',
      query,
      suggestions: [],
      message: 'Busca de imagens ainda sem credenciais. Configure GOOGLE_IMAGE_SEARCH_API_KEY e GOOGLE_IMAGE_SEARCH_CX, ou cole uma URL manualmente.',
    }
  }

  const url = new URL('https://www.googleapis.com/customsearch/v1')
  url.searchParams.set('key', googleApiKey)
  url.searchParams.set('cx', googleCx)
  url.searchParams.set('q', query)
  url.searchParams.set('searchType', 'image')
  url.searchParams.set('safe', 'active')
  url.searchParams.set('num', String(limit))
  url.searchParams.set('imgType', 'photo')

  const response = await fetch(url)
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const detail = clean(payload?.error?.message) || `HTTP ${response.status}`
    return {
      configured: true,
      provider: 'google_cse',
      query,
      suggestions: [],
      message: `Nao foi possivel buscar imagens agora: ${detail}`,
    }
  }

  return {
    configured: true,
    provider: 'google_cse',
    query,
    suggestions: normalizeGoogleItems(payload.items || []).slice(0, limit),
    message: '',
  }
}
