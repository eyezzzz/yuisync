import { readFile, writeFile } from 'node:fs/promises'

async function edit(path, transform) {
  const before = await readFile(path, 'utf8')
  const after = transform(before)
  if (after === before) throw new Error(`Nenhuma alteração aplicada em ${path}`)
  await writeFile(path, after, 'utf8')
  process.stdout.write(`Atualizado ${path}\n`)
}

function replaceOrThrow(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Trecho não encontrado: ${label}`)
  return source.replace(search, replacement)
}

function appendIfMissing(source, marker, content) {
  return source.includes(marker) ? source : `${source.trimEnd()}\n\n${content.trim()}\n`
}

await edit('server/lib/petbotAgent.js', (source) => replaceOrThrow(
  source,
  `function serviceKind(value = '') {\n  const text = normalize(value)\n  if (/banho.*tosa|tosa.*banho/.test(text)) return 'banho_e_tosa'\n  if (/tosa/.test(text)) return 'tosa'\n  if (/banho/.test(text)) return 'banho'\n  if (/consulta/.test(text)) return 'consulta'\n  if (/vacina/.test(text)) return 'vacina'\n  return normalizeCode(value) || null\n}`,
  `function serviceKind(value = '') {\n  const text = normalize(value)\n  if (/tosa/.test(text) && /tesour/.test(text)) return 'tosa_tesoura'\n  if (/tosa/.test(text) && /maquin|lamina|pente/.test(text)) return 'tosa_maquina'\n  if (/escov.*dent|dent.*escov/.test(text)) return 'escovacao_dental'\n  if (/hidrat/.test(text)) return 'hidratacao'\n  if (/unha/.test(text)) return 'corte_unhas'\n  if (/ouvido/.test(text)) return 'limpeza_ouvidos'\n  if (/desemb/.test(text)) return 'desembolo'\n  if (/retorno/.test(text) && /vet|consulta|clin/.test(text)) return 'retorno_veterinario'\n  if (/consulta/.test(text)) return 'consulta_veterinaria'\n  if (/banho.*tosa|tosa.*banho/.test(text)) return 'banho_e_tosa'\n  if (/tosa/.test(text)) return 'tosa'\n  if (/banho/.test(text)) return 'banho'\n  if (/vacina/.test(text)) return 'vacina'\n  return normalizeCode(value) || null\n}`,
  'serviceKind',
))

await edit('server/lib/petbotAi.js', (source) => {
  let next = replaceOrThrow(
    source,
    `  const contextualTarget = pickEnum(expectedReplyTarget, REPLY_TARGETS)\n  const target = data.reply_target\n    || (\n      contextualTarget\n      && ['ask', 'inform', 'select', 'affirm', 'other'].includes(action)\n        ? contextualTarget\n        : ''\n    )\n    || (hasPendingOrder && (data.confirmation || action === 'affirm') ? 'final_confirmation' : '')`,
    `  const contextualTarget = pickEnum(expectedReplyTarget, REPLY_TARGETS)\n  const explicitProductFulfillment = Boolean(\n    data.intent === 'produto'\n    && data.fulfillment_type\n    && !data.negation\n    && !['deny', 'cancel'].includes(action),\n  )\n  const target = explicitProductFulfillment\n    ? 'fulfillment'\n    : data.reply_target\n      || (\n        contextualTarget\n        && ['ask', 'inform', 'select', 'affirm', 'other'].includes(action)\n          ? contextualTarget\n          : ''\n      )\n      || (hasPendingOrder && (data.confirmation || action === 'affirm') ? 'final_confirmation' : '')`,
    'prioridade de fulfillment',
  )
  next = replaceOrThrow(
    next,
    `  const rawTransportMode = slot(data.service_transport_mode, 'service_transport')`,
    `  const rawTransportMode = explicitProductFulfillment\n    ? ''\n    : slot(data.service_transport_mode, 'service_transport')`,
    'supressão de MotoDog em produto',
  )
  next = replaceOrThrow(
    next,
    `        'Em compras, extraia fulfillment_type e payment_method somente quando a mensagem atual trouxer uma escolha explícita do cliente. Nunca complete retirada, entrega, Pix, dinheiro ou cartão por padrão.',\n        'Pagamento é perguntado somente para entrega. Na retirada, o servidor define pagamento a combinar; não invente payment_method.',`,
    `        'Em compras, extraia fulfillment_type e payment_method somente quando a mensagem atual trouxer uma escolha explícita do cliente. Nunca complete retirada, entrega, Pix, dinheiro ou cartão por padrão.',\n        'Em conversa de produto, frases como "vou retirar", "vou buscar", "vou pegar" ou "retiro na loja" significam fulfillment_type="retirada" e reply_target="fulfillment". Nunca interprete isso como MotoDog, somente_buscar ou somente_levar.',\n        'Pagamento é perguntado somente para entrega. Na retirada, o servidor define pagamento a combinar; não invente payment_method.',`,
    'instrução de retirada de produto',
  )
  return next
})

await edit('server/lib/luna/verifier.js', (source) => replaceOrThrow(
  source,
  `        const hasIds = Boolean(result?.appointment_id && (result?.sale_id || result?.order_id))`,
  `        // A confirmação genérica pode representar produto ou serviço. Venda e ordem\n        // são comuns aos dois contratos; appointment_id é obrigatório somente para\n        // service_booking e é validado em verifyOperationTurn com o tipo da operação.\n        const hasIds = Boolean(result?.sale_id && result?.order_id)`,
  'ids da confirmação de produto',
))

