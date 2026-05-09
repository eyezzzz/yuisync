import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleWhatsappWebhook } from '../../serverless/whatsappWebhook'

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 30,
}

export default async function webhook(req: IncomingMessage, res: ServerResponse) {
  await handleWhatsappWebhook(req, res)
}
