function clean(value = '') {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function normalize(value = '') {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

const PLACEHOLDER_NAMES = new Set([
  'cliente',
  'cliente whatsapp',
  'whatsapp',
  'sem nome',
  'nao confirmado',
  'nao confirmada',
  'nao informado',
  'nao informada',
  'desconhecido',
  'desconhecida',
])

export function isCustomerNamePlaceholder(value = '') {
  const original = clean(value)
  const normalized = normalize(original)
  return !normalized
    || PLACEHOLDER_NAMES.has(normalized)
    || /^cliente[-\s]?\d+$/i.test(normalized)
    || /^\+?\d[\d\s().-]{6,}$/.test(original)
}

export function normalizeCustomerDisplayName(value = '') {
  const original = clean(value)
  return isCustomerNamePlaceholder(original) ? '' : original
}
