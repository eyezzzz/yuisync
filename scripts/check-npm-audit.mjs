import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

export const severityRank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 }

function isThresholdSeverity(severity, threshold) {
  return (severityRank[String(severity || 'unknown').toLowerCase()] ?? 99) >= threshold
}

function assessAllowlistRule({ packageName, vulnerability, rule, today, threshold }) {
  const severity = String(vulnerability?.severity || 'unknown').toLowerCase()
  if (!rule) return { accepted: false, reason: 'not_allowlisted' }
  if (rule.review_by && rule.review_by < today) {
    return { accepted: false, reason: `allowlist_expired:${rule.review_by}` }
  }

  const viaOnly = Array.isArray(rule.via_only)
    ? [...new Set(rule.via_only.map((name) => String(name || '').trim()).filter(Boolean))].sort()
    : []

  if (viaOnly.length > 0) {
    const directAdvisories = (vulnerability?.via || []).filter(
      (entry) => entry && typeof entry === 'object' && isThresholdSeverity(entry.severity, threshold),
    )
    if (directAdvisories.length > 0) {
      return { accepted: false, reason: 'direct_advisory_not_allowlisted' }
    }

    const actualVia = [...new Set((vulnerability?.via || [])
      .filter((entry) => typeof entry === 'string')
      .map((name) => name.trim())
      .filter(Boolean))].sort()

    const unexpected = actualVia.filter((name) => !viaOnly.includes(name))
    const missing = viaOnly.filter((name) => !actualVia.includes(name))
    if (actualVia.length === 0 || unexpected.length > 0 || missing.length > 0) {
      return {
        accepted: false,
        reason: 'transitive_chain_changed',
        details: { expected_via: viaOnly, actual_via: actualVia },
      }
    }
  }

  return {
    accepted: true,
    entry: {
      package: packageName,
      severity,
      review_by: rule.review_by || null,
      reason: rule.reason || null,
      ...(viaOnly.length > 0 ? { via_only: viaOnly } : {}),
    },
  }
}

export function evaluateAuditReport(report, allowlist, { today = new Date().toISOString().slice(0, 10), threshold = severityRank.high } = {}) {
  const allowed = new Map((allowlist.entries || []).map((entry) => [entry.package, entry]))
  const blocking = []
  const accepted = []

  for (const [packageName, vulnerability] of Object.entries(report.vulnerabilities || {})) {
    const severity = String(vulnerability?.severity || 'unknown').toLowerCase()
    if (!isThresholdSeverity(severity, threshold)) continue

    const assessment = assessAllowlistRule({
      packageName,
      vulnerability,
      rule: allowed.get(packageName),
      today,
      threshold,
    })

    if (assessment.accepted) accepted.push(assessment.entry)
    else blocking.push({ package: packageName, severity, reason: assessment.reason, ...(assessment.details || {}) })
  }

  return { accepted, blocking }
}

async function main() {
  const allowlistPath = path.resolve('config/npm-audit-allowlist.json')
  const allowlist = JSON.parse(await readFile(allowlistPath, 'utf8'))
  const result = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8' })
  if (!result.stdout?.trim()) {
    console.error(result.stderr || 'npm audit did not return JSON.')
    process.exit(1)
  }

  let report
  try {
    report = JSON.parse(result.stdout)
  } catch {
    console.error(result.stdout)
    process.exit(1)
  }

  const evaluation = evaluateAuditReport(report, allowlist)
  console.log(JSON.stringify(evaluation, null, 2))
  if (evaluation.blocking.length) process.exit(1)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
