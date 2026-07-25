import 'dotenv/config'
import process from 'node:process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import {
  getPetbotDiagnosticPlan,
  runPetbotDiagnosticCase,
  summarizeDiagnosticResults,
} from './petbot-diagnostic-suite.mjs'

function clean(value = '') {
  return String(value || '').trim()
}

async function main() {
  const tenantId = clean(process.env.PETBOT_E2E_TENANT_ID)
  if (!tenantId) throw new Error('Defina PETBOT_E2E_TENANT_ID para executar os 50 diagnósticos vivos.')

  const output = resolve(process.cwd(), clean(process.env.PETBOT_DIAGNOSTIC_REPORT) || 'artifacts/petbot-diagnostic-50.json')
  const suiteId = `PETBOT_FINAL_50_${Date.now()}`
  const plan = await getPetbotDiagnosticPlan({ tenantId })
  if (plan.total !== 50) throw new Error(`O plano vivo precisa conter 50 cenários; encontrou ${plan.total}.`)

  const results = []
  for (const [index, item] of plan.scenarios.entries()) {
    process.stdout.write(`[${index + 1}/${plan.total}] ${item.id} — ${item.title}\n`)
    const result = await runPetbotDiagnosticCase({ tenantId, scenarioId: item.id, suiteId })
    results.push(result)
    process.stdout.write(`${result.success ? 'PASSOU' : 'FALHOU'} ${item.id}${result.error ? `: ${result.error}` : ''}\n`)
  }

  const summary = summarizeDiagnosticResults(results)
  const report = {
    suite: 'petbot_final_live_50',
    suite_id: suiteId,
    tenant_id: tenantId,
    generated_at: new Date().toISOString(),
    plan,
    summary,
    results,
  }

  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(summary, null, 2))
  if (summary.failed > 0) process.exitCode = 1
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`)
  process.exitCode = 1
})
