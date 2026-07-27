import { PassThrough } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 30,
}

const MAX_WEBHOOK_BODY_BYTES = 2 * 1024 * 1024

function sendText(res: ServerResponse, status: number, text: string) {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(text)
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function handleVerification(req: IncomingMessage, res: ServerResponse) {
  const verifyToken = clean(process.env.WHATSAPP_VERIFY_TOKEN)
  const url = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`)
  const mode = url.searchParams.get('hub.mode') || ''
  const token = url.searchParams.get('hub.verify_token') || ''
  const challenge = url.searchParams.get('hub.challenge') || ''

  if (!verifyToken) {
    sendJson(res, 500, { error: 'Missing required environment variable: WHATSAPP_VERIFY_TOKEN' })
    return
  }

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    sendText(res, 200, challenge)
    return
  }

  sendJson(res, 403, { error: 'WhatsApp webhook verify token rejected.' })
}

async function readRawBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_WEBHOOK_BODY_BYTES) throw new Error('Payload too large.')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function replayRequest(req: IncomingMessage, rawBody: string): IncomingMessage {
  const replay = new PassThrough()
  Object.assign(replay, {
    headers: req.headers,
    method: req.method,
    url: req.url,
  })
  replay.end(rawBody)
  return replay as IncomingMessage
}

export default async function webhook(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'GET') {
    handleVerification(req, res)
    return
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    sendJson(res, 405, { error: 'Method not allowed.' })
    return
  }

  try {
    const rawBody = await readRawBody(req)
    const body = rawBody ? JSON.parse(rawBody) : {}
    const coexistence = await import('../serverless/whatsappCoexistenceWebhook.js')

    if (coexistence.isWhatsappCoexistencePayload(body)) {
      await coexistence.handleWhatsappCoexistenceWebhook({
        body,
        rawBody,
        headers: req.headers,
        res,
      })
      return
    }

    const { handleWhatsappWebhook } = await import('../serverless/whatsappWebhook.js')
    await handleWhatsappWebhook(replayRequest(req, rawBody), res)
  } catch (error) {
    sendJson(res, 400, {
      error: error instanceof Error ? error.message : 'Invalid WhatsApp webhook payload.',
    })
  }
}
