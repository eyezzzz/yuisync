import { ToolGuardrailError, ToolTimeoutError, ToolValidationError, normalizeLunaError } from '../errors.js'
import { validateJsonSchema } from './schemaValidation.js'
import { createToolResult } from './toolResult.js'

function parseArguments(toolCall = {}) {
  const raw = toolCall?.function?.arguments
  if (raw && typeof raw === 'object') return raw
  try {
    const parsed = JSON.parse(String(raw || '{}'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch (cause) {
    throw new ToolValidationError(toolCall?.function?.name, 'Tool arguments are not valid JSON.', { phase: 'input', cause })
  }
}

async function withTimeout(promise, toolName, timeoutMs) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new ToolTimeoutError(toolName, timeoutMs)), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

function publicFailure(errorInput) {
  const error = normalizeLunaError(errorInput)
  return {
    ok: false,
    status: 'failed',
    error_code: error.code,
    error: error.message,
    error_details: error.details,
  }
}

export async function executeRegisteredToolCall({ registry, toolCall, traceId = null, context = {}, budget = null, onRun = null, clock = () => Date.now() } = {}) {
  const name = String(toolCall?.function?.name || '').trim()
  const startedAt = Number(clock())
  let definition = null
  let args = {}
  let rawResult = null
  let caught = null
  try {
    definition = registry.require(name)
    args = parseArguments(toolCall)
    const inputIssues = validateJsonSchema(args, definition.inputSchema)
    if (inputIssues.length) throw new ToolValidationError(name, `Invalid input for ${name}.`, { phase: 'input', details: { issues: inputIssues } })
    if (definition.requiresConfirmation && args.confirmation !== true) {
      throw new ToolGuardrailError(name, `Tool ${name} requires explicit confirmation.`)
    }
    const guardedInput = definition.inputGuard ? await definition.inputGuard({ input: args, context, definition }) : { ok: true }
    if (guardedInput === false || guardedInput?.ok === false) {
      throw new ToolGuardrailError(name, guardedInput?.message || `Input guard blocked ${name}.`, { details: guardedInput?.details })
    }
    budget?.beforeTool?.({ name })
    const remainingMs = budget?.remainingMs ? budget.remainingMs() : definition.timeoutMs
    const timeoutMs = Math.max(100, Math.min(definition.timeoutMs, Math.max(100, remainingMs)))
    rawResult = await withTimeout(Promise.resolve(definition.execute(args, { ...context, toolCall, definition })), name, timeoutMs)
    const outputIssues = validateJsonSchema(rawResult, definition.outputSchema)
    if (outputIssues.length) throw new ToolValidationError(name, `Invalid output from ${name}.`, { phase: 'output', details: { issues: outputIssues } })
    const guardedOutput = definition.outputGuard ? await definition.outputGuard({ input: args, output: rawResult, context, definition }) : { ok: true }
    if (guardedOutput === false || guardedOutput?.ok === false) {
      throw new ToolGuardrailError(name, guardedOutput?.message || `Output guard blocked ${name}.`, { details: guardedOutput?.details })
    }
  } catch (error) {
    caught = normalizeLunaError(error)
    rawResult = publicFailure(caught)
  } finally {
    if (definition) budget?.afterTool?.({ name, durationMs: Number(clock()) - startedAt })
  }

  const run = createToolResult({
    toolName: name,
    ok: rawResult?.ok !== false && !caught,
    status: rawResult?.status || null,
    arguments: args,
    result: rawResult,
    error: caught,
    durationMs: Number(clock()) - startedAt,
    traceId,
    definition,
  })
  if (typeof onRun === 'function') await onRun(run)
  return rawResult
}

export function createRegisteredToolExecutor(options = {}) {
  return (toolCall) => executeRegisteredToolCall({ ...options, toolCall })
}
