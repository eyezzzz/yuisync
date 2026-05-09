import type { IncomingMessage, ServerResponse } from 'node:http'

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 30,
}

export default async function fiscalIssue(req: IncomingMessage, res: ServerResponse) {
  const { handleFiscalIssueRoute } = await import('../../../../serverless/dashboardApi.js')
  await handleFiscalIssueRoute(req, res)
}
