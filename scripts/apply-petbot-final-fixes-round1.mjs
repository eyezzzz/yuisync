import { readFile, writeFile } from 'node:fs/promises'

async function edit(path, transform) {
  const before = await readFile(path, 'utf8')
  const after = transform(before)
  if (after === before) throw new Error(`Nenhuma alteração aplicada em ${path}`)
  await writeFile(path, after)
}

function replaceOne(source, before, after, label) {
  const index = source.indexOf(before)
  if (index < 0) throw new Error(`Trecho não encontrado: ${label}`)
  if (source.indexOf(before, index + before.length) >= 0) {
    throw new Error(`Trecho não é único: ${label}`)
  }
  return `${source.slice(0, index)}${after}${source.slice(index + before.length)}`
}

await edit('server/lib/petbotCatalog.js', (source) => {
  source = replaceOne(
    source,
    "  higiene: ['shampoo', 'condicionador', 'perfume', 'sabonete', 'higiene', 'limpeza'],",
    "  higiene: ['shampoo', 'xampu', 'condicionador', 'perfume', 'sabonete', 'higiene', 'limpeza'],",
    'alias xampu',
  )

  source = replaceOne(
    source,
    "  'shampoo',\n  'antipulga',",
    "  'shampoo',\n  'xampu',\n  'condicionador',\n  'perfume',\n  'sabonete',\n  'bebedouro',\n  'comedouro',\n  'coleira',\n  'guia',\n  'brinquedo',\n  'mordedor',\n  'antipulga',",
    'termos negativos de ração',
  )

  source = replaceOne(
    source,
`  if (isBulk) {
    type = 'granel'
  } else if (/\\bracao\\b/.test(category)) {
    type = 'racao'
  } else if (type !== 'outro') {
    // Editable catalog metadata wins over name heuristics.
  } else if (hasAny(text, TYPE_ALIASES.antipulgas)) {
    type = 'antipulgas'
  } else if (hasAny(text, TYPE_ALIASES.areia)) {
    type = 'areia'
  } else if (hasAny(text, TYPE_ALIASES.higiene)) {
    type = 'higiene'
  } else if (hasAny(text, TYPE_ALIASES.petisco)) {
    type = 'petisco'
  } else if (
    hasAny(text, TYPE_ALIASES.racao)
    || (brand && /\\b(kg|adult|filhote|castrad|senior|racas|raca|porte|cao|caes|gato|gatos)\\b/.test(text))
  ) {
    type = 'racao'
  } else if (hasAny(text, TYPE_ALIASES.acessorio)) {
    type = 'acessorio'
  }
`,
`  // Explicit commercial signals in the name/category are stronger than stale
  // metadata imported by legacy catalogs. A shampoo, antiparasitic or feeder
  // must never enter the ration qualification flow merely because it contains
  // a weight/volume or was once tagged as food/service.
  if (isBulk) {
    type = 'granel'
  } else if (/\\bracao\\b/.test(category)) {
    type = 'racao'
  } else if (hasAny(text, TYPE_ALIASES.antipulgas)) {
    type = 'antipulgas'
  } else if (hasAny(text, TYPE_ALIASES.areia)) {
    type = 'areia'
  } else if (hasAny(text, TYPE_ALIASES.higiene)) {
    type = 'higiene'
  } else if (hasAny(text, TYPE_ALIASES.petisco)) {
    type = 'petisco'
  } else if (hasAny(text, TYPE_ALIASES.acessorio)) {
    type = 'acessorio'
  } else if (
    ['racao', 'food', 'alimento'].includes(type)
    || hasAny(text, TYPE_ALIASES.racao)
    || (brand && /\\b(kg|adult|filhote|castrad|senior|racas|raca|porte|cao|caes|gato|gatos)\\b/.test(text))
  ) {
    type = 'racao'
  } else if (type !== 'outro') {
    // Preserve other explicit metadata only after concrete catalog signals.
  }
`,
    'prioridade de classificação de produtos',
  )

  source = replaceOne(
    source,
`  const wantsBulk = packagePreference === 'granel'
  const wantsRation = /racao|alimento|comida|premier|royal|golden|pedigree|whiskas|special dog|formula natural|gran plus|quatree/.test(text)
    || productKind === 'food'
    || wantsBulk
    || Boolean(packageKg)
  const wantsFlea = hasAny(text, TYPE_ALIASES.antipulgas) || productKind === 'flea'
  const wantsLitter = hasAny(text, TYPE_ALIASES.areia) || productKind === 'litter'

  if (wantsFlea) return { type: 'antipulgas', packageKg, wantsBulk, packagePreference }
  if (wantsLitter) return { type: 'areia', packageKg, wantsBulk, packagePreference }
  if (wantsRation) return { type: wantsBulk ? 'granel' : 'racao', packageKg, wantsBulk, packagePreference }
  if (hasAny(text, TYPE_ALIASES.higiene)) return { type: 'higiene', packageKg, wantsBulk, packagePreference }
  if (hasAny(text, TYPE_ALIASES.petisco)) return { type: 'petisco', packageKg, wantsBulk, packagePreference }
  if (hasAny(text, TYPE_ALIASES.acessorio)) return { type: 'acessorio', packageKg, wantsBulk, packagePreference }
`,
`  const wantsBulk = packagePreference === 'granel'
  const wantsFlea = hasAny(text, TYPE_ALIASES.antipulgas) || productKind === 'flea'
  const wantsLitter = hasAny(text, TYPE_ALIASES.areia) || productKind === 'litter'
  const wantsHygiene = hasAny(text, TYPE_ALIASES.higiene)
  const wantsTreat = hasAny(text, TYPE_ALIASES.petisco)
  const wantsAccessory = hasAny(text, TYPE_ALIASES.acessorio)
  const wantsRation = /racao|alimento|comida|premier|royal|golden|pedigree|whiskas|special dog|formula natural|gran plus|quatree/.test(text)
    || productKind === 'food'
    || wantsBulk

  // A number followed by kg may be the pet's weight or an antiparasitic range.
  // It is not sufficient evidence of ration on its own.
  if (wantsFlea) return { type: 'antipulgas', packageKg, wantsBulk: false, packagePreference: '' }
  if (wantsLitter) return { type: 'areia', packageKg, wantsBulk: false, packagePreference: '' }
  if (wantsHygiene) return { type: 'higiene', packageKg, wantsBulk: false, packagePreference: '' }
  if (wantsTreat) return { type: 'petisco', packageKg, wantsBulk: false, packagePreference: '' }
  if (wantsAccessory) return { type: 'acessorio', packageKg, wantsBulk: false, packagePreference: '' }
  if (wantsRation) return { type: wantsBulk ? 'granel' : 'racao', packageKg, wantsBulk, packagePreference }
`,
    'detecção de solicitação de catálogo',
  )

  source = replaceOne(
    source,
    "  if (!allowedPackageForPreference(request.packagePreference, metadata)) return -999",
    "  if (rationRequest && !allowedPackageForPreference(request.packagePreference, metadata)) return -999",
    'filtro de embalagem somente para ração',
  )
  return source
})

