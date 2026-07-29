import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  classifyAppointmentServiceGroup,
  serviceOptionsForAppointmentGroup,
} from '../src/modules/petshop/lib/appointmentServices.js'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('tosa cadastrada como outro continua disponivel em banho/tosa', () => {
  const tosa = {
    code: 'tosa_higienica_pequeno',
    name: 'TOSA HIGIENICA PORTE PEQUENO',
    category: 'Servicos de Tosa',
    group_type: 'outro',
    active: true,
  }

  assert.equal(classifyAppointmentServiceGroup(tosa), 'banho_tosa')
  assert.deepEqual(serviceOptionsForAppointmentGroup([tosa], 'banho_tosa'), [tosa])
})

test('transporte nao vira servico de banho mesmo com cadastro legado', () => {
  assert.equal(classifyAppointmentServiceGroup({
    code: 'motodog_banho',
    name: 'MotoDog para banho',
    group_type: 'motoboy',
  }), 'outro')
})

test('integracao da Agenda nao oculta o painel de pacote e tosas', async () => {
  const integrated = await read('src/modules/petshop/pages/AgendaPackageIntegratedPage.jsx')
  const inline = await read('src/modules/petshop/pages/AgendaPackageInlinePanel.jsx')

  assert.match(integrated, /AgendaPackageInlinePanel/)
  assert.doesNotMatch(integrated, /\[data-yuisync-inline-package-root\]/)
  assert.doesNotMatch(integrated, /AgendaPackageServiceOption/)
  assert.match(inline, /Pacote ativo · prioridade/)
  assert.match(inline, /Tosas cadastradas/)
  assert.match(inline, /subscriptionForClient/)
})
