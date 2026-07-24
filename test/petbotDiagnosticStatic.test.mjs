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

test('cada cenário usa uma requisição própria e falhas funcionais permanecem no relatório', () => {
  assert.match(route, /action === 'plan'/)
  assert.match(route, /action !== 'run_case'/)
  assert.match(route, /sendJson\(res, 200, \{ success: report\.success, data: report \}\)/)
  assert.match(panel, /for \(const scenario of queue\)/)
  assert.match(panel, /setResults\(\[\.\.\.accumulated\]\)/)
})

test('relatório fica visível e persistido fora dos logs da Vercel', () => {
  assert.match(panel, /window\.localStorage\.setItem/)
  assert.match(panel, /Baixar JSON/)
  assert.match(panel, /Conversa/)
  assert.match(panel, /Memória estruturada/)
  assert.match(settings, /<PetbotDiagnosticSuite tenantId=\{activeTenantId\} canEdit=\{canEdit\} \/>/)
})

test('modo rápido não adiciona pausas e preserva limpeza e estoque', () => {
  assert.doesNotMatch(runner, /setTimeout\(/)
  assert.match(runner, /source: 'diagnostic_suite_fast'/)
  assert.match(runner, /stock_restored/)
  assert.match(runner, /remaining/)
  assert.match(runner, /duplicate_confirmation_safe/)
})

test('cenários cobrem acréscimos antes da confirmação e veterinária segura', () => {
  assert.match(runner, /Antes de confirmar, acrescente também o serviço/)
  assert.match(runner, /Antes de confirmar, acrescente também 1 unidade/)
  assert.match(runner, /Meu cachorro está vomitando bastante, quanto é a consulta veterinária/)
  assert.match(runner, /Qual dose de dipirona posso dar/)
  assert.match(runner, /Meu cachorro está inconsciente e com dificuldade para respirar/)
})
