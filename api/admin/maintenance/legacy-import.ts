import type { IncomingMessage, ServerResponse } from 'node:http'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function legacyImport(req: IncomingMessage, res: ServerResponse) {
  const { handleLegacyImportRoute } = await import('../../../serverless/dashboardApi.js')
  await handleLegacyImportRoute(req, res)
}
