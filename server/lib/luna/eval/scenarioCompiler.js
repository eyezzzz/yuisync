import { createHash } from 'node:crypto'
import { assertScenarioSpec } from './scenarioSchema.js'
import { resolveStepPhrases } from './paraphraseCatalog.js'

function shortHash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12)
}

function materializeCase(scenario, selectedPhrases, variantLabel) {
  const steps = scenario.steps.map((step, index) => ({
    ...step,
    utterance: selectedPhrases[index] || null,
    _kind_count: undefined,
  }))
  const identity = {
    scenario: scenario.name,
    variant: variantLabel,
    utterances: steps.map((step) => step.utterance),
  }
  return {
    schema_version: 1,
    kind: 'compiled_luna_scenario',
    case_id: `${scenario.name}__${shortHash(identity)}`,
    scenario_name: scenario.name,
    title: scenario.title,
    description: scenario.description,
    group: scenario.group,
    tags: scenario.tags,
    variant: variantLabel,
    initial_state: scenario.initial_state,
    fixtures: scenario.fixtures,
    steps,
    assert: scenario.assert,
    metadata: scenario.metadata,
  }
}

export function compileScenario(input = {}, options = {}) {
  const scenario = assertScenarioSpec(input)
  const phraseOptions = scenario.steps.map(resolveStepPhrases)
  const base = phraseOptions.map((entries) => entries[0] || null)
  const cases = [materializeCase(scenario, base, 'base')]
  const maxCases = Math.max(1, Math.min(500, Number(options.maxCases || scenario.compiler.max_cases) || 64))

  if (scenario.compiler.strategy === 'cartesian') {
    const walk = (index, selected) => {
      if (cases.length >= maxCases) return
      if (index >= phraseOptions.length) {
        const label = selected.map((_, stepIndex) => `${scenario.steps[stepIndex].id}:${phraseOptions[stepIndex].indexOf(selected[stepIndex])}`).join('|')
        if (label !== scenario.steps.map((step) => `${step.id}:0`).join('|')) cases.push(materializeCase(scenario, selected, label))
        return
      }
      for (const phrase of phraseOptions[index]) {
        walk(index + 1, [...selected, phrase])
        if (cases.length >= maxCases) return
      }
    }
    walk(0, [])
  } else {
    phraseOptions.forEach((entries, stepIndex) => {
      entries.slice(1).forEach((phrase, variantIndex) => {
        if (cases.length >= maxCases) return
        const selected = [...base]
        selected[stepIndex] = phrase
        cases.push(materializeCase(scenario, selected, `${scenario.steps[stepIndex].id}:${variantIndex + 1}`))
      })
    })

    if (scenario.compiler.include_zipped && cases.length < maxCases) {
      const maxVariants = Math.max(...phraseOptions.map((entries) => entries.length))
      for (let variantIndex = 1; variantIndex < maxVariants && cases.length < maxCases; variantIndex += 1) {
        const selected = phraseOptions.map((entries) => entries[variantIndex % entries.length] || entries[0])
        cases.push(materializeCase(scenario, selected, `zipped:${variantIndex}`))
      }
    }
  }

  const unique = new Map(cases.map((entry) => [entry.case_id, entry]))
  return [...unique.values()].slice(0, maxCases)
}

export function compileScenarioSuite(specs = [], options = {}) {
  const compiled = []
  for (const spec of Array.isArray(specs) ? specs : []) {
    compiled.push(...compileScenario(spec, options))
  }
  return compiled
}
