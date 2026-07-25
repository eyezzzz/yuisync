import { CORE_LUNA_EVAL_SCENARIOS } from './scenarios/coreScenarios.js'
import { compileScenarioSuite } from './scenarioCompiler.js'

export function listLunaEvalScenarioSpecs({ groups = null, names = null, tags = null } = {}) {
  const groupSet = groups ? new Set(Array.isArray(groups) ? groups : [groups]) : null
  const nameSet = names ? new Set(Array.isArray(names) ? names : [names]) : null
  const tagSet = tags ? new Set(Array.isArray(tags) ? tags : [tags]) : null
  return CORE_LUNA_EVAL_SCENARIOS.filter((scenario) => {
    if (groupSet && !groupSet.has(scenario.group)) return false
    if (nameSet && !nameSet.has(scenario.name)) return false
    if (tagSet && !(scenario.tags || []).some((tag) => tagSet.has(tag))) return false
    return true
  }).map((scenario) => structuredClone(scenario))
}

export function buildLunaEvalPlan(filters = {}) {
  const specs = listLunaEvalScenarioSpecs(filters)
  const compiled = compileScenarioSuite(specs, { maxCases: filters.maxCases })
  const groups = [...new Set(specs.map((entry) => entry.group))].map((group) => ({
    group,
    scenarios: specs.filter((entry) => entry.group === group).length,
    cases: compiled.filter((entry) => entry.group === group).length,
  }))
  return {
    schema_version: 1,
    suite: 'luna_eval_platform',
    generated_at: new Date().toISOString(),
    scenario_count: specs.length,
    case_count: compiled.length,
    groups,
    scenarios: specs.map((scenario) => ({
      name: scenario.name,
      title: scenario.title,
      description: scenario.description,
      group: scenario.group,
      tags: scenario.tags,
      case_count: compiled.filter((entry) => entry.scenario_name === scenario.name).length,
    })),
  }
}

export function compileLunaEvalPlan(filters = {}) {
  const specs = listLunaEvalScenarioSpecs(filters)
  return compileScenarioSuite(specs, { maxCases: filters.maxCases })
}
