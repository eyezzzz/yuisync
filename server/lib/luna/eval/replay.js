import { runCompiledScenario, runCompiledScenarioSuite } from './deterministicSimulator.js'

export async function replayLunaEvalArtifact(artifact = {}) {
  if (artifact?.kind === 'compiled_luna_scenario') return runCompiledScenario(artifact)
  if (artifact?.kind === 'luna_eval_result' && artifact.compiled_scenario) {
    return runCompiledScenario(artifact.compiled_scenario)
  }
  if (artifact?.kind === 'luna_eval_report' && Array.isArray(artifact.results)) {
    const compiled = artifact.results.map((entry) => entry.compiled_scenario).filter(Boolean)
    return runCompiledScenarioSuite(compiled)
  }
  return {
    ok: false,
    kind: 'luna_eval_replay_error',
    error: { code: 'UNSUPPORTED_EVAL_ARTIFACT', message: 'Artifact has no replayable compiled scenario.' },
  }
}
