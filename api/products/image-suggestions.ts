import type { IncomingMessage, ServerResponse } from 'node:http'

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 20,
}

export default async function productImageSuggestions(req: IncomingMessage, res: ServerResponse) {
  const { handleProductImageSuggestionsRoute } = await import('../../serverless/dashboardApi.js')
  await handleProductImageSuggestionsRoute(req, res)
}
