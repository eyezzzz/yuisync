import type { IncomingMessage, ServerResponse } from 'node:http'

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 30,
}

export default async function adminUsers(req: IncomingMessage, res: ServerResponse) {
  const { handleAdminUsers } = await import('../../serverless/dashboardApi.js')
  await handleAdminUsers(req, res)
}
