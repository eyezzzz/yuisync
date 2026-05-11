import { ORDER_STATES, formatMoney } from './text.js'

export function buildWelcomeReply() {
  const hour = Number(new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    hour12: false,
    timeZone: 'America/Sao_Paulo',
  }).format(new Date()))
  const greeting = hour < 12 ? 'bom dia' : hour < 18 ? 'boa tarde' : 'boa noite'

  return [
    `Ola, ${greeting}! Seja bem-vindo ao Petshop Quatro Patas.`,
    'Como podemos ajudar hoje? Posso consultar produtos, tirar uma duvida ou montar um pedido para voce.',
  ].join('\n')
}

export function buildProductTriageReply(kind = 'generic') {
  if (kind === 'ration') {
    return [
      'Claro! Para eu te indicar a racao certa, me passa rapidinho:',
      '- E para cachorro ou gato?',
      '- Qual idade/porte ou raca?',
      '- Tem marca de preferencia?',
      '- Qual tamanho do pacote voce quer? Ex: 1kg, 3kg, 10kg.',
    ].join('\n')
  }

  if (kind === 'snack') {
    return [
      'Claro! Para acertar no petisco, me diz:',
      '- E para cachorro ou gato?',
      '- Qual porte/tamanho do pet?',
      '- Prefere bifinho, ossinho, sache ou outro tipo?',
    ].join('\n')
  }

  if (kind === 'toy') {
    return [
      'Legal! Para eu sugerir um brinquedo melhor, me diz:',
      '- E para cachorro ou gato?',
      '- O pet e pequeno, medio ou grande?',
      '- Voce prefere bolinha, pelucia, mordedor ou algo mais resistente?',
    ].join('\n')
  }

  if (kind === 'hygiene') {
    return [
      'Certo! Para produto de higiene, me ajuda com alguns detalhes:',
      '- E para cachorro ou gato?',
      '- Precisa de shampoo, tapete, areia, eliminador de odor ou outro item?',
      '- Tem alguma necessidade especifica, como pelo sensivel ou odor forte?',
    ].join('\n')
  }

  if (kind === 'accessory') {
    return [
      'Claro! Para acessorio, me diz rapidinho:',
      '- E para cachorro ou gato?',
      '- Qual tamanho/porte do pet?',
      '- Voce procura coleira, guia, comedouro, cama ou outro item?',
    ].join('\n')
  }

  return [
    'Claro! Me passa um pouco mais de detalhe para eu consultar certo no estoque.',
    'Voce procura qual tipo de produto, para qual pet e tem alguma marca/tamanho de preferencia?',
  ].join('\n')
}

export function buildProductOptions(products = []) {
  if (!products.length) {
    return 'Nao encontrei um produto disponivel com esse criterio no catalogo agora. Pode me dizer de outro jeito o que voce procura?'
  }

  const lines = products.slice(0, 4).map((product, index) => (
    `${index + 1}. ${product.name} - ${formatMoney(product.price)} (${Number(product.stock_quantity || 0)} un.)`
  ))

  return [
    'Encontrei estas opcoes disponiveis:',
    ...lines,
    '',
    'Qual delas voce prefere?',
  ].join('\n')
}

export function buildPartialSummary(orderSession) {
  const lines = orderSession.items.map((item) => (
    `- ${item.quantity}x ${item.productName} - ${formatMoney(item.totalPrice)}`
  ))

  return [
    'Perfeito! Aqui esta seu pedido ate agora:',
    ...lines,
    '',
    `Subtotal: ${formatMoney(orderSession.totals.subtotal)}`,
    '',
    'Precisa de mais alguma coisa?',
  ].join('\n')
}

export function buildFinalSummary(orderSession) {
  const itemLines = orderSession.items.map((item) => (
    `- ${item.quantity}x ${item.productName} - ${formatMoney(item.totalPrice)}`
  ))

  const fulfillment = orderSession.fulfillmentType === 'entrega' ? 'entrega' : 'retirada na loja'
  const addressLine = orderSession.fulfillmentType === 'entrega'
    ? [`Endereco: ${orderSession.address.raw}`, orderSession.address.reference ? `Referencia: ${orderSession.address.reference}` : null].filter(Boolean)
    : []
  const changeLine = orderSession.payment.method === 'dinheiro'
    ? [`Troco: ${orderSession.payment.changeNeeded ? `para ${formatMoney(orderSession.payment.changeFor)}` : 'nao precisa'}`]
    : []

  return [
    'Aqui esta o resumo final do seu pedido:',
    `Nome: ${orderSession.customerName || 'nao informado'}`,
    `Telefone: ${orderSession.customerPhone || 'nao informado'}`,
    'Itens:',
    ...itemLines,
    `Total: ${formatMoney(orderSession.totals.total)}`,
    `Recebimento: ${fulfillment}`,
    ...addressLine,
    `Pagamento: ${orderSession.payment.method || 'nao informado'}`,
    ...changeLine,
    '',
    'Posso confirmar?',
  ].join('\n')
}

export function askForMissingSlot(orderSession, slot) {
  if (slot === 'items') {
    return {
      state: ORDER_STATES.browsingProducts,
      reply: 'Claro. O que voce gostaria de pedir hoje?',
    }
  }
  if (slot === 'fulfillmentType') {
    return {
      state: ORDER_STATES.awaitingFulfillmentType,
      reply: 'Certo! Esse pedido sera para entrega ou retirada na loja?',
    }
  }
  if (slot === 'customerName') {
    return {
      state: ORDER_STATES.awaitingCustomerName,
      reply: 'Perfeito. Qual nome devo colocar no pedido?',
    }
  }
  if (slot === 'address') {
    return {
      state: ORDER_STATES.awaitingAddress,
      reply: 'Perfeito. Pode me informar o endereco completo com um ponto de referencia?',
    }
  }
  if (slot === 'paymentMethod') {
    return {
      state: ORDER_STATES.awaitingPaymentMethod,
      reply: 'Qual sera a forma de pagamento? Pix, cartao ou dinheiro?',
    }
  }
  if (slot === 'changeInfo') {
    return {
      state: ORDER_STATES.awaitingChangeInfo,
      reply: 'Precisa de troco? Se sim, troco para quanto?',
    }
  }

  return {
    state: ORDER_STATES.finalReview,
    reply: buildFinalSummary(orderSession),
  }
}

export function buildAmbiguousProductReply(candidates = []) {
  if (!candidates.length) {
    return 'Fiquei em duvida sobre qual produto voce quis dizer. Pode me mandar o nome ou escolher uma opcao do catalogo?'
  }

  return [
    'Fiquei em duvida entre estas opcoes:',
    ...candidates.slice(0, 4).map((product, index) => `${index + 1}. ${product.name} - ${formatMoney(product.price)}`),
    '',
    'Pode responder com o numero ou o nome da opcao.',
  ].join('\n')
}

export function buildConfirmedReply(orderSession) {
  return [
    'Pedido confirmado com sucesso! Ja deixei registrado para a loja dar sequencia.',
    orderSession.confirmedSaleId ? `Codigo do pedido: ${orderSession.confirmedSaleId.slice(0, 8)}` : null,
    '',
    'Antes de encerrar, de 0 a 10, que nota voce da para este atendimento?',
  ].filter(Boolean).join('\n')
}

export function buildSatisfactionThanks(rating) {
  return `Obrigado pela nota ${rating}! Atendimento encerrado. Se precisar de algo mais, e so chamar.`
}
