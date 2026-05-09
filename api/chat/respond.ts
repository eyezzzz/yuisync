import type { IncomingMessage, ServerResponse } from 'node:http'

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 30,
}

export default async function chatRespond(req: IncomingMessage, res: ServerResponse) {
  const { handleChatRespondRoute } = await import('../../serverless/dashboardApi.js')
  await handleChatRespondRoute(req, res)
}
