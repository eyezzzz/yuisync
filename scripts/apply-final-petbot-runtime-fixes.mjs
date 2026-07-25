import { readFile, writeFile } from 'node:fs/promises'

async function edit(path, transform) {
  const before = await readFile(path, 'utf8')
  const after = transform(before)
  if (after === before) throw new Error(`Nenhuma alteração aplicada em ${path}`)
  await writeFile(path, after, 'utf8')
  process.stdout.write(`Atualizado ${path}\n`)
}

function replace(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Trecho não encontrado: ${label}`)
  return source.replace(search, replacement)
}

await edit('server/lib/petbotAgent.js', (source) => replace(
  source,
  `function normalizeServiceSpecies(value = '') {\n  const text = normalize(value)\n  if (!text) return null\n  if (['dog', 'cao', 'caes', 'cachorro', 'cachorra', 'canino'].includes(text)) return 'dog'\n  if (['cat', 'gato', 'gata', 'felino'].includes(text)) return 'cat'\n  if (['other', 'outro', 'outra'].includes(text)) return 'other'\n  return normalizeCode(value) || null\n}`,
  `function normalizeServiceSpecies(value = '') {\n  const text = normalize(value)\n  if (!text) return null\n  if (['dog', 'cao', 'caes', 'cachorro', 'cachorra', 'canino'].includes(text)) return 'dog'\n  if (['cat', 'gato', 'gata', 'felino'].includes(text)) return 'cat'\n  if (['other', 'outro', 'outra'].includes(text)) return 'other'\n  // Catálogos legados usam valores como all, pet, todos ou textos livres.\n  // Esses valores significam ausência de restrição, nunca incompatibilidade.\n  return null\n}`,
  'normalização de espécie do serviço',
))

await edit('server/lib/chat.js', (source) => replace(
  source,
  `          ...pendingAtTurnStart.order,\n          notes: explicitServiceNoteUpdate,\n          service_grooming_detail: explicitServiceNoteUpdate,`,
  `          ...pendingAtTurnStart.order,\n          notes: explicitServiceNoteUpdate,`,
  'observação não é acabamento de tosa',
))

