import type { IncomingMessage, ServerResponse } from 'node:http'

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 30,
}

export default async function resetChat(req: IncomingMessage, res: ServerResponse) {
  const { handleResetChatHistoryRoute } = await import('../../../serverless/dashboardApi.js')
  await handleResetChatHistoryRoute(req, res)
}
