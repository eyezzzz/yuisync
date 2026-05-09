import type { IncomingMessage, ServerResponse } from 'node:http'

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 30,
}

export default async function adminUserStatus(req: IncomingMessage, res: ServerResponse) {
  const { handleAdminUserStatus } = await import('../../../../serverless/dashboardApi.js')
  await handleAdminUserStatus(req, res)
}
