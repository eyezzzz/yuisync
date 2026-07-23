import type { IncomingMessage, ServerResponse } from 'node:http'
import { isModuleAdmin, requireAuthenticatedProfile } from '../../server/lib/auth.js'
import { HttpError, getBearerToken, readJsonBody, sendJson, validateUUID } from '../../server/lib/http.js'
import { runPetbotLiveConversations } from '../../scripts/test-petbot-live-conversations.mjs'

export const config = {
  maxDuration: 300,
}

type JsonBody = Record<string, unknown>

const runningTenants = new Set<string>()

function handleApiError(res: ServerResponse, error: unknown) {
  const status = error instanceof HttpError ? error.status : 500
  const message = error instanceof Error ? error.message : 'Erro ao executar o diagnostico do PetBot.'
  if (status >= 500) console.error('[petbot-live-e2e]', error)
  sendJson(res, status, {
    success: false,
    error: {
      code: status === 409 ? 'PETBOT_E2E_ALREADY_RUNNING' : 'PETBOT_E2E_FAILED',
      message,
    },
  })
}

export default async function petbotLiveE2E(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS')
      throw new HttpError(405, 'Metodo nao permitido.')
    }

    const requester = await requireAuthenticatedProfile(getBearerToken(req))
    if (!isModuleAdmin(requester, 'petshop')) {
      throw new HttpError(403, 'Apenas administradores do PetShop podem executar este diagnostico.')
    }

    const body = await readJsonBody(req) as JsonBody
    const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : ''
    const confirmation = typeof body.confirm === 'string' ? body.confirm : ''

    validateUUID(tenantId, 'tenantId')
    if (confirmation !== 'RUN_PETBOT_LIVE_E2E') {
      throw new HttpError(400, 'Confirmacao de diagnostico invalida.')
    }

    if (requester.role !== 'admin' && requester.active_tenant_id !== tenantId) {
      throw new HttpError(403, 'O diagnostico so pode ser executado no negocio ativo da sua conta.')
    }

    if (runningTenants.has(tenantId)) {
      throw new HttpError(409, 'Ja existe um diagnostico do PetBot em execucao para este negocio.')
    }

    runningTenants.add(tenantId)
    try {
      const report = await runPetbotLiveConversations({
        tenantId,
      })
      const success = report.failed === 0 && !report.cleanup_error && report.passed === report.total
      sendJson(res, 200, { success, data: report })
    } finally {
      runningTenants.delete(tenantId)
    }
  } catch (error) {
    handleApiError(res, error)
  }
}
