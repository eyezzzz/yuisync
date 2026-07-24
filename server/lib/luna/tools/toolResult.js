import { sanitizeLunaValue } from '../sanitize.js'
import { normalizeLunaError } from '../errors.js'

export function createToolResult({ toolName, ok, status, arguments: args, result, error, durationMs, traceId, definition } = {}) {
  const normalizedError = error ? normalizeLunaError(error) : null
  return {
    schema_version: 1,
    tool_name: String(toolName || 'unknown'),
    ok: Boolean(ok) && !normalizedError,
    status: String(status || (normalizedError ? 'failed' : 'ok')),
    arguments: sanitizeLunaValue(args || {}),
    result: sanitizeLunaValue(result ?? null),
    error_code: normalizedError?.code || result?.error_code || null,
    error: normalizedError ? normalizedError.toJSON() : null,
    duration_ms: Math.max(0, Number(durationMs || 0) || 0),
    trace_id: String(traceId || '').trim() || null,
    risk: definition?.risk || 'read',
    requires_confirmation: Boolean(definition?.requiresConfirmation),
  }
}
