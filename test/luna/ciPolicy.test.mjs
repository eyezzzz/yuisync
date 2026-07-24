import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateAuditReport } from '../../scripts/check-npm-audit.mjs'

const allowlist = {
  entries: [
    {
      package: 'shell-quote',
      review_by: '2026-08-31',
      reason: 'known dependency debt',
    },
    {
      package: 'concurrently',
      via_only: ['shell-quote'],
      review_by: '2026-08-31',
      reason: 'transitive only',
    },
  ],
}

test('audit aceita pacote pai somente pela cadeia transitiva declarada', () => {
  const result = evaluateAuditReport({
    vulnerabilities: {
      'shell-quote': { severity: 'high', via: [{ severity: 'high', title: 'advisory' }] },
      concurrently: { severity: 'high', via: ['shell-quote'] },
    },
  }, allowlist, { today: '2026-07-24' })

  assert.deepEqual(result.blocking, [])
  assert.equal(result.accepted.some((entry) => entry.package === 'concurrently'), true)
})

test('audit bloqueia pacote pai se a cadeia transitiva mudar', () => {
  const result = evaluateAuditReport({
    vulnerabilities: {
      concurrently: { severity: 'high', via: ['shell-quote', 'unexpected-package'] },
    },
  }, allowlist, { today: '2026-07-24' })

  assert.equal(result.blocking[0]?.reason, 'transitive_chain_changed')
})

test('audit bloqueia advisory direto mesmo em pacote com via_only', () => {
  const result = evaluateAuditReport({
    vulnerabilities: {
      concurrently: {
        severity: 'high',
        via: [{ severity: 'high', title: 'direct advisory' }, 'shell-quote'],
      },
    },
  }, allowlist, { today: '2026-07-24' })

  assert.equal(result.blocking[0]?.reason, 'direct_advisory_not_allowlisted')
})
