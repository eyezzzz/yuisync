import { afterEach, describe, expect, it } from 'vitest'
import {
  appointmentPriceBreakdown,
  chooseAgendaSlot,
  findAgendaCardCandidate,
  moneyNumber,
  slotTimeFromAria,
} from './agendaOperationalCore'

const transportOptions = [
  { id: 'buscar_e_levar', fee: 20, active: true },
  { id: 'somente_buscar', fee: 15, active: true },
]

const originalWindow = globalThis.window
afterEach(() => {
  globalThis.window = originalWindow
})

describe('agenda operational core', () => {
  it('mantem R$ 55,00 de servico e soma R$ 20,00 do MotoDog', () => {
    const result = appointmentPriceBreakdown({
      price: 55,
      transport_mode: 'buscar_e_levar',
      service_items: [{ unit_price: 55 }],
    }, transportOptions)

    expect(result).toEqual({ service: 55, transport: 20, total: 75 })
  })

  it('nao soma transporte duas vezes quando o total ja esta reconciliado', () => {
    const result = appointmentPriceBreakdown({
      price: 75,
      transport_mode: 'buscar_e_levar',
      service_items: [{ unit_price: 55 }],
    }, transportOptions)

    expect(result).toEqual({ service: 55, transport: 20, total: 75 })
  })

  it('separa o transporte de um total legado sem snapshots de servico', () => {
    const result = appointmentPriceBreakdown({
      price: 75,
      transport_mode: 'buscar_e_levar',
      service_items: [],
    }, transportOptions)

    expect(result).toEqual({ service: 55, transport: 20, total: 75 })
  })

  it('interpreta valores no formato brasileiro', () => {
    expect(moneyNumber('R$ 1.234,56')).toBe(1234.56)
  })

  it('seleciona a faixa de dez minutos mais proxima do ponteiro', () => {
    globalThis.window = { innerHeight: 800 }
    const slot0900 = {
      getBoundingClientRect: () => ({ left: 100, right: 700, top: 100, bottom: 124 }),
      getAttribute: () => 'Agendar as 09:00',
    }
    const slot0910 = {
      getBoundingClientRect: () => ({ left: 100, right: 700, top: 124, bottom: 148 }),
      getAttribute: () => 'Agendar as 09:10',
    }

    const selected = chooseAgendaSlot([slot0900, slot0910], 350, 138)
    expect(selected).toBe(slot0910)
    expect(slotTimeFromAria(selected)).toBe('09:10')
  })

  it('distingue agendamento ativo e concluido com mesmo pet e horario', () => {
    const active = { textContent: '09:00 - 10:00 Agendado TOBY' }
    const finished = { textContent: '09:00 - 10:00 Concluido TOBY' }
    const used = new Set()

    const activeMatch = findAgendaCardCandidate([finished, active], {
      interval: '09:00 - 10:00',
      petName: 'TOBY',
      statusLabel: 'Agendado',
    }, used)
    used.add(activeMatch)

    const finishedMatch = findAgendaCardCandidate([finished, active], {
      interval: '09:00 - 10:00',
      petName: 'TOBY',
      statusLabel: 'Concluido',
    }, used)

    expect(activeMatch).toBe(active)
    expect(finishedMatch).toBe(finished)
  })
})
