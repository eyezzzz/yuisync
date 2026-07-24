import { compareBathShadowTurn } from './shadowComparator.js'
import { buildBathShadowRegressionFixture } from './shadowReport.js'
import { shouldRunLunaShadow } from './shadowFlags.js'

function bathDomain(stateBefore = {}, stateAfter = {}) {
  const types = [stateBefore?.type, stateAfter?.type].map((value) => String(value || '').toLowerCase())
  return types.includes('service_booking')
    || [stateBefore?.metadata?.pending_order_type, stateAfter?.metadata?.pending_order_type]
      .some((value) => String(value || '').toLowerCase() === 'banho_tosa')
}

export function runBathShadowTurn({
  config = {},
  sessionId = null,
  stateBefore = {},
  stateAfter = {},
  semanticEvent = null,
  reply = '',
  genericTransportRequested = false,
  orderResult = null,
  availability = null,
  currentTurnSelectedSchedule = false,
} = {}) {
  if (!bathDomain(stateBefore, stateAfter)) return null
  if (!shouldRunLunaShadow({ config, domain: 'bath', sampleKey: sessionId })) return null

  const differences = compareBathShadowTurn({
    stateBefore,
    stateAfter,
    reply,
    genericTransportRequested,
    orderResult,
    availability,
    currentTurnSelectedSchedule,
  })
  const report = {
    version: 1,
    mode: 'shadow',
    domain: 'bath',
    read_only: true,
    side_effects: { tool_calls: 0, database_writes: 0, external_requests: 0 },
    agreement: differences.length === 0,
    differences,
  }
  if (differences.length) {
    report.regression_fixture = buildBathShadowRegressionFixture({
      sessionId,
      semanticEvent,
      stateBefore,
      stateAfter,
      differences,
    })
  }
  return report
}
