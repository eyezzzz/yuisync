import type { IncomingMessage, ServerResponse } from 'node:http'

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 30,
}

export default async function maintenance(req: IncomingMessage, res: ServerResponse) {
  const action = new URL(req.url || '/', 'http://localhost').pathname.split('/').filter(Boolean).pop()
  const {
    handleLegacyImportRoute,
    handleResetChatHistoryRoute,
    handleResetStockRoute,
  } = await import('../../../serverless/dashboardApi.js')

  if (action === 'reset-chat') {
    await handleResetChatHistoryRoute(req, res)
    return
  }
  if (action === 'reset-stock') {
    await handleResetStockRoute(req, res)
    return
  }
  if (action === 'legacy-import') {
    await handleLegacyImportRoute(req, res)
    return
  }

  res.statusCode = 404
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Rota administrativa nao encontrada.' } }))
}
