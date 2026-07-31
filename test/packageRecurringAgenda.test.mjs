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

test('card de pacote preserva selo na coluna do valor e remove o valor zero', async () => {
  const source = await read('src/modules/petshop/components/AgendaCardLayoutEnhancer.jsx')
  assert.match(source, /data-yuisync-card-kind='package'[\s\S]*\.yuisync-card-tutor[\s\S]*text-overflow:\s*ellipsis/)
  assert.match(source, /data-yuisync-card-kind='package'[\s\S]*\.yuisync-card-service\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto/)
  assert.match(source, /data-yuisync-card-kind='package'[\s\S]*\.yuisync-card-service > span:first-child[\s\S]*-webkit-line-clamp:\s*2/)
  assert.match(source, /\.yuisync-package-label\s*\{[\s\S]*grid-column:\s*2\s*!important/)
  assert.match(source, /\.yuisync-package-label::before[\s\S]*content:\s*'PACOTE'/)
  assert.doesNotMatch(source, /content:\s*'R\$ 0,00'/)
})

test('venda do pacote aceita primeira data passada e identifica legado e futuro', async () => {
  const source = await read('src/modules/petshop/components/PackageRecurringScheduleEnhancer.jsx')
  assert.match(source, /Primeiro atendimento do ciclo/)
  assert.match(source, /Horario fixo semanal/)
  assert.match(source, /dateInput\.removeAttribute\('min'\)/)
  assert.match(source, /consumido como legado/)
  assert.match(source, /reserva futura/)
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

test('migration original cria quatro reservas idempotentes na ativacao', async () => {
  const source = await read('supabase/migrations/20260731174500_petshop_package_recurring_appointments.sql')
  assert.match(source, /add column if not exists first_appointment_at timestamptz/)
  assert.match(source, /after update of status on public\.client_subscriptions/)
  assert.match(source, /new\.first_appointment_at is null/)
  assert.match(source, /for v_index in 0\.\.3/)
  assert.match(source, /subscription:%s:weekly:%s/)
  assert.match(source, /book_petshop_appointment_transaction/)
  assert.match(source, /recurring_appointments_created_at = now\(\)/)
})

test('hotfix cria o pet real consome datas passadas e reserva apenas futuras', async () => {
  const source = await read('supabase/migrations/20260731193000_petshop_package_recurring_pet_legacy_dates.sql')
  assert.match(source, /ensure_petshop_pet_from_client\(new\.client_id\)/)
  assert.match(source, /'pet_id', v_pet_id/)
  assert.doesNotMatch(source, /'pet_id', new\.client_id/)
  assert.match(source, /if v_scheduled_at < now\(\) then/)
  assert.match(source, /reserve_petshop_subscription_benefit/)
  assert.match(source, /continue;/)
  assert.match(source, /book_petshop_appointment_transaction/)
  assert.match(source, /subscription:%s:weekly:%s/)
})
