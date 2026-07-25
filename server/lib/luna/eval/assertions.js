function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function getPath(value, path) {
  if (!path) return value
  return String(path).split('.').reduce((current, segment) => current?.[segment], value)
}

function matchValue(actual, expected, path, errors) {
  if (expected === '$present') {
    if (actual === null || actual === undefined || actual === '') errors.push(`${path}: expected present value`)
    return
  }
  if (expected === '$absent') {
    if (actual !== null && actual !== undefined && actual !== '') errors.push(`${path}: expected absent value`)
    return
  }
  if (expected === '$nonempty') {
    if ((Array.isArray(actual) || typeof actual === 'string') && actual.length > 0) return
    errors.push(`${path}: expected non-empty value`)
    return
  }
  if (expected === '$number') {
    if (typeof actual !== 'number' || !Number.isFinite(actual)) errors.push(`${path}: expected finite number`)
    return
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      errors.push(`${path}: expected array`)
      return
    }
    expected.forEach((entry, index) => matchValue(actual[index], entry, `${path}[${index}]`, errors))
    return
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') {
      errors.push(`${path}: expected object`)
      return
    }
    for (const [key, value] of Object.entries(expected)) matchValue(actual[key], value, path ? `${path}.${key}` : key, errors)
    return
  }
  if (!Object.is(actual, expected)) errors.push(`${path}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
}

export function evaluateScenarioAssertions({ state, environment, expected = {} } = {}) {
  const assertion = objectValue(expected)
  const errors = []
  if ('operation_status' in assertion) matchValue(state?.status, assertion.operation_status, 'operation_status', errors)
  if ('state' in assertion) matchValue(state, assertion.state, 'state', errors)
  if ('persistence' in assertion) matchValue(state?.persistence, assertion.persistence, 'persistence', errors)
  if ('total' in assertion) matchValue(state?.totals?.total, assertion.total, 'total', errors)
  if ('transport_mode' in assertion) matchValue(state?.transport?.mode, assertion.transport_mode, 'transport_mode', errors)
  if ('notes' in assertion) matchValue(state?.notes, assertion.notes, 'notes', errors)
  if ('rejected_slots_contains' in assertion) {
    const values = Array.isArray(assertion.rejected_slots_contains) ? assertion.rejected_slots_contains : [assertion.rejected_slots_contains]
    for (const value of values) {
      if (!state?.rejected_slots?.includes(value)) errors.push(`rejected_slots: expected ${JSON.stringify(value)}`)
    }
  }
  if ('tool_calls' in assertion) {
    for (const [name, count] of Object.entries(objectValue(assertion.tool_calls))) {
      matchValue(environment.toolCallCount(name), count, `tool_calls.${name}`, errors)
    }
  }
  if (assertion.no_duplicate_commit === true) {
    const commits = environment.snapshot().commits
    if (commits.length > 1) errors.push(`no_duplicate_commit: expected at most one commit, received ${commits.length}`)
  }
  if (assertion.ledger_event) {
    const count = state?.ledger?.filter((entry) => entry.event === assertion.ledger_event).length || 0
    if (count < 1) errors.push(`ledger_event: expected ${assertion.ledger_event}`)
  }
  if (assertion.path_values) {
    for (const [path, expectedValue] of Object.entries(objectValue(assertion.path_values))) {
      matchValue(getPath({ state, environment: environment.snapshot() }, path), expectedValue, path, errors)
    }
  }
  return { ok: errors.length === 0, errors }
}
