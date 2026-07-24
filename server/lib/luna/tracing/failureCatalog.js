import { createHash } from 'node:crypto'
import { LUNA_ERROR_CODES, normalizeLunaError } from '../errors.js'

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max)
}

export function classifyLunaFailure(errorInput, verifier = null) {
  const error = errorInput ? normalizeLunaError(errorInput) : null
  const verifierIssue = verifier?.issues?.find((entry) => entry?.severity === 'error') || verifier?.issues?.[0]
  if (error?.code) return error.code
  if (verifierIssue?.code) return verifierIssue.code
  const message = text(errorInput instanceof Error ? errorInput.message : errorInput, 1000).toLowerCase()
  if (/timeout|timed out|tempo limite/.test(message)) return LUNA_ERROR_CODES.TOOL_TIMEOUT
  if (/confirmation_contract_changed|contrato/.test(message)) return LUNA_ERROR_CODES.COMMERCIAL_CONTRACT_CHANGED
  if (/slot|hor[aá]rio.*(?:ocupado|indispon)/.test(message)) return LUNA_ERROR_CODES.SLOT_BECAME_UNAVAILABLE
  if (/duplicate|duplicad/.test(message)) return LUNA_ERROR_CODES.ALREADY_CONFIRMED
  if (/ambiguous|inconclusiv/.test(message)) return LUNA_ERROR_CODES.COMMIT_RESULT_AMBIGUOUS
  return errorInput ? LUNA_ERROR_CODES.TOOL_FAILED : null
}

export function createFailureSignature({
  failureClass = '',
  operationType = '',
  state = '',
  event = '',
  tool = '',
  expected = '',
  actual = '',
} = {}) {
  const canonical = [failureClass, operationType, state, event, tool, expected, actual]
    .map((value) => text(value, 300).toLowerCase())
    .join('|')
  return canonical.replace(/\|/g, '')
    ? createHash('sha256').update(canonical).digest('hex').slice(0, 24)
    : null
}