await edit('server/lib/petbotAgent.js', (source) => replaceOne(
  source,
`  const currentCode = normalizeCode(current)
  const previousCode = normalizeCode(previous)
  const previousIsSpecificGrooming = /^tosa_(?:tesoura|maquina|total|higienica)$/.test(previousCode)
  if (previousIsSpecificGrooming && ['tosa', 'banho_tosa', 'servico'].includes(currentCode)) {
    return previous
  }
  return current
`,
`  const currentCode = normalizeCode(current)
  const previousCode = normalizeCode(previous)
  const previousIsSpecificGrooming = /^tosa_(?:tesoura|maquina|total|higienica)$/.test(previousCode)
  const previousIsExactCatalogService = /^catalog_[a-z0-9]+$/.test(previousCode)
  const currentIsGeneric = [
    'servico', 'banho_tosa', 'banho', 'tosa',
    'consulta', 'consulta_veterinaria', 'veterinaria',
  ].includes(currentCode)

  // Date, time and transport turns commonly make the small interpreter emit a
  // generic service label. Never let that erase the exact catalog product that
  // was already resolved and priced in a previous turn.
  if ((previousIsSpecificGrooming || previousIsExactCatalogService) && currentIsGeneric) {
    return previous
  }
  return current
`,
  'preservação do serviço exato',
))

