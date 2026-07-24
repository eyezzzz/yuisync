import { reduceOperation } from './operationReducer.js'
import { createOperationState } from './operationState.js'
import { normalizeLunaError } from './errors.js'

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function matchesSubset(actual, expected, path = '') {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return [`${path || '<root>'}: expected array`]
    const errors = []
    expected.forEach((entry, index) => {
      errors.push(...matchesSubset(actual[index], entry, `${path}[${index}]`))
    })
    return errors
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') return [`${path || '<root>'}: expected object`]
    return Object.entries(expected).flatMap(([key, value]) => (
      matchesSubset(actual[key], value, path ? `${path}.${key}` : key)
    ))
  }
  return Object.is(actual, expected)
    ? []
    : [`${path || '<root>'}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`]
}

export function runOperationScenario(scenarioInput = {}) {
  const scenario = objectValue(scenarioInput)
  let state = createOperationState(scenario.initial_state)
  let caughtError = null
  try {
    for (const event of Array.isArray(scenario.events) ? scenario.events : []) {
      state = reduceOperation(state, event)
    }
  } catch (error) {
    caughtError = normalizeLunaError(error)
  }

  const expectedError = scenario.expected_error
  if (expectedError) {
    if (!caughtError) {
      return { ok: false, name: scenario.name || 'unnamed', state, errors: [`Expected error ${expectedError}, but scenario completed.`] }
    }
    if (caughtError.code !== expectedError) {
      return { ok: false, name: scenario.name || 'unnamed', state, error: caughtError, errors: [`Expected error ${expectedError}, received ${caughtError.code}.`] }
    }
    return { ok: true, name: scenario.name || 'unnamed', state, error: caughtError, errors: [] }
  }

  if (caughtError) {
    return { ok: false, name: scenario.name || 'unnamed', state, error: caughtError, errors: [`Unexpected ${caughtError.code}: ${caughtError.message}`] }
  }

  const errors = matchesSubset(state, objectValue(scenario.expected))
  return { ok: errors.length === 0, name: scenario.name || 'unnamed', state, errors }
}
