function clone(value) {
  return structuredClone(value)
}

const FIXTURES = Object.freeze({
  petshop_standard: {
    clock: { now: '2026-07-24T12:00:00-03:00', timezone: 'America/Sao_Paulo' },
    catalog: {
      services: [
        {
          id: 'svc_bath_small',
          kind: 'service',
          name: 'BANHO PET PORTE PEQUENO 0 KG A 10 KG (TODAS AS PELAGENS)',
          unit_price: 55,
          duration_min: 60,
          active: true,
        },
        {
          id: 'svc_hydration',
          kind: 'additional_service',
          name: 'HIDRATAÇÃO DO PELO',
          unit_price: 15,
          duration_min: 15,
          active: true,
        },
      ],
      transport: [
        { id: 'customer_brings', mode: 'customer_brings', label: 'Cliente leva', fee: 0, active: true },
        { id: 'buscar_e_levar', mode: 'buscar_e_levar', label: 'Buscar e levar', fee: 20, active: true },
        { id: 'somente_buscar', mode: 'somente_buscar', label: 'Somente buscar', fee: 15, active: true },
        { id: 'somente_levar', mode: 'somente_levar', label: 'Somente levar', fee: 15, active: true },
      ],
    },
    schedule: {
      available: [
        '2026-07-27T10:00:00-03:00',
        '2026-07-27T14:00:00-03:00',
        '2026-07-27T16:00:00-03:00',
        '2026-07-28T15:00:00-03:00',
      ],
      occupied: ['2026-07-27T13:30:00-03:00'],
    },
    inventory: {},
  },
  slot_becomes_unavailable: {
    faults: { occupy_before_confirm: true },
  },
  transaction_failure: {
    faults: { transaction_failure: true },
  },
  ambiguous_after_commit: {
    faults: { ambiguous_after_commit: true },
  },
})

function mergeObjects(left, right) {
  if (Array.isArray(right)) return clone(right)
  if (!right || typeof right !== 'object') return right === undefined ? clone(left) : right
  const output = left && typeof left === 'object' && !Array.isArray(left) ? clone(left) : {}
  for (const [key, value] of Object.entries(right)) {
    output[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? mergeObjects(output[key], value)
      : clone(value)
  }
  return output
}

export function getEvalFixture(name) {
  const fixture = FIXTURES[String(name || '').trim()]
  if (!fixture) throw new Error(`Unknown Luna eval fixture: ${name}`)
  return clone(fixture)
}

export function resolveEvalFixtures(input = {}) {
  const names = Array.isArray(input)
    ? input
    : Array.isArray(input?.extends)
      ? input.extends
      : [input?.base || 'petshop_standard', ...(Array.isArray(input?.overlays) ? input.overlays : [])]
  let resolved = {}
  for (const name of names.filter(Boolean)) resolved = mergeObjects(resolved, getEvalFixture(name))
  if (!names.length) resolved = getEvalFixture('petshop_standard')
  return mergeObjects(resolved, input?.overrides || {})
}

export function listEvalFixtures() {
  return Object.keys(FIXTURES)
}