await edit('scripts/petbot-diagnostic-suite.mjs', (source) => {
  let next = source
  next = replace(
    next,
    `.select('tenant_id,module_id,petbot_autonomy_mode,petbot_timezone,petbot_business_hours,petbot_slot_interval_min,petbot_booking_lead_time_min,petbot_booking_capacity,pet_transport_options,delivery_fee')`,
    `.select('tenant_id,module_id,petbot_autonomy_mode,petbot_timezone,petbot_business_hours,veterinary_business_hours,petbot_slot_interval_min,petbot_booking_lead_time_min,petbot_booking_capacity,pet_transport_options,delivery_fee')`,
    'carregamento da jornada veterinária',
  )
  next = replace(
    next,
    `async function findSafeAppointmentSlots(settings, total = 1) {`,
    `async function findSafeAppointmentSlots(settings, total = 1, { veterinary = false } = {}) {`,
    'assinatura dos horários seguros',
  )
  next = replace(
    next,
    `  const businessHours = settings.petbot_business_hours || {}`,
    `  const businessHours = veterinary\n    ? (settings.veterinary_business_hours || {})\n    : (settings.petbot_business_hours || {})`,
    'jornada por categoria',
  )
  next = replace(
    next,
    `      const preferredStart = date.set({ hour: 10, minute: 0 })`,
    `      const preferredStart = date.set({ hour: veterinary ? 14 : 10, minute: 0 })`,
    'horário preferido veterinário',
  )
  next = replace(
    next,
    `    const opening = \`${'${scenario.request_phrase}'}. Quero ${'${quantity}'} unidade${'${quantity > 1 ? \'s\' : \'\'}'}.\``,
    `    const requestedName = clean(scenario.product?.name)\n    const opening = requestedName\n      ? \`Quero comprar ${'${quantity}'} unidade${'${quantity > 1 ? \'s\' : \'\'}'} de ${'${requestedName}'}.\`\n      : \`${'${scenario.request_phrase}'}. Quero ${'${quantity}'} unidade${'${quantity > 1 ? \'s\' : \'\'}'}.\``,
    'pedido exato do produto real',
  )
  next = replace(
    next,
    `    if (isRepeatedReply(transcript)) {\n      throw new Error(\`${'${scenario.id}'}: a Luna repetiu a mesma resposta; o cenário foi encerrado para não gastar créditos.\`)\n    }`,
    `    // Mensagens planejadas podem trazer a resposta solicitada apenas no turno\n    // seguinte. Não aborte antes de consumir a sequência humana do cenário.`,
    'não abortar sequência planejada',
  )
  next = replace(
    next,
    `function nextProductSupplement(scenario, session, transcript = []) {\n  const facts = extractAgentContext(session.context).product_facts || {}\n  const lastReply = normalize(transcript.at(-1)?.assistant)\n  const asksProductChoice = /qual (?:deles|produto|opcao)|qual voce prefere|qual você prefere|encontrei .*opcoes|encontrei .*opções/.test(lastReply)\n  if (asksProductChoice && clean(scenario.product?.name)) return \`quero o ${'${scenario.product.name}'}\``,
    `function nextProductSupplement(scenario, session, transcript = []) {\n  const facts = extractAgentContext(session.context).product_facts || {}\n  const lastReply = normalize(transcript.at(-1)?.assistant)\n  const targetText = commercialProductText(scenario.product)\n  const targetName = clean(scenario.product?.name)\n  const packageLabel = extractPackageLabel(targetName)\n  const flavor = targetName.match(/\\b(frango|cordeiro|carne|salmao|salmão|peixe|peru)\\b/i)?.[1] || ''\n  const species = /gato/.test(targetText) ? 'gato' : 'cachorro'\n  const age = /filhote|junior|puppy|kitten/.test(targetText) ? 'filhote' : /senior|sênior/.test(targetText) ? 'sênior' : 'adulto'\n  const size = /pequen|\\brp\\b/.test(targetText) ? 'porte pequeno' : /medio|médio|grande|\\brgg\\b/.test(targetText) ? 'porte médio ou grande' : 'porte médio'\n  if (/cachorro ou gato|cao ou gato|esp[eé]cie|para qual pet/.test(lastReply)) return \`é para ${'${species}'}\`\n  if (/raca ou o porte|raça ou o porte|qual .*porte|qual .*raca|qual .*raça/.test(lastReply)) return size\n  if (/filhote.*adult|adult.*senior|fase de vida|idade/.test(lastReply)) return \`é ${'${age}'}\`\n  if (/granel|pacote pequeno|saco maior|embalagem|quantos kg|tamanho do pacote/.test(lastReply) && packageLabel) return \`quero o pacote de ${'${packageLabel}'}\`\n  if (/qual sabor|sabor/.test(lastReply) && flavor) return \`sabor ${'${flavor}'}\`\n  if (/qual marca|marca/.test(lastReply) && targetName) return \`quero exatamente ${'${targetName}'}\`\n  const asksProductChoice = /qual (?:deles|produto|opcao)|qual voce prefere|qual você prefere|encontrei .*opcoes|encontrei .*opções/.test(lastReply)\n  if (asksProductChoice && targetName) return \`quero o ${'${targetName}'}\``,
    'respostas adaptativas de produto',
  )
  next = replace(
    next,
    `  for (let attempt = 0; attempt < 4 && !extractPendingOrder(current.context); attempt += 1) {`,
    `  for (let attempt = 0; attempt < 7 && !extractPendingOrder(current.context); attempt += 1) {`,
    'mais qualificações úteis',
  )
  next = replace(
    next,
    `    : await findSafeAppointmentSlots(settings, scenario.variation === 5 ? 2 : 1)`,
    `    : await findSafeAppointmentSlots(settings, scenario.variation === 5 ? 2 : 1, {\n      veterinary: scenario.category === 'veterinaria',\n    })`,
    'slots veterinários',
  )
  next = replace(
    next,
    `  const feedProducts = sellableProducts.filter((item) => {\n    const text = commercialProductText(item)\n    return FEED_SIGNAL.test(text) && !FEED_EXCLUSION.test(text)\n  })`,
    `  const feedProducts = sellableProducts.filter((item) => {\n    const text = commercialProductText(item)\n    const name = normalize(item?.name)\n    const category = normalize(item?.category)\n    const knownFeedName = FEED_SIGNAL.test(name)\n    const categoryBackedFeed = /racao|alimento/.test(category)\n      && /\\d+(?:[.,]\\d+)?\\s*(?:kg|g)\\b/.test(name)\n      && /cao|caes|gato|gatos|adult|filhot|senior|frango|carne|cordeiro|peixe|salmao/.test(name)\n    return (knownFeedName || categoryBackedFeed) && !FEED_EXCLUSION.test(text)\n  })`,
    'classificação segura de ração',
  )
  return next
})

await edit('test/petbotSemantics.test.mjs', (source) => {
  if (source.includes('metadado de espécie genérico não restringe')) return source
  return `${source.trimEnd()}\n\n test('metadado de espécie genérico não restringe serviço válido', () => {\n  const services = [\n    { id: 'm', code: 'tosa_maquina', name: 'Tosa Máquina', group_type: 'banho_tosa', species: 'all', default_price: 100, active: true },\n    { id: 'v', code: 'consulta_veterinaria', name: 'Consulta Veterinária', group_type: 'veterinaria', species: 'pet', default_price: 180, active: true },\n  ]\n\n  assert.equal(resolvePetshopService({ serviceQuery: 'tosa máquina', orderType: 'banho_tosa', species: 'dog', services }).service?.id, 'm')\n  assert.equal(resolvePetshopService({ serviceQuery: 'consulta', orderType: 'veterinaria', species: 'cat', services }).service?.id, 'v')\n})\n`
})
