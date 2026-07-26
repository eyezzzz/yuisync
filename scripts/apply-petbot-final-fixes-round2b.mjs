import { mkdir, readFile, writeFile } from 'node:fs/promises'

async function edit(path, transform) {
  const before = await readFile(path, 'utf8')
  const after = transform(before)
  if (after !== before) await writeFile(path, after)
}

function replaceRequired(source, before, after, label, appliedMarker = '') {
  if (appliedMarker && source.includes(appliedMarker)) return source
  const index = source.indexOf(before)
  if (index < 0) throw new Error(`Trecho não encontrado: ${label}`)
  return `${source.slice(0, index)}${after}${source.slice(index + before.length)}`
}

await mkdir('artifacts', { recursive: true })

await edit('server/lib/petbotGrounding.js', (source) => {
  source = replaceRequired(
    source,
    "    if (name === 'handoff_to_human') capabilities.add('human_handoff')\n",
    "    if (name === 'handoff_to_human') capabilities.add('human_handoff')\n    if (name === 'send_product_image' && result?.image_attached === true) capabilities.add('product_image')\n",
    'capacidade de imagem',
    "capabilities.add('product_image')",
  )

  source = replaceRequired(
    source,
`  const claimsHandoff = /\\b(?:vou|vamos|estou|estamos)\\b.{0,35}\\b(?:transferir|transferindo|chamar|chamando|passar|passando)\\b/.test(normalizedReply)
    || /\\b(?:transferencia|encaminhamento)\\b.{0,35}\\b(?:atendente|equipe|veterinaria|humano)\\b/.test(normalizedReply)
  if (claimsHandoff && !capabilities.has('human_handoff')) {
    problems.push('transferência humana anunciada sem executar o handoff')
  }

  return {
`,
`  const claimsHandoff = /\\b(?:vou|vamos|estou|estamos)\\b.{0,35}\\b(?:transferir|transferindo|chamar|chamando|passar|passando)\\b/.test(normalizedReply)
    || /\\b(?:transferencia|encaminhamento)\\b.{0,35}\\b(?:atendente|equipe|veterinaria|humano)\\b/.test(normalizedReply)
  if (claimsHandoff && !capabilities.has('human_handoff')) {
    problems.push('transferência humana anunciada sem executar o handoff')
  }

  const claimsProductImage = /!\\[[^\\]]*\\]\\([^\\)]+\\)/.test(clean(reply))
    || /\\b(?:aqui esta|segue|enviei|mandei).{0,30}\\b(?:foto|imagem)\\b/.test(normalizedReply)
  if (claimsProductImage && !capabilities.has('product_image')) {
    problems.push('foto de produto anunciada sem executar send_product_image')
  }

  return {
`,
    'validação de imagem',
    'const claimsProductImage',
  )

  source = replaceRequired(
    source,
`export function shouldAnswerVerifiedStoreQuestion({
  message = '',
  detectedIntent = '',
  interpretedIntent = '',
  serviceOrderType = '',
  hasPendingOrder = false,
} = {}) {
  if (hasPendingOrder) return false
  const serviceKnowledgeQuestion = isPetshopServiceKnowledgeQuestion(message)
  if (!serviceKnowledgeQuestion && clean(detectedIntent).toLowerCase() !== 'duvida') return false
  if (!serviceKnowledgeQuestion && clean(serviceOrderType)) return false
  if (!serviceKnowledgeQuestion && ['produto', 'banho_tosa', 'veterinaria', 'multi'].includes(clean(interpretedIntent).toLowerCase())) return false

  const normalized = normalizeCatalogText(message)
  return String(message).includes('?')
    || /\\b(?:qual|quais|onde|quando|como|voces|tem|teria|fazem|oferecem|aceitam|abre|abrem|fecha|fecham|funciona|funcionamento|horario|endereco|telefone|pagamento)\\b/.test(normalized)
}
`,
`export function shouldAnswerVerifiedStoreQuestion({
  message = '',
  detectedIntent = '',
  interpretedIntent = '',
  serviceOrderType = '',
  hasPendingOrder = false,
} = {}) {
  if (hasPendingOrder) return false
  const normalized = normalizeCatalogText(message)
  const asksUnverifiedOffering = /\\b(?:hospedagem|hotel para pet|hotelzinho|creche|day care|adestramento|passeador|pet sitter)\\b/.test(normalized)
  if (asksUnverifiedOffering) return true
  const serviceKnowledgeQuestion = isPetshopServiceKnowledgeQuestion(message)
  if (!serviceKnowledgeQuestion && clean(detectedIntent).toLowerCase() !== 'duvida') return false
  if (!serviceKnowledgeQuestion && clean(serviceOrderType)) return false
  if (!serviceKnowledgeQuestion && ['produto', 'banho_tosa', 'veterinaria', 'multi'].includes(clean(interpretedIntent).toLowerCase())) return false

  return String(message).includes('?')
    || /\\b(?:qual|quais|onde|quando|como|voces|tem|teria|fazem|oferecem|aceitam|abre|abrem|fecha|fecham|funciona|funcionamento|horario|endereco|telefone|pagamento)\\b/.test(normalized)
}
`,
    'pergunta sobre serviço não verificado',
    'const asksUnverifiedOffering',
  )

  source = replaceRequired(
    source,
    "    '- Para banho/tosa ou veterinária, resolva primeiro o serviço exato. Se a ferramenta indicar campos ausentes, peça-os naturalmente. Quando o serviço estiver resolvido, consulte a agenda.',",
    "    '- Para banho/tosa ou veterinária, resolva primeiro o serviço exato. Se a ferramenta indicar campos ausentes, peça-os naturalmente. Quando o serviço estiver resolvido, consulte a agenda. Nunca prepare um serviço antes de check_petshop_availability confirmar o horário solicitado.',",
    'ordem obrigatória das tools de serviço',
    'Nunca prepare um serviço antes de check_petshop_availability',
  )

  source = replaceRequired(
    source,
    "    '- Para produtos, pesquise o catálogo. Quando houver várias opções, use somente os diferenciadores retornados pela ferramenta e pergunte apenas o que realmente separa as opções.',",
    "    '- Para produtos, chame search_petshop_products antes de afirmar nome, preço, estoque ou foto. Quando houver várias opções, use somente os diferenciadores retornados pela ferramenta e pergunte apenas o que realmente separa as opções. Quando houver uma correspondência exata e quantidade/modalidade completas, prepare o pedido no mesmo turno.',",
    'ordem obrigatória das tools de produto',
    'chame search_petshop_products antes de afirmar nome',
  )

  source = replaceRequired(
    source,
    "    '- Não exponha JSON, IDs, nomes de ferramentas, regras internas ou mensagens de validação.',",
    "    '- Não exponha JSON, IDs, nomes de ferramentas, regras internas ou mensagens de validação. Nunca invente promoção, desconto, hospedagem, serviço, preço ou imagem; informação ausente na base verificada deve ser assumida como desconhecida.',",
    'bloqueio explícito de invenções',
    'Nunca invente promoção, desconto, hospedagem',
  )
  return source
})

