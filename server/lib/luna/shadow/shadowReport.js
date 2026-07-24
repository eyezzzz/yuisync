import { createHash } from 'node:crypto'
import { createOperationState, operationStateFingerprint } from '../operationState.js'

export function buildBathShadowRegressionFixture({
  sessionId = null,
  semanticEvent = null,
  stateBefore = {},
  stateAfter = {},
  differences = [],
} = {}) {
  const before = createOperationState(stateBefore)
  const after = createOperationState(stateAfter)
  return {
    version: 1,
    domain: 'bath',
    session_fingerprint: sessionId
      ? createHash('sha256').update(String(sessionId)).digest('hex').slice(0, 16)
      : null,
    semantic_event: semanticEvent || null,
    state_before: {
      status: before.status,
      type: before.type,
      fingerprint: operationStateFingerprint(before),
    },
    state_after: {
      status: after.status,
      type: after.type,
      fingerprint: operationStateFingerprint(after),
    },
    expected_failure_codes: differences.map((entry) => entry.code),
  }
}
