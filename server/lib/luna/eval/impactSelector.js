const RULES = Object.freeze([
  { pattern: /^server\/lib\/luna\/confirmation\//, groups: ['bath'], tags: ['confirmation', 'transaction', 'idempotency'] },
  { pattern: /^server\/lib\/luna\/bath\//, groups: ['bath'], tags: ['bath'] },
  { pattern: /^server\/lib\/luna\/(operation|runtime|tools|verifier|renderer|trace|errors)/, groups: ['bath'], tags: ['core'] },
  { pattern: /^server\/lib\/chat\.js$/, groups: ['all'], tags: ['core', 'integration'] },
  { pattern: /^server\/lib\/petbot/, groups: ['all'], tags: ['integration'] },
  { pattern: /^server\/lib\/luna\/eval\//, groups: ['all'], tags: ['eval_platform'] },
  { pattern: /^test\/luna\//, groups: ['all'], tags: ['tests'] },
  { pattern: /^scripts\/(run|compile|replay|select)-luna-eval/, groups: ['all'], tags: ['eval_platform'] },
])

export function selectEvalImpact(paths = []) {
  const normalized = [...new Set((Array.isArray(paths) ? paths : []).map((entry) => String(entry || '').trim()).filter(Boolean))]
  const groups = new Set()
  const tags = new Set()
  const matched = []
  for (const path of normalized) {
    for (const rule of RULES) {
      if (!rule.pattern.test(path)) continue
      matched.push(path)
      for (const group of rule.groups) groups.add(group)
      for (const tag of rule.tags) tags.add(tag)
    }
  }
  if (!groups.size && normalized.length) {
    groups.add('bath')
    tags.add('smoke')
  }
  if (!normalized.length) groups.add('all')
  return {
    paths: normalized,
    matched_paths: [...new Set(matched)],
    groups: [...groups],
    tags: [...tags],
    run_full: groups.has('all'),
  }
}

export const LUNA_EVAL_IMPACT_RULES = RULES
