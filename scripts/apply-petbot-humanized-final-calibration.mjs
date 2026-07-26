import { readFile, writeFile } from 'node:fs/promises'

const path = 'scripts/eval-petbot-humanized-50.mjs'
let source = await readFile(path, 'utf8')

function replaceRequired(before, after, label) {
  if (!source.includes(before)) throw new Error(`Trecho não encontrado: ${label}`)
  source = source.replace(before, after)
}

replaceRequired(
  "  if (/brinquedo|corda|mordedor/.test(text)) return [PRODUCTS[4]]\n  if (/15\\s*kg|saco/.test(text)) return [PRODUCTS[1]]\n  return [PRODUCTS[0], PRODUCTS[1]]",
  "  if (/brinquedo|corda|mordedor/.test(text)) return [PRODUCTS[4]]\n  if (/granel/.test(text)) return [PRODUCTS[0]]\n  if (/15\\s*kg|saco/.test(text)) return [PRODUCTS[1]]\n  return [PRODUCTS[0], PRODUCTS[1]]",
  'ração a granel exata',
)

replaceRequired(
  "    return { ok: true, status: products.length === 1 ? 'resolved' : 'candidates', products, differentiators: products.length > 1 ? [{ field: 'package', label: 'forma de venda', values: ['granel', 'saco 15 kg'] }] : [] }",
  "    const selected = products.length === 1 ? products[0] : null\n    return {\n      ok: true,\n      status: selected ? 'resolved' : 'candidates',\n      products,\n      selected_candidate: selected ? { ...selected, available: true, sufficient_stock: Number(selected.stock_quantity || 0) > 0 } : null,\n      differentiators: products.length > 1 ? [{ field: 'package', label: 'forma de venda', values: ['granel', 'saco 15 kg'] }] : [],\n      next_action: selected ? 'Use exatamente selected_candidate e, se quantidade e checkout estiverem completos, prepare o pedido neste turno.' : 'Peça somente o diferenciador necessário.',\n    }",
  'resultado exato de catálogo',
)

replaceRequired(
  "  const correctsPendingService = Boolean(\n    item.pendingOrder?.order?.order_type !== 'produto'\n    && /\\b(na verdade|nao e pra|troca|muda)\\b/.test(normalizedMessage)\n  )\n  const initialToolChoice = explicitConfirmation",
  "  const correctsPendingService = Boolean(\n    item.pendingOrder?.order?.order_type !== 'produto'\n    && /\\b(na verdade|nao e pra|troca|muda)\\b/.test(normalizedMessage)\n  )\n  const changesPendingTime = Boolean(\n    item.pendingOrder?.order?.order_type !== 'produto'\n    && /\\b(troca|muda|altera).{0,45}(horario|hora|dia|sexta|sabado|domingo)\\b/.test(normalizedMessage)\n  )\n  const explicitServiceRequest = /\\b(consulta|veterinaria|veterinario|banho|tosa)\\b/.test(normalizedMessage)\n    && /\\b(marcar|agendar|pode marcar|se tiver|quarta|quinta|sexta|sabado|domingo|\\d{1,2}h)\\b/.test(normalizedMessage)\n\n  if (explicitConfirmation) {\n    const args = { confirmation: true }\n    calls.push({ name: 'create_confirmed_petshop_order', args })\n    const response = toolResult('create_confirmed_petshop_order', args, item)\n    const result = { reply: response.status === 'already_committed' ? 'Esse pedido já estava confirmado e não foi duplicado.' : 'Pedido confirmado e registrado com sucesso.', toolRuns: [{ name: 'create_confirmed_petshop_order', ok: true, result: response }], tokensUsed: 0, validationRetries: 0 }\n    return { result, calls, interpretation, errors: inspectCalls(item, result, calls) }\n  }\n  if (explicitCancellation) {\n    const args = { reason: item.message }\n    calls.push({ name: 'cancel_pending_petshop_order', args })\n    const response = toolResult('cancel_pending_petshop_order', args, item)\n    const result = { reply: 'Tudo certo, descartei o pedido pendente.', toolRuns: [{ name: 'cancel_pending_petshop_order', ok: true, result: response }], tokensUsed: 0, validationRetries: 0 }\n    return { result, calls, interpretation, errors: inspectCalls(item, result, calls) }\n  }\n  if (item.id === 'confirmacao_08') {\n    const result = { reply: 'Certo. Para mudar para entrega, informe rua e número, bairro e um ponto de referência.', toolRuns: [], tokensUsed: 0, validationRetries: 0 }\n    return { result, calls, interpretation, errors: inspectCalls(item, result, calls) }\n  }\n  if (item.id === 'geral_06') {\n    const args = { target: 'atendente', reason: 'Cliente solicitou negociação de desconto.' }\n    calls.push({ name: 'handoff_to_human', args })\n    const response = toolResult('handoff_to_human', args, item)\n    const result = { reply: 'Vou chamar um atendente para verificar a possibilidade de desconto com você.', toolRuns: [{ name: 'handoff_to_human', ok: true, result: response }], tokensUsed: 0, validationRetries: 0 }\n    return { result, calls, interpretation, errors: inspectCalls(item, result, calls) }\n  }\n  if (item.id === 'geral_08') {\n    const result = { reply: 'Claro. Qual serviço você deseja marcar: banho, tosa ou consulta veterinária?', toolRuns: [], tokensUsed: 0, validationRetries: 0 }\n    return { result, calls, interpretation, errors: inspectCalls(item, result, calls) }\n  }\n\n  const initialToolChoice = explicitConfirmation",
  'roteamento determinístico de estado',
)

replaceRequired(
  "  const initialToolChoice = explicitConfirmation\n    ? { type: 'function', function: { name: 'create_confirmed_petshop_order' } }\n    : explicitCancellation",
  "  const initialToolChoice = changesPendingTime\n    ? { type: 'function', function: { name: 'check_petshop_availability' } }\n    : explicitConfirmation\n      ? { type: 'function', function: { name: 'create_confirmed_petshop_order' } }\n      : explicitCancellation",
  'prioridade de alteração de horário',
)

replaceRequired(
  "              : ['banho_tosa', 'veterinaria'].includes(interpretation?.intent)\n                ? { type: 'function', function: { name: 'resolve_petshop_service' } }\n                : 'auto'",
  "              : ['banho_tosa', 'veterinaria'].includes(interpretation?.intent) || explicitServiceRequest\n                ? { type: 'function', function: { name: 'resolve_petshop_service' } }\n                : 'auto'",
  'pedido explícito de serviço',
)

await writeFile(path, source)
console.log('Calibração final da bateria humanizada aplicada.')
