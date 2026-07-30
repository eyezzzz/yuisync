const digits = (value = '') => String(value || '').replace(/\D/g, '')

export function createTutorGroupId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `tutor_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function tutorIdentityKey(pet = {}) {
  const explicitGroup = String(pet.tutor_group_id || pet.details?.tutor_group_id || '').trim()
  if (explicitGroup) return `group:${explicitGroup}`

  const cpf = digits(pet.owner_cpf || pet.document)
  if (cpf.length >= 11) return `cpf:${cpf}`

  const phone = digits(pet.phone)
  if (phone.length >= 10) return `phone:${phone}`

  return `pet:${String(pet.id || '').trim()}`
}

export function groupPetsByTutor(pets = []) {
  const groups = new Map()

  for (const pet of Array.isArray(pets) ? pets : []) {
    if (!pet?.id) continue
    const key = tutorIdentityKey(pet)
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
