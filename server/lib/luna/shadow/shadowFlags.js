import { createHash } from 'node:crypto'

function booleanValue(value, fallback = false) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return fallback
  return ['1', 'true', 'yes', 'on'].includes(normalized)
}

function sampleValue(value, fallback = 1) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(1, Math.max(0, parsed))
}

function domainSet(value = 'bath') {
  return new Set(String(value || 'bath')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean))
}

function stableUnitInterval(value = '') {
  const digest = createHash('sha256').update(String(value || 'anonymous')).digest()
  return digest.readUInt32BE(0) / 0xffffffff
}

export function resolveLunaShadowConfig(overrides = {}) {
  return {
    enabled: overrides.enabled ?? booleanValue(process.env.LUNA_SHADOW_ENABLED, false),
    domains: overrides.domains instanceof Set
      ? overrides.domains
      : domainSet(overrides.domains ?? process.env.LUNA_SHADOW_DOMAINS ?? 'bath'),
    sampleRate: sampleValue(overrides.sampleRate ?? process.env.LUNA_SHADOW_SAMPLE_RATE, 1),
  }
}

export function shouldRunLunaShadow({ config = {}, domain = 'bath', sampleKey = '' } = {}) {
  const resolved = resolveLunaShadowConfig(config)
  if (!resolved.enabled) return false
  if (!resolved.domains.has(String(domain || '').trim().toLowerCase())) return false
  if (resolved.sampleRate <= 0) return false
  if (resolved.sampleRate >= 1) return true
  return stableUnitInterval(sampleKey) < resolved.sampleRate
}