await edit('scripts/petbot-diagnostic-suite.mjs', (source) => {
  let next = source.replace(`const SUITE_VERSION = '2026-07-24.2'`, `const SUITE_VERSION = '2026-07-25.1'`)
  next = replaceOrThrow(
    next,
    `function productText(item) {\n  return normalize(\`${'${item?.name || \'\'} ${item?.category || \'\'} ${item?.description || \'\'} ${JSON.stringify(item?.bot_metadata || {})}'}\`)\n}`,
    `function productText(item) {\n  return normalize(\`${'${item?.name || \'\'} ${item?.category || \'\'} ${item?.description || \'\'} ${JSON.stringify(item?.bot_metadata || {})}'}\`)\n}\n\nfunction commercialProductText(item) {\n  return normalize(\`${'${item?.name || \'\'} ${item?.category || \'\'} ${item?.description || \'\'}'}\`)\n}`,
    'texto comercial de produto',
  )
  next = replaceOrThrow(
    next,
    `const FEED_SIGNAL = /racao|alimento completo|bionatural|premier|golden|granplus|special dog|royal canin|pedigree|whiskas|friskies|formula natural|quatree|origens|magnus/\nconst FEED_EXCLUSION = /bifinho|petisco|snack|ossinho|biscoito|palito|pate|sache|bebida|agua mineral/`,
    `const FEED_SIGNAL = /\\bracao\\b|alimento completo|bionatural|premier|golden|granplus|special dog|royal canin|pedigree|whiskas|friskies|formula natural|quatree|origens|magnus/\nconst FEED_EXCLUSION = /bifinho|petisco|snack|ossinho|biscoito|palito|pate|sache|bebida|agua mineral|brinquedo|borracha|corda|pilha|alcalina|bateria/`,
    'filtro de ração',
  )
  next = replaceOrThrow(
    next,
    `    matches: (row) => /petisco|bifinho|snack|ossinho|biscoito|palito/.test(productText(row)),`,
    `    matches: (row) => /petisco|bifinho|snack|ossinho|biscoito|palito (?:dental|mastig)/.test(productText(row)),`,
    'filtro de petisco',
  )
  next = replaceOrThrow(
    next,
    `  const details = [brand ? \`da ${'${brand}'}\` : '', audience, weight ? \` de até ${'${weight[1]}'} kg\` : '', pack ? \`, embalagem de ${'${pack}'}\` : '']\n    .filter(Boolean)\n    .join('')\n  return \`quero comprar ${'${intent.noun}'}${'${details}'}\`.replace(/\\s+/g, ' ').trim()`,
    `  const details = [\n    brand ? \`da ${'${brand}'}\` : '',\n    audience.trim(),\n    weight ? \`de até ${'${weight[1]}'} kg\` : '',\n    pack ? \`embalagem de ${'${pack}'}\` : '',\n  ].filter(Boolean).join(' ')\n  return \`quero comprar ${'${intent.noun}'}${'${details ? ` ${details}` : \'\'}'}\`.replace(/\\s+/g, ' ').trim()`,
    'frase de produto',
  )
  next = replaceOrThrow(next, `  const text = productText(item)\n  const brand = extractBrand(item?.name)\n  const pack = extractPackageLabel(item?.name)\n  const species = /gato/.test(text) ? 'gato' : 'cachorro'`, `  const text = commercialProductText(item)\n  const brand = extractBrand(item?.name)\n  const pack = extractPackageLabel(item?.name)\n  const species = /gato/.test(text) ? 'gato' : 'cachorro'`, 'texto de ração')
  next = replaceOrThrow(
    next,
    `  const feedProducts = sellableProducts.filter((item) => FEED_SIGNAL.test(productText(item)) && !FEED_EXCLUSION.test(productText(item)))`,
    `  const feedProducts = sellableProducts.filter((item) => {\n    const text = commercialProductText(item)\n    return FEED_SIGNAL.test(text) && !FEED_EXCLUSION.test(text)\n  })`,
    'seleção de rações',
  )
  next = replaceOrThrow(
    next,
    `  const dogFeeds = catalog.feedProducts.filter((item) => !/gato/.test(productText(item)))\n  const catFeeds = catalog.feedProducts.filter((item) => /gato/.test(productText(item)))`,
    `  const dogFeeds = catalog.feedProducts.filter((item) => !/gato/.test(commercialProductText(item)))\n  const catFeeds = catalog.feedProducts.filter((item) => /gato/.test(commercialProductText(item)))`,
    'espécie das rações',
  )
  next = replaceOrThrow(
    next,
    `  transcript.push({\n    role: 'turn',\n    customer: message,\n    assistant: reply,\n    duration_ms: Date.now() - startedAt,\n  })`,
    `  transcript.push({\n    role: 'turn',\n    customer: message,\n    assistant: reply,\n    duration_ms: Date.now() - startedAt,\n    assistant_metadata: result?.savedMessage?.metadata || null,\n  })`,
    'evidência de tools no transcript',
  )
  next = replaceOrThrow(
    next,
    `function nextProductSupplement(scenario, session) {\n  const facts = extractAgentContext(session.context).product_facts || {}`,
    `function nextProductSupplement(scenario, session, transcript = []) {\n  const facts = extractAgentContext(session.context).product_facts || {}\n  const lastReply = normalize(transcript.at(-1)?.assistant)\n  const asksProductChoice = /qual (?:deles|produto|opcao)|qual voce prefere|qual você prefere|encontrei .*opcoes|encontrei .*opções/.test(lastReply)\n  if (asksProductChoice && clean(scenario.product?.name)) return \`quero o ${'${scenario.product.name}'}\``,
    'seleção adaptativa de produto',
  )
  next = replaceOrThrow(
    next,
    `function pendingOrderText(pending) {\n  return normalize((pending?.order?.items || []).map((item) => \`${'${item.name || \'\'} ${item.description || \'\'}'}\`).join(' '))\n}\n\n\nfunction pendingMatchesIntent`,
    `function pendingOrderText(pending) {\n  return normalize((pending?.order?.items || []).map((item) => \`${'${item.name || \'\'} ${item.description || \'\'}'}\`).join(' '))\n}\n\nfunction pendingHasProduct(pending, target) {\n  const targetId = clean(target?.id)\n  return Boolean(targetId && (pending?.order?.items || []).some((item) => clean(item?.product_id) === targetId))\n}\n\nfunction pendingMatchesIntent`,
    'correspondência exata de produto',
  )
  next = replaceOrThrow(
    next,
    `function feedSemanticMatch(pending, target) {\n  const pendingText = pendingOrderText(pending)`,
    `function feedSemanticMatch(pending, target) {\n  if (pendingHasProduct(pending, target)) return true\n  const pendingText = pendingOrderText(pending)`,
    'match exato de ração',
  )
  next = replaceOrThrow(
    next,
    `  if (scenario.category === 'produtos') {\n    assert(pendingMatchesIntent(pending, scenario.product_intent), \`${'${scenario.id}'}: o resumo não corresponde à categoria de produto solicitada.\`)\n  }`,
    `  if (scenario.category === 'produtos') {\n    assert(\n      pendingHasProduct(pending, scenario.product) || pendingMatchesIntent(pending, scenario.product_intent),\n      \`${'${scenario.id}'}: o resumo não corresponde à categoria de produto solicitada.\`,\n    )\n  }`,
    'assert de produto',
  )
  next = replaceOrThrow(
    next,
    `  for (let attempt = 0; attempt < 2 && !extractPendingOrder(current.context); attempt += 1) {\n    const supplement = scenario.order_type === 'produto'\n      ? nextProductSupplement(scenario, current)`,
    `  for (let attempt = 0; attempt < 4 && !extractPendingOrder(current.context); attempt += 1) {\n    const supplement = scenario.order_type === 'produto'\n      ? nextProductSupplement(scenario, current, transcript)`,
    'suplementos de produto',
  )
  next = replaceOrThrow(
    next,
    `    assert(order.order_type === 'produto', \`${'${scenario.id}'}: ordem de produto foi salva com tipo incorreto.\`)`,
    `    assert(['produto', 'entrega'].includes(order.order_type), \`${'${scenario.id}'}: ordem de produto foi salva com tipo operacional incorreto (${ '${order.order_type}' }).\`)`,
    'tipo operacional de produto',
  )
  return next
})

