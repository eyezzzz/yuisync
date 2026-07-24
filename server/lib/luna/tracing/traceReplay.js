import { runOperationScenario } from '../scenarioRunner.js'

export function replayRegressionFixture(fixture = {}) {
  if (Array.isArray(fixture.events)) return runOperationScenario(fixture)
  return {
    ok: false,
    name: fixture.name || 'trace_replay',
    errors: ['Fixture has no deterministic events. Use tool_contracts for a runtime replay in PR5.'],
    state: fixture.initial_state || null,
  }
}
