function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max)
}

function normalizeStep(stepInput = {}, index = 0) {
  const step = objectValue(stepInput)
  const userIntent = text(step.user_intent || step.userIntent, 120)
  const event = text(step.event, 120)
  const tool = text(step.tool, 120)
  const kinds = [userIntent, event, tool].filter(Boolean)
  return {
    id: text(step.id, 120) || `step_${index + 1}`,
    user_intent: userIntent || null,
    event: event || null,
    tool: tool || null,
    payload: objectValue(step.payload),
    input: objectValue(step.input),
    phrases: Array.isArray(step.phrases)
      ? step.phrases.map((entry) => text(entry, 500)).filter(Boolean)
      : [],
    paraphrase_set: text(step.paraphrase_set || step.paraphraseSet, 120) || null,
    expect_error: text(step.expect_error || step.expectError, 120) || null,
    metadata: objectValue(step.metadata),
    _kind_count: kinds.length,
  }
}

export function normalizeScenarioSpec(input = {}) {
  const source = objectValue(input)
  const compiler = objectValue(source.compiler)
  return {
    schema_version: Number(source.schema_version || 1),
    name: text(source.name, 160),
    title: text(source.title || source.name, 240),
    description: text(source.description, 1000) || null,
    group: text(source.group, 120) || 'core',
    tags: Array.isArray(source.tags) ? [...new Set(source.tags.map((entry) => text(entry, 100)).filter(Boolean))] : [],
    initial_state: objectValue(source.initial_state),
    fixtures: objectValue(source.fixtures),
    compiler: {
      strategy: text(compiler.strategy, 80) || 'one_at_a_time',
      max_cases: Math.max(1, Math.min(500, Number(compiler.max_cases || 64) || 64)),
      include_zipped: compiler.include_zipped === true,
    },
    steps: (Array.isArray(source.steps) ? source.steps : []).map(normalizeStep),
    assert: objectValue(source.assert),
    metadata: objectValue(source.metadata),
  }
}

export function validateScenarioSpec(input = {}) {
  const scenario = normalizeScenarioSpec(input)
  const issues = []
  const add = (path, message) => issues.push({ path, message })

  if (scenario.schema_version !== 1) add('schema_version', 'Only scenario schema version 1 is supported.')
  if (!scenario.name) add('name', 'Scenario name is required.')
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(scenario.name)) add('name', 'Scenario name must be URL-safe.')
  if (!scenario.steps.length) add('steps', 'At least one scenario step is required.')
  scenario.steps.forEach((step, index) => {
    if (step._kind_count !== 1) {
      add(`steps[${index}]`, 'Each step must define exactly one of user_intent, event or tool.')
    }
    if (step.user_intent && !step.payload) add(`steps[${index}].payload`, 'Intent payload must be an object.')
  })
  if (!Object.keys(scenario.assert).length) add('assert', 'Scenario assertions are required.')

  return { ok: issues.length === 0, issues, scenario }
}

export function assertScenarioSpec(input = {}) {
  const validation = validateScenarioSpec(input)
  if (!validation.ok) {
    const error = new TypeError(`Invalid Luna eval scenario: ${validation.issues.map((entry) => `${entry.path}: ${entry.message}`).join('; ')}`)
    error.code = 'INVALID_EVAL_SCENARIO'
    error.details = { issues: validation.issues }
    throw error
  }
  return validation.scenario
}
