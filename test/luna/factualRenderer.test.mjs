import assert from 'node:assert/strict'
import test from 'node:test'

import {
  enforceVerifiedReply,
  renderFactualResponse,
} from '../../server/lib/luna/index.js'

test('renderer factual não permite confirmação sem verificação', () => {
  const result = enforceVerifiedReply({
    reply: 'Pronto, agendado!',
    verification: {
      ok: false,
      issues: [{ code: 'PERSISTENCE_PARTIAL_FAILURE', severity: 'error' }],
    },
  })
  assert.equal(result.enforced, true)
  assert.doesNotMatch(result.reply, /agendamento foi confirmado/i)
})

test('renderer formata total em pt-BR sem alterar o valor', () => {
  const reply = renderFactualResponse('confirmed', { total: 55 })
  assert.match(reply, /R\$\s*55,00/)
})
