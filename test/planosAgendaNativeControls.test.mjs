import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('planos usa tela nativa com busca, edição e cancelamento', async () => {
  const modules = await read('src/config/modules.jsx')
  const page = await read('src/modules/petshop/pages/PlanosNativePage.jsx')

  assert.match(modules, /PlanosNativePage/)
  assert.match(page, /Pesquisar tutor, pet, telefone ou pacote/)
  assert.match(page, /Editar consumo/)
  assert.match(page, /Cancelar assinatura/)
  assert.match(page, /Continuar para pagamento/)
  assert.doesNotMatch(page, /<select[^>]*>\s*\{clients\.map/)
})

test('agenda mostra pacote e todas as tosas fora da lista limitada', async () => {
  const integrated = await read('src/modules/petshop/pages/AgendaPackageIntegratedPage.jsx')
  const controls = await read('src/modules/petshop/pages/AgendaNativePackageControls.jsx')

  assert.match(integrated, /AgendaNativePackageControls/)
  assert.match(controls, /Pacote ativo · prioridade/)
  assert.match(controls, /Tosas cadastradas/)
  assert.match(controls, /slice\(0, 80\)/)
  assert.match(controls, /Usar \$\{planName\}/)
  assert.match(controls, /Cliente selecionado sem pacote ativo/)
})