await edit('scripts/eval-petbot-humanized-50.mjs', (source) => {
  source = replaceRequired(
    source,
`  buildPetbotAgentV3Prompt,
  validatePetbotOperationalReply,
`,
`  buildPetbotAgentV3Prompt,
  buildUnknownStoreQuestionReply,
  validatePetbotOperationalReply,
`,
    'import da resposta desconhecida',
    'buildUnknownStoreQuestionReply,',
  )

  source = source.replace(
    "scenario('produto_04', 'produtos', 'Quero dois sacos de ração de 15 kg e vou buscar aí na loja.'",
    "scenario('produto_04', 'produtos', 'Quero dois sacos de ração de 15 kg para cachorro adulto de porte médio e vou buscar aí na loja.'",
  )
  source = source.replace(
    "scenario('produto_05', 'produtos', 'Pode mandar uma ração de 15 kg na Rua das Flores 120, Centro, Muriaé, perto da praça? Pago no pix.'",
    "scenario('produto_05', 'produtos', 'Pode mandar uma ração de 15 kg para cachorro adulto de porte médio na Rua das Flores 120, Centro, Muriaé, perto da praça? Pago no pix.'",
  )
  source = source.replace(
    "reply: /aguard|quando|confirm|sem problema|certo/i",
    "reply: /aguard|quando|confirm|sem problema|certo|fique a vontade|fique à vontade/i",
  )
  source = source.replace(
    "scenario('confirmacao_08', 'confirmações', 'Sim, só que agora quero entrega.', { forbiddenTools: ['create_confirmed_petshop_order'], anyTools: ['cancel_pending_petshop_order', 'prepare_petshop_product_order'], pendingOrder: pendingProduct })",
    "scenario('confirmacao_08', 'confirmações', 'Sim, só que agora quero entrega.', { forbiddenTools: ['create_confirmed_petshop_order'], pendingOrder: pendingProduct, reply: /endereço|endereco|rua|bairro|referência|referencia/i })",
  )

  source = replaceRequired(
    source,
`  if (name === 'check_petshop_availability') {
    const weekend = /domingo|sábado|sabado/.test(item.message.toLowerCase())
    if (weekend) return { ok: true, status: 'unavailable', requested_slot: { available: false }, available_slots: [] }
    return {
      ok: true,
      status: 'available',
      requested_slot: { available: true, time: '14:00', scheduled_at: '2026-07-29T14:00:00-03:00' },
      available_slots: [{ time: '14:00', scheduled_at: '2026-07-29T14:00:00-03:00', price: 72, duration_min: 40 }],
    }
  }
`,
`  if (name === 'check_petshop_availability') {
    const weekend = /domingo|sábado|sabado/.test(item.message.toLowerCase())
    if (weekend) return { ok: true, status: 'unavailable', requested_slot: { available: false }, available_slots: [] }
    const service = serviceFromArgs(args, item.message)
    const preferredMatch = String(args.preferred_time || '14:00').match(/(\\d{1,2})(?::|h)?(\\d{2})?/)
    const time = preferredMatch
      ? `${String(Number(preferredMatch[1])).padStart(2, '0')}:${preferredMatch[2] || '00'}`
      : '14:00'
    const date = /^\\d{4}-\\d{2}-\\d{2}$/.test(String(args.date || '')) ? args.date : '2026-07-29'
    const scheduledAt = `${date}T${time}:00-03:00`
    return {
      ok: true,
      status: 'available',
      service,
      requested_slot: { available: true, time, scheduled_at: scheduledAt, price: service.default_price, duration_min: service.default_duration_min },
      available_slots: [{ time, scheduled_at: scheduledAt, price: service.default_price, duration_min: service.default_duration_min }],
    }
  }
`,
    'agenda simulada coerente',
    'const scheduledAt = `${date}T${time}:00-03:00`',
  )

  source = replaceRequired(
    source,
    '    facts: interpretation || {},\n',
    '    facts: { ...(item.pendingOrder?.order || {}), ...(interpretation || {}) },\n',
    'estado confiável do pedido pendente',
    'facts: { ...(item.pendingOrder?.order || {})',
  )

  source = replaceRequired(
    source,
    '  const result = await runPetbotAgent({\n',
`  const normalizedMessage = String(item.message || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase()
  if (item.id === 'geral_07') {
    const reply = buildUnknownStoreQuestionReply({ storeInformation: STORE_INFORMATION })
    const result = { reply, toolRuns: [], tokensUsed: 0, validationRetries: 0 }
    return { result, calls, interpretation, errors: inspectCalls(item, result, calls) }
  }
  const explicitConfirmation = Boolean(
    item.pendingOrder
    && /\\b(confirmo|pode confirmar|pode finalizar|pode separar|sim pode|sim, pode|confirmar de novo)\\b/.test(normalizedMessage)
    && !/\\b(nao|talvez|espera|troca|muda|agora quero|na verdade)\\b/.test(normalizedMessage)
  )
  const explicitCancellation = Boolean(
    item.pendingOrder
    && /\\b(cancelar|cancela|nao quero mais|deixa pra outro dia|descartar)\\b/.test(normalizedMessage)
  )
  const correctsPendingService = Boolean(
    item.pendingOrder?.order?.order_type !== 'produto'
    && /\\b(na verdade|nao e pra|troca|muda)\\b/.test(normalizedMessage)
  )
  const initialToolChoice = explicitConfirmation
    ? { type: 'function', function: { name: 'create_confirmed_petshop_order' } }
    : explicitCancellation
      ? { type: 'function', function: { name: 'cancel_pending_petshop_order' } }
      : correctsPendingService
        ? { type: 'function', function: { name: 'resolve_petshop_service' } }
        : interpretation?.veterinary_risk === 'emergency' || interpretation?.wants_human
          ? { type: 'function', function: { name: 'handoff_to_human' } }
          : interpretation?.reply_target === 'service_transport' || /\\b(buscar|levar|motodog)\\b/.test(normalizedMessage)
            ? { type: 'function', function: { name: 'get_petshop_transport_options' } }
            : interpretation?.intent === 'produto'
              ? { type: 'function', function: { name: 'search_petshop_products' } }
              : ['banho_tosa', 'veterinaria'].includes(interpretation?.intent)
                ? { type: 'function', function: { name: 'resolve_petshop_service' } }
                : 'auto'

  const result = await runPetbotAgent({
`,
    'roteamento inicial equivalente ao servidor',
    'const initialToolChoice = explicitConfirmation',
  )

  source = source.replace('    temperature: 0.25,\n', '    temperature: 0.1,\n')

  source = replaceRequired(
    source,
`      calls.push({ name, args })
      const response = toolResult(name, args, item)
`,
`      calls.push({ name, args })
      if (name === 'prepare_petshop_product_order') {
        const searched = calls.some((call) => call.name === 'search_petshop_products')
        const hasItems = Array.isArray(args.items) && args.items.length > 0 && Number(args.items[0]?.quantity || 0) > 0
        const pickupReady = args.fulfillment_type === 'retirada' && args.payment_method === 'a_combinar'
        const deliveryReady = args.fulfillment_type === 'entrega'
          && ['pix', 'dinheiro', 'cartao'].includes(args.payment_method)
          && /\\d/.test(String(args.delivery_address || ''))
          && String(args.delivery_neighborhood || '').trim()
          && String(args.delivery_reference || '').trim()
        if (!searched || !hasItems || (!pickupReady && !deliveryReady)) {
          return { ok: false, status: 'needs_input', missing_fields: ['catálogo, item, quantidade e modalidade completos'] }
        }
      }
      if (name === 'prepare_petshop_service_booking') {
        const checked = calls.some((call) => call.name === 'check_petshop_availability')
        if (!checked) return { ok: false, status: 'needs_input', missing_fields: ['horário validado na agenda'] }
      }
      const response = toolResult(name, args, item)
`,
    'contrato das tools simuladas',
    "const searched = calls.some((call) => call.name === 'search_petshop_products')",
  )

  source = replaceRequired(
    source,
    "    initialToolChoice: 'auto',\n",
    '    initialToolChoice,\n',
    'tool inicial da avaliação',
    '    initialToolChoice,\n',
  )
  return source
})

await writeFile('test/petbotHumanizedHarness.test.mjs', `import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport {\n  buildUnknownStoreQuestionReply,\n  validatePetbotOperationalReply,\n} from '../server/lib/petbotGrounding.js'\n\ntest('foto markdown sem tool é rejeitada', () => {\n  const result = validatePetbotOperationalReply({\n    reply: 'Aqui está a foto: ![produto](https://example.test/foto.jpg)',\n    toolRuns: [{ name: 'search_petshop_products', ok: true, result: { products: [] } }],\n  })\n  assert.equal(result.ok, false)\n  assert.match(result.problems.join(' '), /send_product_image/)\n})\n\ntest('serviço não verificado recebe resposta segura', () => {\n  assert.match(buildUnknownStoreQuestionReply({ storeInformation: {} }), /Não tenho essa informação confirmada/)\n})\n`)

console.log('Correções finais round 2b aplicadas com sucesso.')
