export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const DEFAULT_SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co",
}

const MAX_BODY_BYTES = 64 * 1024

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...DEFAULT_SECURITY_HEADERS,
    ...extraHeaders,
  })
  res.end(JSON.stringify(payload))
}

export async function readJsonBody(req) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase()
  if (contentType && !contentType.includes('application/json')) {
    throw new HttpError(415, 'Content-Type must be application/json.')
  }

  const chunks = []
  let size = 0

  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) {
      throw new HttpError(413, 'Payload too large.')
    }
    chunks.push(chunk)
  }

  if (chunks.length === 0) {
    return {}
  }

  const raw = Buffer.concat(chunks).toString('utf8')

  try {
    return JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'Invalid JSON payload.')
  }
}

export function getBearerToken(req) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) {
    throw new HttpError(401, 'Missing bearer token.')
  }

  return header.slice('Bearer '.length).trim()
}

export function validateUUID(value, label = 'ID') {
  if (!value || !UUID_RE.test(value)) {
    throw new HttpError(400, `${label} must be a valid UUID.`)
  }
  return value
}

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    return String(forwarded).split(',')[0].trim()
  }
  return req.socket?.remoteAddress || 'unknown'
}