await edit('scripts/eval-petbot-humanized-50.mjs', (source) => {
  let next = replaceOrThrow(
    source,
    `import {\n  PETBOT_AGENT_TOOLS,\n  runPetbotAgent,\n} from '../server/lib/petbotAgent.js'`,
    `import {\n  PETBOT_AGENT_TOOLS,\n  runPetbotAgent,\n} from '../server/lib/petbotAgent.js'\nimport { interpretPetbotMessageWithLlm } from '../server/lib/petbotAi.js'`,
    'import do interpretador',
  )
  const messageReplacements = new Map([
    [`Pode mandar uma ração de 15 kg aqui em casa? Pago no pix.`, `Pode mandar uma ração de 15 kg na Rua das Flores 120, Centro, Muriaé, perto da praça? Pago no pix.`],
    [`Esse antipulgas serve pra cachorro de 8 kg? Se servir, separa um pra mim.`, `Esse antipulgas serve pra cachorro de 8 kg? Se servir, separa um pra mim, vou retirar na loja.`],
    [`Quero três brinquedos de corda, mas só se tiver em estoque.`, `Quero três brinquedos de corda, mas só se tiver em estoque. Vou retirar na loja.`],
    [`Queria marcar um banho pra Nina, shih tzu, 6 kg, quarta às 14h. Eu levo ela.`, `Queria marcar um banho pra Nina, shih tzu, 6 kg, quarta às 14h. Eu levo ela e não tenho observações.`],
    [`Pode agendar banho e tosa na máquina pro Thor? Ele é poodle, 9 kg, quinta às 10h. Vou levar.`, `Pode agendar banho e tosa na máquina pro Thor? Ele é poodle, 9 kg, quinta às 10h. Vou levar e não tenho observações.`],
    [`Quero tosa na tesoura pra Mel, maltês de 5 kg, sexta 13h. Levo na loja.`, `Quero tosa na tesoura pra Mel, maltês de 5 kg, sexta 13h. Levo na loja e não tenho observações.`],
    [`Quero banho pro Bob, SRD 9 kg, quarta 15h. Quero buscar e levar pelo MotoDog. Rua das Flores 120, Centro, Muriaé, perto da praça.`, `Quero banho pro Bob, SRD 9 kg, quarta 15h. Quero buscar e levar pelo MotoDog. Rua das Flores 120, Centro, Muriaé, perto da praça. Sem observações.`],
  ])
  for (const [before, after] of messageReplacements) {
    if (!next.includes(before)) throw new Error(`Mensagem humanizada não encontrada: ${before}`)
    next = next.replace(before, after)
  }
  next = replaceOrThrow(
    next,
    `async function runScenario(item) {\n  const calls = []\n  let orderResult = null\n  const prompt = buildPetbotAgentV3Prompt({`,
    `async function runScenario(item) {\n  const calls = []\n  let orderResult = null\n  const interpretation = await interpretPetbotMessageWithLlm({\n    apiKey: API_KEY,\n    model: MODEL,\n    timeoutMs: 45_000,\n    message: item.message,\n    history: [],\n    state: { petbot_agent: { pending_order: item.pendingOrder || null } },\n    customerContext: 'Cliente Teste',\n  })\n  const prompt = buildPetbotAgentV3Prompt({`,
    'interpretação humanizada real',
  )
  next = replaceOrThrow(next, `    facts: {},`, `    facts: interpretation || {},`, 'fatos interpretados')
  next = replaceOrThrow(
    next,
    `  return { result, calls, errors: inspectCalls(item, result, calls) }`,
    `  return { result, calls, interpretation, errors: inspectCalls(item, result, calls) }`,
    'retorno da interpretação',
  )
  next = replaceOrThrow(
    next,
    `      const { result, calls, errors } = await runScenario(item)`,
    `      const { result, calls, interpretation, errors } = await runScenario(item)`,
    'desestruturação da interpretação',
  )
  next = replaceOrThrow(
    next,
    `        reply: result.reply,\n        tools: calls,`,
    `        reply: result.reply,\n        interpretation,\n        tools: calls,`,
    'relatório da interpretação',
  )
  return next
})

