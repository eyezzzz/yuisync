import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { executeCheckout } from '../../server/lib/checkout.js'
import { HttpError, getBearerToken, getClientIp, readJsonBody, sendJson } from '../../server/lib/http.js'
import { apiLimiter } from '../../server/lib/rateLimiter.js'

export const config = { api: { bodyParser: false }, maxDuration: 30 }

export default async function checkout(req: IncomingMessage, res: ServerResponse) {
  const requestId = randomUUID()
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      throw new HttpError(405, 'Metodo nao permitido.')
    }
    apiLimiter.consume(`checkout:${getClientIp(req)}`)
    const result = await executeCheckout(getBearerToken(req), await readJsonBody(req))
    sendJson(res, 201, { success: true, data: result, error: null, requestId })
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    const message = error instanceof Error ? error.message : 'Falha ao concluir venda.'
    sendJson(res, status, { success: false, data: null, error: { code: `CHECKOUT_${status}`, message }, requestId })
  }
}
