import type { IncomingMessage, ServerResponse } from 'node:http'

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 30,
}

export default async function focusWebhook(req: IncomingMessage, res: ServerResponse) {
  const { handleFiscalFocusWebhookRoute } = await import('../../../serverless/dashboardApi.js')
  await handleFiscalFocusWebhookRoute(req, res)
}
