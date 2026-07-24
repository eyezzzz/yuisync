import { sanitizeLunaValue } from '../sanitize.js'

export function traceToRegressionFixture(traceInput = {}) {
  const trace = sanitizeLunaValue(traceInput)
  const events = Array.isArray(traceInput?.replay?.events) ? sanitizeLunaValue(traceInput.replay.events) : []
  return {
    schema_version: 1,
    name: `trace_${traceInput?.incident?.signature || traceInput?.trace_id || 'unknown'}`,
    replayable: events.length > 0,
    source: {
      trace_id: traceInput?.trace_id || null,
      incident_signature: traceInput?.incident?.signature || null,
      failure_class: traceInput?.incident?.failure_class || null,
    },
    initial_state: trace.state_before || {},
    events,
    expected: {
      verifier_ok: true,
      outcome: traceInput?.outcome === 'error' ? 'recovered' : traceInput?.outcome || 'ok',
    },
  }
}

export const exportRegressionFixtureFromTrace = traceToRegressionFixture
export const sanitizeTraceValue = sanitizeLunaValue
