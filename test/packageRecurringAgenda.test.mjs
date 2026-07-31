import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('transporte aparece logo apos o cabecalho e antes dos nomes', async () => {
  const source = await read('src/modules/petshop/components/AgendaCardLayoutEnhancer.jsx')
  assert.match(source, /\.yuisync-card-header[\s\S]*order:\s*1\s*!important/)
  assert.match(source, /\.yuisync-card-transport[\s\S]*order:\s*2\s*!important/)
  assert.match(source, /\.yuisync-card-pet\s*\{\s*order:\s*3\s*!important/)
  assert.match(source, /data-yuisync-motodog='false'[\s\S]*display:\s*block\s*!important/)
})

test('venda do pacote exige primeira data e horario e grava na assinatura', async () => {
  const source = await read('src/modules/petshop/components/PackageRecurringScheduleEnhancer.jsx')
  assert.match(source, /Primeiro agendamento/)
  assert.match(source, /Horario fixo semanal/)
  assert.match(source, /first_appointment_at/)
  assert.match(source, /yuisync:subscription-schedule-saved/)
  assert.match(source, /Array\.from\(\{ length: 4 \}/)
})

test('checkout mostra as quatro datas e bloqueia ativacao sem agenda', async () => {
  const source = await read('src/modules/petshop/pages/PackageActivationReliablePanel.jsx')
  assert.match(source, /Agenda semanal do pacote/)
  assert.match(source, /schedule\.length === 4/)
  assert.match(source, /disabled=\{saving \|\| !scheduleReady\}/)
  assert.match(source, /Confirmar, ativar e reservar/)
})

test('migration cria quatro reservas idempotentes na ativacao', async () => {
  const source = await read('supabase/migrations/20260731174500_petshop_package_recurring_appointments.sql')
  assert.match(source, /add column if not exists first_appointment_at timestamptz/)
  assert.match(source, /after update of status on public\.client_subscriptions/)
  assert.match(source, /for v_index in 0\.\.3/)
  assert.match(source, /subscription:%s:weekly:%s/)
  assert.match(source, /book_petshop_appointment_transaction/)
  assert.match(source, /Informe a primeira data e o horario do pacote antes de confirmar o pagamento/)
  assert.match(source, /recurring_appointments_created_at = now\(\)/)
})
