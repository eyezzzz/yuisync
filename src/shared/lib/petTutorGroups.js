const digits = (value = '') => String(value || '').replace(/\D/g, '')

export function createTutorGroupId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `tutor_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function fallbackIdentityKeys(pet = {}) {
  const keys = []
  const cpf = digits(pet.owner_cpf || pet.document)
  if (cpf.length >= 11) keys.push(`cpf:${cpf}`)

  const phone = digits(pet.phone)
  if (phone.length >= 10) keys.push(`phone:${phone}`)
  return keys
}

export function tutorIdentityKey(pet = {}) {
  const explicitGroup = String(pet.tutor_group_id || pet.details?.tutor_group_id || '').trim()
  if (explicitGroup) return `group:${explicitGroup}`

  const fallbackKeys = fallbackIdentityKeys(pet)
  if (fallbackKeys.length) return fallbackKeys[0]

  return `pet:${String(pet.id || '').trim()}`
}

export function groupPetsByTutor(pets = []) {
  const rows = (Array.isArray(pets) ? pets : []).filter((pet) => pet?.id)
  const explicitGroupByIdentity = new Map()

  for (const pet of rows) {
    const explicitGroup = String(pet.tutor_group_id || pet.details?.tutor_group_id || '').trim()
    if (!explicitGroup) continue
    const groupKey = `group:${explicitGroup}`
    for (const identityKey of fallbackIdentityKeys(pet)) {
      if (!explicitGroupByIdentity.has(identityKey)) explicitGroupByIdentity.set(identityKey, groupKey)
    }
  }

  const groups = new Map()
  for (const pet of rows) {
    const explicitGroup = String(pet.tutor_group_id || pet.details?.tutor_group_id || '').trim()
    const inheritedGroup = fallbackIdentityKeys(pet)
      .map((identityKey) => explicitGroupByIdentity.get(identityKey))
      .find(Boolean)
    const key = explicitGroup ? `group:${explicitGroup}` : inheritedGroup || tutorIdentityKey(pet)
    const current = groups.get(key) || {
      key,
      owner_name: pet.owner_name || '',
      owner_cpf: pet.owner_cpf || '',
      phone: pet.phone || '',
      email: pet.email || '',
      pets: [],
    }

    if (!current.pets.some((item) => String(item.id) === String(pet.id))) {
      current.pets.push(pet)
    }
    groups.set(key, current)
  }

  return [...groups.values()]
}
