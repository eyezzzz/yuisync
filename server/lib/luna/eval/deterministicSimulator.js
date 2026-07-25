import { performance } from 'node:perf_hooks'
import { createOperationEvent } from '../operationEvents.js'
import { normalizeLunaError } from '../errors.js'
import { createDeterministicEvalEnvironment } from './deterministicEnvironment.js'
import { executeEvalIntent } from './intentHandlers.js'
import { evaluateScenarioAssertions } from './assertions.js'
import { groupEvalFailures } from './failureGrouping.js'

function clone(value) {
  return structuredClone(value)
}

export async function runCompiledScenario(compiled = {}) {
  const startedAt = performance.now()
  const env = createDeterministicEvalEnvironment({
    caseId: compiled.case_id,
    initialState: compiled.initial_state,
    fixtures: compiled.fixtures,
  })
  let failure = null
  let failedStep = null

  for (let index = 0; index < (compiled.steps || []).length; index += 1) {
    const step = compiled.steps[index]
    env.transcript.push({ role: 'user', step_id: step.id, intent: step.user_intent, text: step.utterance || null })
    try {
      if (step.user_intent) {
        executeEvalIntent({ intent: step.user_intent, payload: step.payload, env, stepIndex: index })
      } else if (step.event) {
        env.applyEvent(createOperationEvent(step.event, step.payload, {
          event_id: `evt_${compiled.case_id}_${index}_${step.event}`,
          source: 'luna_eval_direct_event',
        }))
      } else if (step.tool) {
        const error = Object.assign(new Error('Direct tool steps require a scenario adapter.'), { code: 'UNSUPPORTED_EVAL_TOOL_STEP' })
        throw error
      }
      if (step.expect_error) {
        failure = { stage: 'step', code: 'EXPECTED_ERROR_NOT_THROWN', message: `Expected ${step.expect_error} at ${step.id}.` }
        failedStep = step.id
        break
      }
    } catch (error) {
      const normalized = normalizeLunaError(error)
      if (step.expect_error && normalized.code === step.expect_error) {
        env.transcript.push({ role: 'system', step_id: step.id, outcome: 'expected_error', code: normalized.code })
        continue
      }
      failure = { stage: 'step', code: normalized.code, message: normalized.message, details: normalized.details || null }
      failedStep = step.id
      break
    }
  }

  const state = env.getState()
  const assertions = failure
    ? { ok: false, errors: [] }
    : evaluateScenarioAssertions({ state, environment: env, expected: compiled.assert })
  if (!failure && !assertions.ok) {
    failure = { stage: 'assertion', code: 'ASSERTION_FAILED', message: assertions.errors[0] || 'Scenario assertions failed.' }
  }

  return {
    schema_version: 1,
    kind: 'luna_eval_result',
    ok: !failure && assertions.ok,
    case_id: compiled.case_id,
    scenario_name: compiled.scenario_name,
    title: compiled.title,
    group: compiled.group,
    tags: compiled.tags || [],
    variant: compiled.variant,
    duration_ms: Math.max(0, Math.round((performance.now() - startedAt) * 1000) / 1000),
    failed_step: failedStep,
    failure,
    assertion_errors: assertions.errors,
    state: clone(state),
    transcript: clone(env.transcript),
    tool_runs: clone(env.stepResults),
    environment: env.snapshot(),
    compiled_scenario: clone(compiled),
  }
}

export async function runCompiledScenarioSuite(compiledCases = [], { stopOnFailure = false } = {}) {
  const startedAt = performance.now()
  const results = []
  for (const compiled of Array.isArray(compiledCases) ? compiledCases : []) {
    const result = await runCompiledScenario(compiled)
    results.push(result)
    if (stopOnFailure && !result.ok) break
  }
  const passed = results.filter((entry) => entry.ok).length
  const durationMs = Math.max(0, Math.round((performance.now() - startedAt) * 1000) / 1000)
  return {
    schema_version: 1,
    kind: 'luna_eval_report',
    generated_at: new Date().toISOString(),
    total: results.length,
    passed,
    failed: results.length - passed,
    pass_rate: results.length ? Math.round((passed / results.length) * 10000) / 100 : 0,
    duration_ms: durationMs,
    average_duration_ms: results.length ? Math.round((durationMs / results.length) * 1000) / 1000 : 0,
    failure_groups: groupEvalFailures(results),
    results,
  }
}
