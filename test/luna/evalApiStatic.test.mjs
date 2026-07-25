import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const apiUrl = new URL('../../api/admin/petbot-e2e.ts', import.meta.url)
const apiClientUrl = new URL('../../src/lib/api.js', import.meta.url)
const componentUrl = new URL('../../src/shared/components/LunaEvalDashboard.jsx', import.meta.url)
const settingsUrl = new URL('../../src/shared/pages/SettingsPage.jsx', import.meta.url)

test('API administrativa usa plataforma determinística e exige autorização', async () => {
  const source = await readFile(apiUrl, 'utf8')
  assert.match(source, /requireAuthenticatedProfile/)
  assert.match(source, /isModuleAdmin/)
  assert.match(source, /action === 'luna_eval_plan'/)
  assert.match(source, /action === 'luna_eval_run'/)
  assert.match(source, /compileLunaEvalPlan/)
  assert.match(source, /runCompiledScenarioSuite/)
  assert.doesNotMatch(source, /adminSupabase|respondToChatMessage|createConfirmedPetshopOrderViaRpc/)
  await assert.rejects(readFile(new URL('../../api/admin/luna-evals.ts', import.meta.url)), /ENOENT/)
})

test('cliente da Eval Platform compartilha a função administrativa existente', async () => {
  const client = await readFile(apiClientUrl, 'utf8')
  assert.match(client, /prepareLunaEvalPlatform[\s\S]*apiRequest\('\/admin\/petbot-e2e'/)
  assert.match(client, /action: 'luna_eval_plan'/)
  assert.match(client, /action: 'luna_eval_run'/)
  assert.doesNotMatch(client, /\/admin\/luna-evals/)
})

test('dashboard de regressões está ligado à aba de diagnóstico', async () => {
  const component = await readFile(componentUrl, 'utf8')
  const settings = await readFile(settingsUrl, 'utf8')
  assert.match(component, /Luna Eval Platform/)
  assert.match(component, /failure_groups/)
  assert.match(component, /runLunaEvalPlatform/)
  assert.match(settings, /<LunaEvalDashboard/)
  assert.match(settings, /<PetbotDiagnosticSuite/)
})
