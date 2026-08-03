import type { IncomingMessage, ServerResponse } from 'node:http'

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 30,
}

export default async function metaWhatsappApi(req: IncomingMessage, res: ServerResponse) {
  const { handleMetaWhatsappApi } = await import('../../serverless/metaWhatsappApi.js')
  await handleMetaWhatsappApi(req, res)
}
