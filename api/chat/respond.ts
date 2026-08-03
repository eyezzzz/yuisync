import type { IncomingMessage, ServerResponse } from 'node:http'

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 120,
}

export default async function chatRespond(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`)

  if (url.searchParams.get('integration') === 'meta-whatsapp') {
    const { handleMetaWhatsappApi } = await import('../../serverless/metaWhatsappApi.js')
    await handleMetaWhatsappApi(req, res)
    return
  }

  const { handleChatRespondRoute } = await import('../../serverless/dashboardApi.js')
  await handleChatRespondRoute(req, res)
}