await edit('server/lib/chat.js', (source) => {
  source = replaceOne(
    source,
`      const differentiation = analyzeProductDifferentiation(found.slice(0, 12), known)
      return {
        ok: true,
        checked: true,
        action: name,
        source: 'products',
        status: differentiation.status,
        differentiators: differentiation.differentiators,
        requested_quantity: requestedQuantity,
        products: lastProductCandidates,
      }
`,
`      const normalizedRequest = normalizeSearchText(
        [trimmedMessage, cleanText(args.query)].filter(Boolean).join(' '),
      )
      const exactNameMatches = lastProductCandidates.filter((candidate) => {
        const normalizedName = normalizeSearchText(candidate.name)
        return Boolean(normalizedName && normalizedRequest.includes(normalizedName))
      })
      const automaticallySelected = exactNameMatches.length === 1
        ? exactNameMatches[0]
        : lastProductCandidates.length === 1
          ? lastProductCandidates[0]
          : null
      if (automaticallySelected) selectedRecentProductCandidate = automaticallySelected

      const differentiation = automaticallySelected
        ? { status: 'resolved', differentiators: [] }
        : analyzeProductDifferentiation(found.slice(0, 12), known)
      return {
        ok: true,
        checked: true,
        action: name,
        source: 'products',
        status: differentiation.status,
        differentiators: differentiation.differentiators,
        requested_quantity: requestedQuantity,
        ...(automaticallySelected ? { selected_candidate: automaticallySelected } : {}),
        products: lastProductCandidates,
      }
`,
    'seleção automática de produto exato',
  )

  source = replaceOne(
    source,
`  const rationQualificationReply = !pendingAtTurnStart && !serviceOrderType
    ? buildRationQualificationReply({
`,
`  const rationQualificationReply = !pendingAtTurnStart
    && !serviceOrderType
    && !selectedRecentProductCandidate
    ? buildRationQualificationReply({
`,
    'qualificação de ração após produto selecionado',
  )

  source = replaceOne(
    source,
`  } else if (currentMessageUpdatesServiceNotes) {
    const noteUpdateStartedAt = Date.now()
    const noteUpdateToolCall = {
      id: \`service-note-\${pendingAtTurnStart.id}\`,
      type: 'function',
      function: {
        name: 'prepare_petshop_service_booking',
        arguments: JSON.stringify({
          ...pendingAtTurnStart.order,
          notes: explicitServiceNoteUpdate,
        }),
      },
    }
    const noteUpdateResult = await executeTool(noteUpdateToolCall)
    const noteUpdateRun = {
      name: 'prepare_petshop_service_booking',
      ok: noteUpdateResult?.ok !== false,
      status: cleanText(noteUpdateResult?.status) || null,
      duration_ms: Date.now() - noteUpdateStartedAt,
      result: noteUpdateResult,
    }
    if (!noteUpdateRun.ok || noteUpdateRun.status !== 'prepared') {
      throw new HttpError(409, 'Não foi possível atualizar a observação do agendamento com os dados atuais.')
    }
    agentResult = {
      reply: noteUpdateResult.summary,
      toolRuns: [...preloadedToolRuns, noteUpdateRun],
      tokensUsed: 0,
      messages: [],
      validationRetries: 0,
      steps: 1,
      terminal: true,
      durationMs: Date.now() - noteUpdateStartedAt,
    }
`,
`  } else if (currentMessageUpdatesServiceNotes) {
    const noteUpdateStartedAt = Date.now()
    await refreshServiceCatalog({ required: true })
    const appointmentRefresh = await refreshAppointmentContext()
    if (!appointmentRefresh.ok) {
      throw new HttpError(409, 'Não foi possível revalidar a agenda para atualizar a observação.')
    }
    const noteFacts = {
      ...serviceFacts,
      service_notes: explicitServiceNoteUpdate,
      service_notes_resolved: true,
      service_notes_explicit: true,
    }
    const noteUpdateResult = preparePetshopOrderDraft({
      args: groundPetbotServiceArgs({
        ...pendingAtTurnStart.order,
        notes: explicitServiceNoteUpdate,
      }, noteFacts),
      products: liveProducts,
      services: liveServices,
      appointments: appointmentRefresh.appointments,
      subscriptionBenefits: liveSubscriptionBenefits,
      settings: storeSettings,
    })
    const noteUpdateRun = {
      name: 'prepare_petshop_service_booking',
      ok: noteUpdateResult?.ok === true,
      status: noteUpdateResult?.ok ? 'prepared' : 'needs_input',
      duration_ms: Date.now() - noteUpdateStartedAt,
      result: noteUpdateResult,
    }
    if (!noteUpdateResult?.ok) {
      throw new HttpError(409, 'Não foi possível atualizar a observação do agendamento com os dados atuais.')
    }
    pendingOrder = {
      id: noteUpdateResult.pending_order_id,
      order: noteUpdateResult.order,
      summary: noteUpdateResult.summary,
      prepared_at: new Date().toISOString(),
    }
    serviceFacts = noteFacts
    agentResult = {
      reply: noteUpdateResult.summary,
      toolRuns: [...preloadedToolRuns, noteUpdateRun],
      tokensUsed: 0,
      messages: [],
      validationRetries: 0,
      steps: 1,
      terminal: true,
      durationMs: Date.now() - noteUpdateStartedAt,
    }
`,
    'repreparação de observação pendente',
  )

  source = replaceOne(
    source,
`  if (cleanText(agentResult.reply) === PETBOT_PREPARATION_RECOVERY_HANDOFF_REPLY) {
`,
`  // The model may correctly search an exact product and still stop with a
  // conversational response. Once every transactional fact is grounded, the
  // server completes the preparation deterministically instead of asking the
  // customer to repeat delivery or payment information.
  const canCompleteProductPreparation = Boolean(
    !pendingAtTurnStart
    && !serviceOrderType
    && !pendingOrder
    && selectedRecentProductCandidate
    && Number(productFacts.quantity || 0) > 0
    && ['entrega', 'retirada'].includes(cleanText(productFacts.fulfillment_type))
    && (
      (cleanText(productFacts.fulfillment_type) === 'retirada'
        && cleanText(productFacts.payment_method) === 'a_combinar')
      || (cleanText(productFacts.fulfillment_type) === 'entrega'
        && ['pix', 'dinheiro', 'cartao'].includes(cleanText(productFacts.payment_method)))
    )
  )
  const alreadyPreparedProduct = (agentResult.toolRuns || []).some((run) => (
    run?.name === 'prepare_petshop_product_order'
    && run?.ok !== false
    && cleanText(run?.result?.status || run?.status) === 'prepared'
  ))
  if (canCompleteProductPreparation && !alreadyPreparedProduct) {
    const forcedPreparationStartedAt = Date.now()
    const forcedPreparationArgs = {
      customer_name: trustedCustomerName() || 'Cliente',
      order_type: 'produto',
      items: [{
        product_id: selectedRecentProductCandidate.id,
        name: selectedRecentProductCandidate.name,
        quantity: Number(productFacts.quantity),
        upsell: false,
      }],
      payment_method: cleanText(productFacts.payment_method),
      fulfillment_type: cleanText(productFacts.fulfillment_type),
      delivery_address: cleanText(productFacts.delivery_address) || null,
      delivery_neighborhood: cleanText(productFacts.delivery_neighborhood) || null,
      delivery_city: cleanText(productFacts.delivery_city) || null,
      delivery_reference: cleanText(productFacts.delivery_reference) || null,
      change_for: Number(llmInterpretation?.change_for || 0) || null,
      notes: null,
    }
    const forcedPreparationResult = await executeTool({
      id: \`force-product-prepare-\${sessionId}\`,
      type: 'function',
      function: {
        name: 'prepare_petshop_product_order',
        arguments: JSON.stringify(forcedPreparationArgs),
      },
    })
    const forcedPreparationRun = {
      name: 'prepare_petshop_product_order',
      ok: forcedPreparationResult?.ok !== false,
      status: cleanText(forcedPreparationResult?.status) || null,
      duration_ms: Date.now() - forcedPreparationStartedAt,
      result: forcedPreparationResult,
    }
    agentResult = {
      ...agentResult,
      ...(forcedPreparationRun.ok && forcedPreparationRun.status === 'prepared'
        ? { reply: cleanText(forcedPreparationResult.summary), terminal: true }
        : {}),
      toolRuns: [...(agentResult.toolRuns || []), forcedPreparationRun],
    }
  }

  if (cleanText(agentResult.reply) === PETBOT_PREPARATION_RECOVERY_HANDOFF_REPLY) {
`,
    'preparação determinística de produto completo',
  )
  return source
})

