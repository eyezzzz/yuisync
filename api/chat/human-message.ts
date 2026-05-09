import type { IncomingMessage, ServerResponse } from 'node:http'

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 30,
}

export default async function chatHumanMessage(req: IncomingMessage, res: ServerResponse) {
  const { handleChatHumanMessageRoute } = await import('../../serverless/dashboardApi.js')
  await handleChatHumanMessageRoute(req, res)
}
