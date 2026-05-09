import type { IncomingMessage, ServerResponse } from 'node:http'

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 30,
}

export default async function adminUserById(req: IncomingMessage, res: ServerResponse) {
  const { handleAdminUserById } = await import('../../../serverless/dashboardApi.js')
  await handleAdminUserById(req, res)
}
