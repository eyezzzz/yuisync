import { createHash } from 'node:crypto'

function normalizeMessage(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '<uuid>')
    .replace(/\b\d{4}-\d{2}-\d{2}t[^\s]+/gi, '<timestamp>')
    .replace(/\b\d+(?:[.,]\d+)?\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
}

export function createEvalFailureSignature(result = {}) {
  const failure = result.failure || {}
  const assertion = Array.isArray(result.assertion_errors) ? result.assertion_errors[0] : ''
  const canonical = {
    stage: failure.stage || (assertion ? 'assertion' : 'unknown'),
    code: failure.code || (assertion ? 'ASSERTION_FAILED' : 'UNKNOWN_FAILURE'),
    message: normalizeMessage(failure.message || assertion || result.error),
    group: result.group || null,
  }
  const hash = createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 16)
  return { signature: `fail_${hash}`, ...canonical }
}

export function groupEvalFailures(results = []) {
  const groups = new Map()
  for (const result of Array.isArray(results) ? results : []) {
    if (result.ok) continue
    const signature = createEvalFailureSignature(result)
    const current = groups.get(signature.signature) || {
      ...signature,
      count: 0,
      scenarios: new Set(),
      cases: [],
      tags: new Set(),
    }
    current.count += 1
    current.scenarios.add(result.scenario_name)
    current.cases.push(result.case_id)
    for (const tag of result.tags || []) current.tags.add(tag)
    groups.set(signature.signature, current)
  }
  return [...groups.values()]
    .map((entry) => ({
      ...entry,
      scenarios: [...entry.scenarios].sort(),
      cases: entry.cases.slice(0, 20),
      tags: [...entry.tags].sort(),
    }))
    .sort((left, right) => right.count - left.count || left.signature.localeCompare(right.signature))
}
