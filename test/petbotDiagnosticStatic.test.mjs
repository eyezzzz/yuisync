import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const runner = await readFile(new URL('../scripts/petbot-diagnostic-suite.mjs', import.meta.url), 'utf8')
const route = await readFile(new URL('../api/admin/petbot-e2e.ts', import.meta.url), 'utf8')
const panel = await readFile(new URL('../src/shared/components/PetbotDiagnosticSuite.jsx', import.meta.url), 'utf8')
const settings = await readFile(new URL('../src/shared/pages/SettingsPage.jsx', import.meta.url), 'utf8')

test('diagnóstico distribui 50 cenários em cinco caminhos reais', () => {
  assert.match(runner, /CATEGORY_ORDER = \['banho', 'servicos', 'produtos', 'racao', 'veterinaria'\]/)
  assert.equal((runner.match(/Array\.from\(\{ length: 10 \}/g) || []).length, 5)
  assert.match(runner, /total: scenarios\.length/)
})

test('catálogo é filtrado por intenção operacional e não pelos primeiros nomes', () => {
  assert.match(runner, /VETERINARY_EXCLUSION/)
  assert.match(runner, /GROOMING_SIGNAL/)
  assert.match(runner, /SERVICE_INTENTS/)
  assert.match(runner, /PRODUCT_INTENTS/)
  assert.match(runner, /consultationService/)
  assert.match(runner, /FEED_EXCLUSION/)
  assert.doesNotMatch(runner, /secondaryServices\[0\]/)
  assert.doesNotMatch(runner, /veterinaryServices, index/)
})

test('mensagens pedem por semântica e características sem copiar nome completo', () => {
  assert.match(runner, /productSemanticRequest/)
  assert.match(runner, /feedSemanticRequest/)
  assert.match(runner, /scenario\.service_intent\?\.request/)
  assert.match(runner, /quero uma ração/)
  assert.doesNotMatch(runner, /Quero agendar \$\{serviceName\}/)
  assert.doesNotMatch(runner, /Quero comprar .*\$\{productName\}/)
})

test('cada cenário usa uma requisição própria e falhas permanecem no relatório', () => {
  assert.match(route, /action === 'plan'/)
  assert.match(route, /action !== 'run_case'/)
  assert.match(route, /sendJson\(res, 200, \{ success: report\.success, data: report \}\)/)
  assert.match(panel, /for \(const scenario of queue\)/)
  assert.match(panel, /setResults\(\[\.\.\.accumulated\]\)/)
})

test('suíte não insiste em loops e limita mensagens complementares', () => {
  assert.match(runner, /attempt < 2/)
  assert.match(runner, /isRepeatedReply/)
  assert.match(runner, /o cenário foi encerrado para não gastar créditos/)
  assert.match(runner, /nenhuma frase foi repetida automaticamente/)
  assert.doesNotMatch(runner, /attempt < 8/)
  assert.doesNotMatch(runner, /attempt < 5/)
  assert.doesNotMatch(runner, /Pode preparar o resumo final com esses dados, por favor/)
})

test('relatório fica visível, persistido e executável por categoria', () => {
  assert.match(panel, /window\.localStorage\.setItem/)
  assert.match(panel, /Baixar JSON/)
  assert.match(panel, /Conversa/)
  assert.match(panel, /Memória estruturada/)
  assert.match(panel, /selectedCategory/)
  assert.match(panel, /Executar por grupo/)
  assert.match(panel, /Parar depois do atual/)
  assert.match(settings, /<PetbotDiagnosticSuite tenantId=\{activeTenantId\} canEdit=\{canEdit\} \/>/)
})

test('modo econômico não adiciona pausas e preserva limpeza e estoque', () => {
  assert.doesNotMatch(runner, /setTimeout\(/)
  assert.match(runner, /source: 'diagnostic_suite_fast'/)
  assert.match(runner, /stock_restored/)
  assert.match(runner, /remaining/)
  assert.match(runner, /duplicate_confirmation_safe/)
})

test('cenários cobrem alterações antes da confirmação e veterinária segura', () => {
  assert.match(runner, /Antes de confirmar, deixe/)
  assert.match(runner, /Antes de confirmar, pode acrescentar/)
  assert.match(runner, /Antes de confirmar, acrescente também/)
  assert.match(runner, /Meu cachorro está vomitando bastante, quanto é a consulta veterinária/)
  assert.match(runner, /Qual dose de dipirona posso dar/)
  assert.match(runner, /Meu cachorro está inconsciente e com dificuldade para respirar/)
})
