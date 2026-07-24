import type { IncomingMessage, ServerResponse } from 'node:http'
import { isModuleAdmin, requireAuthenticatedProfile } from '../../server/lib/auth.js'
import { HttpError, getBearerToken, readJsonBody, sendJson, validateUUID } from '../../server/lib/http.js'
import { getPetbotDiagnosticPlan, runPetbotDiagnosticCase } from '../../scripts/petbot-diagnostic-suite.mjs'

export const config = {
  maxDuration: 300,
}

type JsonBody = Record<string, unknown>

const runningCases = new Set<string>()

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function handleApiError(res: ServerResponse, error: unknown) {
  const status = error instanceof HttpError ? error.status : 500
  const message = error instanceof Error ? error.message : 'Erro ao executar o diagnóstico do PetBot.'
  if (status >= 500) console.error('[petbot-diagnostic-suite]', error)
  sendJson(res, status, {
    success: false,
    error: {
      code: status === 409 ? 'PETBOT_DIAGNOSTIC_ALREADY_RUNNING' : 'PETBOT_DIAGNOSTIC_FAILED',
      message,
    },
  })
}

export default async function petbotDiagnostic(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS')
      throw new HttpError(405, 'Método não permitido.')
    }

    const requester = await requireAuthenticatedProfile(getBearerToken(req))
    if (!isModuleAdmin(requester, 'petshop')) {
      throw new HttpError(403, 'Apenas administradores do PetShop podem executar este diagnóstico.')
    }

    const body = await readJsonBody(req) as JsonBody
    const tenantId = clean(body.tenantId)
    const action = clean(body.action) || 'plan'
    validateUUID(tenantId, 'tenantId')

    if (requester.role !== 'admin' && requester.active_tenant_id !== tenantId) {
      throw new HttpError(403, 'O diagnóstico só pode ser executado no negócio ativo da sua conta.')
    }

    if (action === 'plan') {
      if (clean(body.confirm) !== 'PREPARE_PETBOT_DIAGNOSTIC_50') {
        throw new HttpError(400, 'Confirmação de diagnóstico inválida.')
      }
      const plan = await getPetbotDiagnosticPlan({ tenantId })
      sendJson(res, 200, { success: true, data: plan })
      return
    }

    if (action !== 'run_case') {
      throw new HttpError(400, 'Ação de diagnóstico inválida.')
    }
    if (clean(body.confirm) !== 'RUN_PETBOT_DIAGNOSTIC_CASE') {
      throw new HttpError(400, 'Confirmação de cenário inválida.')
    }

    const scenarioId = clean(body.scenarioId)
    const suiteId = clean(body.suiteId)
    if (!/^(banho|servicos|produtos|racao|veterinaria)_\d{2}$/.test(scenarioId)) {
      throw new HttpError(400, 'Identificador de cenário inválido.')
    }
    if (suiteId.length > 100 || (suiteId && !/^PETBOT_DIAGNOSTIC_[A-Z0-9_-]+$/i.test(suiteId))) {
      throw new HttpError(400, 'Identificador de suíte inválido.')
    }

    const runningKey = `${tenantId}:${scenarioId}`
    if (runningCases.has(runningKey)) {
      throw new HttpError(409, 'Este cenário já está em execução.')
    }

    runningCases.add(runningKey)
    try {
      const report = await runPetbotDiagnosticCase({ tenantId, scenarioId, suiteId })
      // Falhas funcionais do cenário fazem parte do relatório e permanecem HTTP 200,
      // permitindo que o painel continue os outros 49 testes.
      sendJson(res, 200, { success: report.success, data: report })
    } finally {
      runningCases.delete(runningKey)
    }
  } catch (error) {
    handleApiError(res, error)
  }
}
