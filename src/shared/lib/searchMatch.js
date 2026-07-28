export function normalizeSearchText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function searchTerms(value = '') {
  return normalizeSearchText(value)
    .split(' ')
    .map((term) => term.trim())
    .filter(Boolean)
}

export function matchesSearchTerms(query, fields = []) {
  const terms = searchTerms(query)
  if (terms.length === 0) return true

  const haystack = normalizeSearchText(
    (Array.isArray(fields) ? fields : [fields])
      .filter(Boolean)
      .join(' '),
  )

  return terms.every((term) => haystack.includes(term))
}
