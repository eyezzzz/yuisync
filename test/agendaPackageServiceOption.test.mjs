import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const integration = await readFile(new URL('../src/modules/petshop/pages/AgendaPackageIntegratedPage.jsx', import.meta.url), 'utf8')
const option = await readFile(new URL('../src/modules/petshop/pages/AgendaPackageServiceOption.jsx', import.meta.url), 'utf8')

test('Agenda usa a opcao prioritaria de pacote no seletor nativo', () => {
  assert.match(integration, /AgendaPackageServiceOption/)
  assert.doesNotMatch(integration, /AgendaPackageInlinePanel/)
  assert.match(option, /Servicos encontrados/)
  assert.match(option, /data-yuisync-package-service-option/)
  assert.match(option, /listbox\.prepend\(root\)/)
})

test('Pacote ativo e localizado pelo cliente selecionado', () => {
  assert.match(option, /matchActivePackageSubscription/)
  assert.match(option, /selectedClientText/)
  assert.match(option, /Pacote ativo · prioridade/)
  assert.match(option, /packageName\(subscription\)/)
})

test('Opcao do pacote adiciona servico real e fecha a selecao', () => {
  assert.match(option, /selectNativeService/)
  assert.match(option, /Usar \$\{escapeHtml\(packageName\(subscription\)\)\}/)
  assert.match(option, /R\$ 0,00/)
  assert.match(option, /closeServicePicker\(modal\)/)
})

test('Planos legados e MotoDog permanecem compativeis', () => {
  assert.match(option, /compatibleLegacyEntries/)
  assert.match(option, /legacy_benefit_type/)
  assert.match(option, /MotoDog disponível/)
  assert.match(option, /selecione o transporte quando necessário/)
})
