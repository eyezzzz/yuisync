import { RuntimeBudgetError } from '../errors.js'

function positive(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

export function createRuntimeBudget(options = {}) {
  const clock = typeof options.clock === 'function' ? options.clock : () => Date.now()
  const startedAt = Number(clock())
  const limits = {
    max_duration_ms: positive(options.maxDurationMs ?? options.timeoutMs, 105000),
    max_tool_calls: Math.trunc(positive(options.maxToolCalls, 10)),
    max_tokens: Math.trunc(positive(options.maxTokens, 16000)),
    max_validation_retries: Math.max(0, Math.trunc(Number(options.maxValidationRetries ?? options.maxAttempts ?? 2) || 0)),
    estimated_cost_per_million_tokens: Math.max(0, Number(options.estimatedCostPerMillionTokens || 0) || 0),
  }
  const usage = {
    tool_calls: 0,
    active_tools: 0,
    tool_duration_ms: 0,
    model_calls: 0,
    model_duration_ms: 0,
    tokens: 0,
    validation_retries: 0,
    estimated_cost: 0,
  }

  function elapsed() { return Math.max(0, Number(clock()) - startedAt) }
  function ensureDuration() {
    if (elapsed() > limits.max_duration_ms) throw new RuntimeBudgetError('duration', { details: { limits, usage, elapsed_ms: elapsed() } })
  }
  function updateCost() {
    usage.estimated_cost = limits.estimated_cost_per_million_tokens > 0
      ? (usage.tokens / 1_000_000) * limits.estimated_cost_per_million_tokens
      : 0
  }

  return {
    limits,
    beforeTool({ name } = {}) {
      ensureDuration()
      if (usage.tool_calls >= limits.max_tool_calls) {
        throw new RuntimeBudgetError('tool_calls', { details: { tool: name || null, limits, usage } })
      }
      usage.tool_calls += 1
      usage.active_tools += 1
      return usage.tool_calls
    },
    afterTool({ durationMs = 0 } = {}) {
      usage.active_tools = Math.max(0, usage.active_tools - 1)
      usage.tool_duration_ms += Math.max(0, Number(durationMs || 0) || 0)
      ensureDuration()
    },
    beforeModel() {
      ensureDuration()
      usage.model_calls += 1
    },
    afterModel(usageInput = {}, { durationMs = 0 } = {}) {
      usage.model_duration_ms += Math.max(0, Number(durationMs || 0) || 0)
      this.addTokens(usageInput)
    },
    addTokens(usageInput = 0) {
      const tokens = typeof usageInput === 'number'
        ? usageInput
        : Number(usageInput?.total_tokens ?? usageInput?.tokens ?? 0)
      usage.tokens += Math.max(0, Number(tokens || 0) || 0)
      updateCost()
      if (usage.tokens > limits.max_tokens) throw new RuntimeBudgetError('tokens', { details: { limits, usage } })
      ensureDuration()
      return usage.tokens
    },
    recordValidationRetries(value = 0) {
      usage.validation_retries = Math.max(0, Math.trunc(Number(value || 0) || 0))
      if (usage.validation_retries > limits.max_validation_retries) {
        throw new RuntimeBudgetError('validation_retries', { details: { limits, usage } })
      }
    },
    remainingMs() { return Math.max(0, limits.max_duration_ms - elapsed()) },
    finish() {
      return {
        limits: { ...limits },
        usage: { ...usage },
        elapsed_ms: elapsed(),
        remaining_ms: Math.max(0, limits.max_duration_ms - elapsed()),
      }
    },
    snapshot() { return this.finish() },
  }
}
