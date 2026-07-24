import { createRuntimePlan } from './runtimePlanner.js'
import { createRuntimeBudget } from './runtimeBudget.js'
import { buildRuntimeRecoveryDecision } from './runtimeRecovery.js'
import { createRuntimeResult } from './runtimeResult.js'
import { createRegistryFromAgentTools } from '../tools/registeredTools.js'
import { executeRegisteredToolCall } from '../tools/toolExecutor.js'

export function createLunaAgentRuntime({
  tools = [],
  executeLegacyTool,
  traceId = null,
  goal = 'respond',
  operationType = 'unknown',
  initialToolChoice = 'auto',
  limits = {},
} = {}) {
  if (typeof executeLegacyTool !== 'function') throw new TypeError('executeLegacyTool is required.')
  const budget = createRuntimeBudget(limits)
  const plan = createRuntimePlan({ goal, tools, initialToolChoice, operationType })
  const toolRuns = []
  const registry = createRegistryFromAgentTools(tools, {
    executeLegacyTool,
    defaultTimeoutMs: limits.defaultToolTimeoutMs,
    confirmationTimeoutMs: limits.confirmationTimeoutMs,
  })

  return {
    tools,
    registry,
    plan,
    budget,
    async callModel(params, call) {
      budget.beforeModel()
      const startedAt = Date.now()
      try {
        const response = await call(params)
        budget.afterModel(response?.usage || {}, { durationMs: Date.now() - startedAt })
        return response
      } catch (error) {
        budget.afterModel({}, { durationMs: Date.now() - startedAt })
        throw error
      }
    },
    executeToolCall(toolCall, context = {}) {
      return executeRegisteredToolCall({
        registry,
        toolCall,
        traceId,
        context,
        budget,
        onRun: (run) => toolRuns.push(run),
      })
    },
    recordValidationRetries(value) {
      budget.recordValidationRetries(value)
    },
    complete({ outcome = 'ok' } = {}) {
      return {
        schema_version: 1,
        outcome,
        plan,
        tool_runs: toolRuns.slice(),
        budget: budget.finish(),
      }
    },
  }
}

/** Deterministic primitive reserved for PR5 scenario plans. */
export async function runLunaToolPlan({ steps = [], registry, budget, state = null, context = {}, verify = null, traceId = null } = {}) {
  const toolResults = []
  for (const step of Array.isArray(steps) ? steps : []) {
    const result = await executeRegisteredToolCall({
      registry,
      budget,
      traceId,
      context,
      toolCall: step.toolCall || { function: { name: step.name, arguments: JSON.stringify(step.input || {}) } },
      onRun: (run) => toolResults.push(run),
    })
    if (result?.ok === false) {
      const error = Object.assign(new Error(result.error || 'Tool failed.'), { code: result.error_code, details: result.error_details })
      return createRuntimeResult({ ok: false, state, toolResults, recovery: buildRuntimeRecoveryDecision(error) })
    }
  }
  const verifier = typeof verify === 'function' ? await verify({ state, toolResults, context }) : null
  return createRuntimeResult({ ok: verifier?.ok !== false, state, toolResults, verifier })
}