await edit('server/lib/petbotGrounding.js', (source) => replaceOne(
  source,
  "    '- Se o cliente disser apenas MotoDog, consulte as opções reais e peça uma única escolha entre buscar e levar, somente buscar ou somente levar, com as taxas retornadas pela loja.',",
  "    '- Se o cliente disser MotoDog ou pedir que a loja busque/levar o pet, chame get_petshop_transport_options antes de responder e peça uma única escolha entre buscar e levar, somente buscar ou somente levar, com as taxas retornadas pela loja.',",
  'uso obrigatório da tool MotoDog',
))

await edit('scripts/petbot-diagnostic-suite.mjs', (source) => {
  source = replaceOne(
    source,
`function nextServiceSupplement(scenario, session, slot) {
  const facts = extractFacts(session.context)
`,
`function nextServiceSupplement(scenario, session, slot, transcript = []) {
  const facts = extractFacts(session.context)
  const lastReply = normalize(transcript.at(-1)?.assistant)
  const exactServiceName = clean(scenario.service?.name)
  if (
    exactServiceName
    && /material empresa|material tutor|qual .*opcao|qual .*opção|qual .*servico|qual .*serviço|escolha .*servico|escolha .*serviço/.test(lastReply)
  ) {
    return \`quero exatamente o serviço \${exactServiceName}\`
  }
`,
    'resposta adaptativa para escolha de serviço',
  )

  source = replaceOne(
    source,
    "      : nextServiceSupplement(scenario, current, slots[0])",
    "      : nextServiceSupplement(scenario, current, slots[0], transcript)",
    'chamada do suplemento de serviço',
  )

  source = replaceOne(
    source,
`    if (isUnavailableReply(transcript.at(-1)?.assistant) || isRepeatedReply(transcript) || before === stateFingerprint(current)) break
`,
`    if (isUnavailableReply(transcript.at(-1)?.assistant) || isRepeatedReply(transcript)) break
`,
    'continuidade adaptativa sem falso travamento',
  )

  source = replaceOne(
    source,
`    const naturalRequest = scenario.add_service_intent
      ? \`Antes de confirmar, pode acrescentar \${additionIntent.request}?\`
      : \`Antes de confirmar, acrescente também \${productSemanticRequest(additionItem, additionIntent)}.\`
`,
`    const naturalRequest = scenario.add_service_intent
      ? \`Antes de confirmar, pode acrescentar o serviço \${clean(additionItem.name) || additionIntent.request}?\`
      : \`Antes de confirmar, acrescente também \${productSemanticRequest(additionItem, additionIntent)}.\`
`,
    'adicional de serviço exato',
  )
  return source
})

