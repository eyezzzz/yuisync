const CEP_DIGITS = 8

export function normalizeCep(value = '') {
  return String(value || '').replace(/\D/g, '').slice(0, CEP_DIGITS)
}

export function formatCepInput(value = '') {
  const digits = normalizeCep(value)
  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

const uppercase = (value = '') => String(value || '').trim().toLocaleUpperCase('pt-BR')

export async function lookupBrazilianCep(value, options = {}) {
  const cep = normalizeCep(value)
  if (cep.length !== CEP_DIGITS) throw new Error('Informe um CEP com 8 digitos.')

  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: options.signal,
  })
  if (!response.ok) throw new Error('Nao foi possivel consultar o CEP agora.')

  const payload = await response.json()
  if (payload?.erro) throw new Error('CEP nao encontrado.')

  return {
    zip_code: formatCepInput(payload?.cep || cep),
    owner_address: uppercase(payload?.logradouro),
    owner_neighborhood: uppercase(payload?.bairro),
    owner_city: uppercase([payload?.localidade, payload?.uf].filter(Boolean).join(' - ')),
    address_complement: uppercase(payload?.complemento),
  }
}
