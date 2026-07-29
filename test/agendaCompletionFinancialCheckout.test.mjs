import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  APPOINTMENT_CHECKOUT_SESSION_KEY,
  ORDERS_TAB_SESSION_KEY,
  appointmentCheckoutTotals,
  appointmentNeedsPayment,
  clearQueuedAppointmentCheckout,
  queueAppointmentCheckout,
  readQueuedAppointmentCheckout,
} from '../src/modules/petshop/pages/appointmentCheckoutFlow.js'

const transportOptions = [
  { id: 'buscar_e_levar', label: 'Buscar e levar', fee: 20, active: true },
]

test('atendimento integralmente coberto pelo pacote nao gera valor a receber', () => {
  const appointment = {
    id: 'appointment-package',
    price: 0,
    transport_mode: 'buscar_e_levar',
    service_items: [{
      code: 'banho_pequeno',
      unit_price: 0,
      catalog_price: 80,
      subscription_benefit_used: true,
      transport_benefit_used: true,
    }],
  }

  const totals = appointmentCheckoutTotals(appointment, transportOptions)
  assert.equal(totals.total, 0)
  assert.equal(totals.catalogTotal, 100)
  assert.equal(totals.discount, 100)
  assert.equal(appointmentNeedsPayment(appointment, transportOptions), false)
})

test('atendimento avulso e extra fora do pacote permanecem cobraveis', () => {
  const avulso = {
    id: 'appointment-retail',
    price: 100,
    transport_mode: 'buscar_e_levar',
    service_items: [{ code: 'tosa', unit_price: 80, catalog_price: 80 }],
  }
  const extra = {
    id: 'appointment-extra',
    price: 25,
    transport_mode: 'cliente_leva',
    service_items: [
      { code: 'banho_pequeno', unit_price: 0, catalog_price: 80, subscription_benefit_used: true },
      { code: 'hidratacao', unit_price: 25, catalog_price: 25 },
    ],
  }

  assert.equal(appointmentCheckoutTotals(avulso, transportOptions).total, 100)
  assert.equal(appointmentNeedsPayment(avulso, transportOptions), true)
  assert.equal(appointmentCheckoutTotals(extra, transportOptions).total, 25)
  assert.equal(appointmentCheckoutTotals(extra, transportOptions).discount, 80)
})

test('handoff preserva atendimento, data e aba Banho & Tosa', () => {
  const storage = new Map()
  global.window = {
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  }

  const appointment = {
    id: 'appointment-123',
    scheduled_at: '2026-07-29T14:30:00-03:00',
  }
  queueAppointmentCheckout(appointment)

  const queued = readQueuedAppointmentCheckout()
  assert.equal(queued.appointment_id, appointment.id)
  assert.equal(queued.date, '2026-07-29')
  assert.equal(storage.get(ORDERS_TAB_SESSION_KEY), 'banho_tosa')
  assert.ok(storage.get(APPOINTMENT_CHECKOUT_SESSION_KEY))

  clearQueuedAppointmentCheckout()
  assert.equal(readQueuedAppointmentCheckout(), null)
  delete global.window
})

test('Agenda e BanhoTosaPdvPanel usam o fluxo financeiro compartilhado', async () => {
  const [agenda, resolved, panel, wrapper] = await Promise.all([
    readFile(new URL('../src/modules/petshop/pages/AgendaPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/petshop/pages/AgendaResolvedPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/petshop/pages/BanhoTosaPdvPanel.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/petshop/pages/AgendaPackageIntegratedPage.jsx', import.meta.url), 'utf8'),
  ])

  assert.match(agenda, /handleCompletedAction/)
  assert.match(agenda, /paymentPending \? 'Receber' : 'Imprimir'/)
  assert.match(agenda, /queueAppointmentCheckout\(appointment\)/)
  assert.match(resolved, /appointmentCheckoutTotals\(updated, transportOptions\)/)
  assert.match(resolved, /setPage\?\.\('ordens'\)/)
  assert.match(panel, /readQueuedAppointmentCheckout\(\)/)
  assert.match(panel, /openCheckout\(entry\.appointment, entry\.totals\)/)
  assert.match(panel, /checkout_petshop_appointment_transaction/)
  assert.match(wrapper, /AgendaIntegratedPage setPage=\{setPage\}/)
})
