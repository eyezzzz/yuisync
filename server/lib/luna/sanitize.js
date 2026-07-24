import { createHash } from 'node:crypto'

function text(value, max = 4000) {
  return String(value ?? '').slice(0, max)
}

function fingerprint(value) {
  return createHash('sha256').update(String(value ?? '')).digest('hex').slice(0, 16)
}

function shouldRedact(path = [], key = '') {
  const normalizedKey = String(key || '').toLowerCase()
  const normalizedPath = path.map((entry) => String(entry || '').toLowerCase())
  if (/password|secret|token|api[_-]?key|authorization|cookie/.test(normalizedKey)) return true
  if (/phone|email|cpf|cnpj|document|whatsapp/.test(normalizedKey)) return true
  if (/message|prompt|instructions?|notes?|reference/.test(normalizedKey)) return true
  if (/address|street|neighborhood|bairro|city|cidade|district/.test(normalizedKey)) return true
  if (normalizedKey === 'name' || normalizedKey.endsWith('_name')) {
    return normalizedPath.some((entry) => /customer|client|pet|recipient|sender|owner/.test(entry))
      || /customer|client|pet|recipient|sender|owner/.test(normalizedKey)
  }
  return false
}

function redacted(value) {
  const source = String(value ?? '')
  return `[REDACTED:${fingerprint(source)}:${source.length}]`
}

export function sanitizeLunaValue(value, {
  maxDepth = 6,
  maxArray = 40,
  maxString = 1200,
} = {}, path = [], seen = new WeakSet()) {
  if (value === null || value === undefined) return value ?? null
  if (typeof value === 'string') return text(value, maxString)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== 'object') return text(value, maxString)
  if (path.length >= maxDepth) return '[TRUNCATED_DEPTH]'
  if (seen.has(value)) return '[CIRCULAR]'
  seen.add(value)

  if (Array.isArray(value)) {
    return value.slice(0, maxArray).map((entry, index) => (
      sanitizeLunaValue(entry, { maxDepth, maxArray, maxString }, [...path, index], seen)
    ))
  }

  const output = {}
  for (const [key, entry] of Object.entries(value)) {
    if (shouldRedact(path, key)) {
      output[key] = redacted(typeof entry === 'string' ? entry : JSON.stringify(entry))
      continue
    }
    output[key] = sanitizeLunaValue(
      entry,
      { maxDepth, maxArray, maxString },
      [...path, key],
      seen,
    )
  }
  return output
}

export function lunaValueFingerprint(value) {
  const sanitized = sanitizeLunaValue(value)
  return createHash('sha256')
    .update(JSON.stringify(sanitized))
    .digest('hex')
    .slice(0, 24)
}
