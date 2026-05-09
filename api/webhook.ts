import type { IncomingMessage, ServerResponse } from 'node:http'

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 30,
}

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

export default async function webhook(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'GET') {
    handleVerification(req, res)
    return
  }

  const { handleWhatsappWebhook } = await import('../serverless/whatsappWebhook.js')
  await handleWhatsappWebhook(req, res)
}