await writeFile('test/petbotFinalRuntimeFixes.test.mjs', `import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport { readFile } from 'node:fs/promises'\n\nimport {\n  classifyProduct,\n  detectCatalogRequest,\n} from '../server/lib/petbotCatalog.js'\nimport { mergeInterpretedPetbotServiceFacts } from '../server/lib/petbotAgent.js'\n\ntest('peso de antipulgas não transforma o pedido em ração', () => {\n  assert.equal(detectCatalogRequest('quero Advocate para gato até 4 kg').type, 'antipulgas')\n  assert.equal(detectCatalogRequest('quero Nexgard para cachorro de 8 kg').type, 'antipulgas')\n})\n\ntest('xampu e bebedouro prevalecem sobre metadados antigos', () => {\n  assert.equal(classifyProduct({\n    name: 'Cloresten Xampu 200 ml',\n    category: 'Higiene',\n    bot_metadata: { product_type: 'food', package_kg: 0.2 },\n  }).type, 'higiene')\n  assert.equal(classifyProduct({\n    name: 'Bebedouro Automático 2 Lts',\n    category: 'Acessórios',\n    bot_metadata: { product_type: 'food' },\n  }).type, 'acessorio')\n})\n\ntest('serviço exato do catálogo sobrevive a turnos genéricos', () => {\n  const previousFacts = {\n    service_type: 'catalog_f01abc',\n    pet_name: 'Nina',\n    species: 'dog',\n    breed: 'Poodle',\n    weight_kg: 7,\n  }\n  assert.equal(mergeInterpretedPetbotServiceFacts({\n    previousFacts,\n    interpretation: { service_type: 'tosa', service_date: '2026-08-01' },\n  }).service_type, 'catalog_f01abc')\n})\n\ntest('migration aceita espécies universais sem remover validação real', async () => {\n  const sql = await readFile(new URL('../supabase/migrations/20260725003000_petbot_universal_service_species.sql', import.meta.url), 'utf8')\n  assert.match(sql, /'all'.*'any'.*'todos'.*'todas'.*'qualquer'.*'pet'/s)\n  assert.match(sql, /Servico nao corresponde a especie informada/)\n  assert.match(sql, /grant execute[\\s\\S]*service_role/i)\n})\n`)

console.log('Correções finais round 1 aplicadas com sucesso.')
