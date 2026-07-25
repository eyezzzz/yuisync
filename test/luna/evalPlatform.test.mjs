import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  assertScenarioSpec,
  buildLunaEvalPlan,
  compileLunaEvalPlan,
  compileScenario,
  createEvalFailureSignature,
  groupEvalFailures,
  replayLunaEvalArtifact,
  runCompiledScenario,
  runCompiledScenarioSuite,
  selectEvalImpact,
  validateScenarioSpec,
} from '../../server/lib/luna/index.js'

const fixtureUrl = new URL('./eval/fixtures/booking-with-transport.json', import.meta.url)

async function loadFixture() {
  return JSON.parse(await readFile(fixtureUrl, 'utf8'))
}

test('scenario schema rejeita passos ambíguos e aceita fixture canônica', async () => {
  const invalid = validateScenarioSpec({
    name: 'invalid',
    steps: [{ user_intent: 'confirm', event: 'CONFIRM_OPERATION' }],
    assert: { operation_status: 'confirmed' },
  })
  assert.equal(invalid.ok, false)
  assert.match(invalid.issues[0].message, /exactly one/i)

  const fixture = await loadFixture()
  assert.equal(assertScenarioSpec(fixture).name, 'fixture_booking_with_transport')
})

test('scenario compiler gera IDs determinísticos e variações linguísticas limitadas', async () => {
  const fixture = await loadFixture()
  const first = compileScenario(fixture)
  const second = compileScenario(fixture)
  assert.deepEqual(first.map((entry) => entry.case_id), second.map((entry) => entry.case_id))
  assert.ok(first.length >= 6)
  assert.ok(first.length <= 16)
  assert.ok(first.some((entry) => entry.steps.some((step) => step.utterance === 'fecha assim')))
})

test('simulador determinístico executa fixture sem rede, banco ou LLM', async () => {
  const [compiled] = compileScenario(await loadFixture())
  const result = await runCompiledScenario(compiled)
  assert.equal(result.ok, true)
  assert.equal(result.state.status, 'confirmed')
  assert.equal(result.state.totals.total, 75)
  assert.equal(result.environment.tool_calls.confirm_operation, 1)
  assert.match(result.state.persistence.appointment_id, /^appointment_/)
})

test('catálogo principal compila e executa centenas de casos em uma suíte', async () => {
  const plan = buildLunaEvalPlan()
  const compiled = compileLunaEvalPlan()
  assert.equal(plan.scenario_count, 12)
  assert.equal(compiled.length, plan.case_count)
  assert.ok(compiled.length >= 150)

  const report = await runCompiledScenarioSuite(compiled)
  assert.equal(report.failed, 0)
  assert.equal(report.passed, compiled.length)
  assert.equal(report.failure_groups.length, 0)
  assert.ok(report.duration_ms < 5000)
})

test('agrupamento reúne falhas equivalentes e normaliza valores variáveis', async () => {
  const compiled = compileLunaEvalPlan({ names: ['bath_customer_brings_confirmation'] }).slice(0, 2)
  compiled[0] = { ...compiled[0], assert: { ...compiled[0].assert, total: 999 } }
  compiled[1] = { ...compiled[1], assert: { ...compiled[1].assert, total: 998 } }
  const report = await runCompiledScenarioSuite(compiled)
  assert.equal(report.failed, 2)
  assert.equal(report.failure_groups.length, 1)
  assert.equal(report.failure_groups[0].count, 2)
  assert.match(report.failure_groups[0].signature, /^fail_/)
  assert.deepEqual(createEvalFailureSignature(report.results[0]), createEvalFailureSignature(report.results[0]))
  assert.equal(groupEvalFailures(report.results)[0].count, 2)
})

test('replay executa caso compilado e resultado salvo', async () => {
  const compiled = compileLunaEvalPlan({ names: ['duplicate_confirmation_is_safe'] })[0]
  const first = await runCompiledScenario(compiled)
  const replayFromCase = await replayLunaEvalArtifact(compiled)
  const replayFromResult = await replayLunaEvalArtifact(first)
  assert.equal(first.ok, true)
  assert.equal(replayFromCase.ok, true)
  assert.equal(replayFromResult.ok, true)
  assert.equal(replayFromResult.environment.tool_calls.confirm_operation, 1)
})

test('seleção por impacto escolhe confirmação ou suíte completa', () => {
  const confirmation = selectEvalImpact(['server/lib/luna/confirmation/confirmationPolicy.js'])
  assert.equal(confirmation.run_full, false)
  assert.deepEqual(confirmation.groups, ['bath'])
  assert.ok(confirmation.tags.includes('confirmation'))

  const integration = selectEvalImpact(['server/lib/chat.js'])
  assert.equal(integration.run_full, true)
  assert.deepEqual(integration.groups, ['all'])
})
