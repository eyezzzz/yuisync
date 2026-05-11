import type { IncomingMessage, ServerResponse } from 'node:http'

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 30,
}

export default async function resetStock(req: IncomingMessage, res: ServerResponse) {
  const { handleResetStockRoute } = await import('../../../serverless/dashboardApi.js')
  await handleResetStockRoute(req, res)
}