await edit('test/petbotSemantics.test.mjs', (source) => {
  let next = replaceOrThrow(
    source,
    `import { mergeInterpretedPetbotServiceFacts } from '../server/lib/petbotAgent.js'`,
    `import { mergeInterpretedPetbotServiceFacts, resolvePetshopService } from '../server/lib/petbotAgent.js'`,
    'import do resolvedor',
  )
  next = appendIfMissing(next, `retirada de produto tem prioridade semântica sobre transporte`, `

test('retirada de produto tem prioridade semântica sobre transporte do pet', () => {
  const result = resolvePetbotTurnSemantics({
    interpretation: {
      intent: 'produto',
      dialogue_act: 'select',
      reply_target: 'service_transport',
      fulfillment_type: 'retirada',
      service_transport_mode: 'somente_levar',
      confidence: 0.99,
    },
  })

  assert.equal(result.target, 'fulfillment')
  assert.equal(result.fulfillment_type, 'retirada')
  assert.equal(result.transport_intent, '')
  assert.equal(result.service_transport_mode, '')
})

test('resolvedor distingue tosa e cuidados específicos do catálogo', () => {
  const services = [
    { id: 'm', code: 'tosa_maquina', name: 'Tosa na Máquina', group_type: 'banho_tosa', default_price: 100, active: true },
    { id: 't', code: 'tosa_tesoura', name: 'Tosa na Tesoura', group_type: 'banho_tosa', default_price: 140, active: true },
    { id: 'h', code: 'hidratacao', name: 'Hidratação do Pelo', group_type: 'banho_tosa', default_price: 35, active: true },
    { id: 'v', code: 'consulta_veterinaria', name: 'Consulta Veterinária', group_type: 'veterinaria', default_price: 180, active: true },
  ]

  assert.equal(resolvePetshopService({ serviceQuery: 'tosa na máquina', orderType: 'banho_tosa', services }).service?.id, 'm')
  assert.equal(resolvePetshopService({ serviceQuery: 'tosa na tesoura', orderType: 'banho_tosa', services }).service?.id, 't')
  assert.equal(resolvePetshopService({ serviceQuery: 'hidratação para o pelo', orderType: 'banho_tosa', services }).service?.id, 'h')
  assert.equal(resolvePetshopService({ serviceQuery: 'consulta', orderType: 'veterinaria', services }).service?.id, 'v')
})`)
  return next
})

await edit('test/luna/verifier.test.mjs', (source) => appendIfMissing(source, `confirmação de produto aceita venda e ordem sem appointment`, `

test('confirmação de produto aceita venda e ordem sem appointment', () => {
  const result = verifyToolResult({
    schema_version: 1,
    tool_name: 'create_confirmed_petshop_order',
    ok: true,
    status: 'committed',
    requires_confirmation: true,
    result: { status: 'committed', sale_id: 'sale_1', order_id: 'order_1', appointment_id: null },
  })

  assert.equal(result.result_consistent, true)
  assert.equal(result.tool_succeeded, true)
  assert.deepEqual(result.issues, [])
})`))
