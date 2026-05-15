import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const generatedAt = '2026-05-14'

const outTxt = path.join(root, 'docs', 'petbot_knowledge_base_300.txt')
const outJsonl = path.join(root, 'docs', 'petbot_knowledge_base_300.jsonl')
const outSql = path.join(root, 'database', 'bot_conversation_examples_petbot_kb_300.sql')

const breeds = [
  { breed: 'shih tzu', size: 'pequeno', species: 'cachorro' },
  { breed: 'poodle', size: 'pequeno', species: 'cachorro' },
  { breed: 'pinscher', size: 'pequeno', species: 'cachorro' },
  { breed: 'yorkshire', size: 'pequeno', species: 'cachorro' },
  { breed: 'lhasa', size: 'pequeno', species: 'cachorro' },
  { breed: 'spitz', size: 'pequeno', species: 'cachorro' },
  { breed: 'beagle', size: 'medio', species: 'cachorro' },
  { breed: 'cocker', size: 'medio', species: 'cachorro' },
  { breed: 'border collie', size: 'medio', species: 'cachorro' },
  { breed: 'golden', size: 'grande', species: 'cachorro' },
  { breed: 'labrador', size: 'grande', species: 'cachorro' },
  { breed: 'rottweiler', size: 'grande', species: 'cachorro' },
]

const catProfiles = [
  { description: 'gato adulto castrado', species: 'gato', age: 'adulto castrado' },
  { description: 'gato filhote', species: 'gato', age: 'filhote' },
  { description: 'gato adulto', species: 'gato', age: 'adulto' },
]

const names = [
  'Gabriel',
  'Ana',
  'Carlos',
  'Marina',
  'Joao',
  'Lara',
  'Paula',
  'Bruno',
  'Fernanda',
  'Diego',
  'Rafael',
  'Bianca',
  'Rodrigo',
  'Camila',
  'Igor',
  'Simone',
  'Thiago',
  'Juliana',
  'Roberto',
  'Leticia',
]

const pets = [
  'Thor',
  'Mel',
  'Nina',
  'Bob',
  'Luna',
  'Rex',
  'Toby',
  'Mia',
  'Apollo',
  'Cookie',
  'Fred',
  'Pipoca',
]

const brands = ['Premier', 'Royal Canin', 'Golden', 'Formula Natural', 'Special Dog', 'Whiskas']
const payments = ['pix', 'cartao', 'dinheiro']
const typoAffirmatives = ['sim', 'sm', 'pode', 'fecha', 'confirmo', 'ta bom']
const typoNegatives = ['nao', 'n', 'deixa', 'sem extra', 'nao quero']

const examples = []

function pick(list, index) {
  return list[index % list.length]
}

function add(example) {
  const index = examples.length + 1
  const initialContext = example.initial_context || inferInitialContext(example)
  examples.push({
    source_key: `petbot_kb_${String(index).padStart(3, '0')}`,
    module_id: 'petshop',
    tone: 'curto',
    has_bank_placeholder: true,
    blocked_reasons: [],
    can_save_order: false,
    initial_context: initialContext,
    ...example,
  })
}

function inferInitialContext(example) {
  if (String(example.ideal_reply || '').includes('[NOME_DO_CLIENTE]')) {
    return 'Telefone ja cadastrado; nome do tutor conhecido; usar historico sem repetir pergunta.'
  }
  if (example.guard_action === 'pedir_nome') {
    return 'Cliente novo ou telefone sem cadastro confirmado.'
  }
  if (['resumo_final', 'confirmar_salvar', 'cancelar', 'pedir_avaliacao'].includes(example.guard_action)) {
    return 'Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.'
  }
  if (example.stage === 'resumo_parcial' || example.stage === 'pagamento') {
    return 'Produto/servico ja foi escolhido com preco real do banco.'
  }
  if (example.stage === 'entrega') {
    return 'Pagamento ja coletado; falta definir ou completar entrega.'
  }
  if (example.intent === 'banho_tosa') {
    return 'Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.'
  }
  if (example.intent === 'veterinaria') {
    return 'Atendimento veterinario em triagem; nao diagnosticar e consultar agenda real.'
  }
  return 'Estado anterior minimo conforme acao do guardiao.'
}

function productNameToken(index) {
  return `[PRODUTO_COM_ESTOQUE_${(index % 3) + 1}]`
}

function productReply({ intro = 'Consultei o estoque e tenho essas opcoes:', count = 3 } = {}) {
  const lines = Array.from({ length: count }, (_, index) => {
    const n = index + 1
    return `${n}. [PRODUTO_COM_ESTOQUE_${n}] - R$ [VALOR_DO_BANCO_${n}]`
  })
  return `${intro}\n${lines.join('\n')}\n\nQual prefere?`
}

function partialSummary({ customer = '[NOME]', pet = '[PET]', item = '[ITEM]', extra = 'nao adicionado', total = '[TOTAL_PARCIAL]' } = {}) {
  return `**Pedido em andamento:**\n` +
    `• Cliente: ${customer}\n` +
    `• Pet: ${pet}\n` +
    `• Produto/servico: ${item}\n` +
    `• Extra: ${extra}\n` +
    `• Total parcial: R$ ${total}\n` +
    `• Pagamento: aguardando\n` +
    `• Entrega/retirada: aguardando\n\n` +
    `Qual forma prefere? pix, dinheiro ou cartao?`
}

function finalSummary({ customer = '[NOME]', items = '[ITENS_COMPLETOS]', total = '[TOTAL_COM_TAXA]', payment = '[FORMA]', fulfillment = 'Entrega: [ENDERECO_COMPLETO]' } = {}) {
  return `**Resumo do pedido:**\n` +
    `• Cliente: ${customer}\n` +
    `• ${items}\n` +
    `• Taxa de entrega: R$ [TAXA_DE_ENTREGA_DO_BANCO]\n` +
    `• Total: R$ ${total}\n` +
    `• Pagamento: ${payment}\n` +
    `• ${fulfillment}\n\n` +
    `Confirma para separacao?`
}

function quoteSql(value, tag) {
  const safe = String(value ?? '').replaceAll(`$${tag}$`, `$${tag}_safe$`)
  return `$${tag}$${safe}$${tag}$`
}

function arraySql(values = []) {
  if (!values.length) return "'{}'::text[]"
  return `array[${values.map((value) => `'${String(value).replaceAll("'", "''")}'`).join(', ')}]`
}

function addProductTriage() {
  for (let i = 0; i < 40; i += 1) {
    const breed = pick(breeds, i)
    const brand = pick(brands, i)
    const age = i % 4 === 0 ? '' : i % 2 === 0 ? ' adulto' : ' filhote'
    const known = i % 5 === 0
    const profile = i % 7 === 0 ? pick(catProfiles, i) : null
    const missingAge = !profile && !age
    const canOfferProducts = known && !missingAge
    const knownPrefix = 'Perfeito, [NOME_DO_CLIENTE]. Vou usar os dados do cadastro e consultar o estoque real.'
    const knownContextLine = profile
      ? `Vou filtrar por ${profile.description}.`
      : age
        ? `Vou considerar ${breed.breed} como porte ${breed.size} e categoria ${age.trim()}.`
        : `Vou considerar ${breed.breed} como porte ${breed.size}. Ele e adulto ou filhote?`
    const message = profile
      ? `Oi, quero racao para ${profile.description}${i % 3 === 0 ? ` da ${brand}` : ''}`
      : `Oi, quero racao para ${breed.breed}${age}${i % 3 === 0 ? ` da ${brand}` : ''}`
    add({
      title: profile ? 'Produto: triagem de gato' : 'Produto: triagem com raca implicita',
      intent: 'produto',
      stage: known && !missingAge ? 'oferta' : known ? 'coleta' : 'triagem',
      has_upsell: false,
      has_price: canOfferProducts,
      user_message: message,
      ideal_reply: known
        ? canOfferProducts
          ? `${knownPrefix}\n${knownContextLine}\n\n${productReply()}`
          : `${knownPrefix}\n${knownContextLine}`
        : `Oi! Claro. Posso saber seu nome, por favor?\n\n${profile ? 'Depois vou consultar somente produtos de gato no banco.' : `Vou considerar ${breed.breed} como porte ${breed.size} e consultar o banco antes de oferecer.`}`,
      state_expected: known
        ? `cliente conhecido; intent=produto; especie=${profile?.species || breed.species}; porte=${profile ? 'nao aplicavel' : breed.size}; idade=${profile?.age || age.trim() || 'pendente'}`
        : `cliente_nome pendente; intent=produto; especie=${profile?.species || breed.species}; porte=${profile ? 'nao aplicavel' : breed.size}; idade=${profile?.age || age.trim() || 'pendente'}`,
      guard_action: known && missingAge ? 'pedir_categoria_pet' : known ? 'oferecer_produtos' : 'pedir_nome',
      tags: ['produto', 'triagem', 'raca_contexto', profile ? 'gato' : 'cachorro'],
    })
  }
}

function addProductOffers() {
  for (let i = 0; i < 35; i += 1) {
    const name = pick(names, i)
    const breed = pick(breeds, i)
    const brand = pick(brands, i)
    const brandUnavailable = i % 6 === 0
    add({
      title: brandUnavailable ? 'Produto: marca sem estoque com alternativa' : 'Produto: oferta real do banco',
      intent: brandUnavailable ? 'sem_estoque' : 'produto',
      stage: 'oferta',
      has_upsell: false,
      has_price: true,
      user_message: brandUnavailable ? `Tem ${brand} para ${breed.breed} adulto?` : `${name}, e para ${breed.breed} adulto`,
      ideal_reply: brandUnavailable
        ? productReply({ intro: `Nao encontrei ${brand} disponivel agora, mas achei alternativas com estoque:` })
        : productReply(),
      notes: 'Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.',
      state_expected: `cliente=${name}; pet=cachorro/${breed.breed}/${breed.size}/adulto; product_options com product_id, preco e estoque`,
      guard_action: 'oferecer_produtos',
      blocked_reasons: brandUnavailable ? ['marca_sem_estoque'] : [],
      tags: ['produto', 'oferta', brandUnavailable ? 'marca_sem_estoque' : 'estoque_real'],
    })
  }
}

function addProductChoiceAndUpsell() {
  for (let i = 0; i < 30; i += 1) {
    const brand = pick(brands, i)
    const quantity = i % 5 === 0 ? '2 sacos da ' : ''
    const pet = pick(pets, i)
    add({
      title: 'Produto: escolha natural e upsell unico',
      intent: 'produto',
      stage: 'upsell',
      has_upsell: true,
      has_price: true,
      user_message: `pode ser ${quantity}${brand}`,
      ideal_reply: `A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].\n\nPosso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?`,
      notes: 'Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.',
      state_expected: `pet=${pet}; selected_product.product_id preenchido; quantidade=${quantity ? 2 : 1}; upsell.offered=true`,
      guard_action: 'oferecer_upsell',
      tags: ['produto', 'escolha', 'upsell_unico', quantity ? 'quantidade' : 'quantidade_1'],
    })
  }
}

function addUpsellResolution() {
  for (let i = 0; i < 25; i += 1) {
    const accepted = i % 3 === 0
    const userMessage = accepted ? pick(['pode colocar', 'sim, adiciona', 'manda junto'], i) : pick(typoNegatives, i)
    add({
      title: accepted ? 'Upsell: cliente aceitou' : 'Upsell: cliente recusou',
      intent: 'produto',
      stage: 'resumo_parcial',
      has_upsell: true,
      has_price: true,
      user_message: userMessage,
      ideal_reply: partialSummary({
        pet: '[PET] / [ESPECIE] [PORTE_OU_CATEGORIA]',
        item: '[PRODUTO_COM_ESTOQUE]',
        extra: accepted ? '[UPSELL_RELACIONADO]' : 'nao adicionado',
        total: accepted ? '[PRODUTO + UPSELL]' : '[PRODUTO]',
      }),
      notes: accepted ? 'Somar upsell no total parcial.' : 'Nao insistir no upsell recusado.',
      state_expected: accepted ? 'upsell.accepted=true; total inclui extra' : 'upsell.accepted=false; total sem extra',
      guard_action: 'pedir_pagamento',
      tags: ['upsell', accepted ? 'aceito' : 'recusado', 'resumo_parcial'],
    })
  }
}

function addPaymentAndDelivery() {
  for (let i = 0; i < 35; i += 1) {
    const payment = pick(payments, i)
    const delivery = i % 2 === 0
    const action = payment === 'dinheiro' ? 'pedir_troco' : delivery ? 'pedir_endereco' : 'pedir_entrega_retirada'
    add({
      title: 'Checkout: pagamento e entrega',
      intent: payment === 'dinheiro' ? 'pagamento' : delivery ? 'entrega' : 'pagamento',
      stage: payment === 'dinheiro' ? 'pagamento' : delivery ? 'entrega' : 'pagamento',
      has_upsell: false,
      has_price: true,
      user_message: payment === 'dinheiro'
        ? 'dinheiro'
        : delivery
          ? `${payment}, entrega aqui pra mim`
          : payment,
      ideal_reply: payment === 'dinheiro'
        ? 'Precisa de troco para quanto?'
        : delivery
          ? `Perfeito. A taxa de entrega e R$ [TAXA_DE_ENTREGA_DO_BANCO].\nMe passa rua, numero, bairro e ponto de referencia.`
          : 'Perfeito. Sera entrega ou retirada na loja?',
      notes: 'Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.',
      state_expected: `payment=${payment}; fulfillment=${delivery ? 'delivery pendente endereco' : 'pendente'}`,
      guard_action: action,
      tags: ['checkout', payment, delivery ? 'entrega' : 'retirada_pendente'],
    })
  }
}

function addAddressAndFinalSummary() {
  const addresses = [
    { text: 'Rua A, 123', missing: 'bairro e ponto de referencia' },
    { text: 'Av. Bernardo Mascarenhas, 1327 ap 303b', missing: 'bairro e ponto de referencia' },
    { text: 'Rua B, 200, Centro, perto da farmacia', missing: '' },
    { text: 'Avenida Brasil 45 bairro Sao Pedro referencia mercado', missing: '' },
    { text: 'Rua das Flores numero 80', missing: 'bairro e ponto de referencia' },
  ]
  for (let i = 0; i < 25; i += 1) {
    const address = pick(addresses, i)
    const complete = !address.missing
    add({
      title: complete ? 'Entrega: endereco completo e resumo final' : 'Entrega: endereco incompleto',
      intent: 'entrega',
      stage: complete ? 'resumo_final' : 'entrega',
      has_upsell: i % 4 === 0,
      has_price: true,
      user_message: address.text,
      ideal_reply: complete
        ? finalSummary({ payment: pick(payments, i), fulfillment: `Entrega: ${address.text}` })
        : `Falta ${address.missing} para eu completar a entrega.\nMe passa, por favor?`,
      notes: 'Taxa de entrega precisa aparecer explicitamente e entrar no total final.',
      state_expected: complete ? 'endereco completo; finalSummaryShown=true; total inclui taxa' : `endereco incompleto: falta ${address.missing}`,
      guard_action: complete ? 'resumo_final' : 'pedir_endereco',
      blocked_reasons: complete ? [] : ['endereco_incompleto'],
      tags: ['entrega', complete ? 'endereco_completo' : 'endereco_incompleto', 'taxa_entrega'],
    })
  }
}

function addConfirmationAndRating() {
  for (let i = 0; i < 20; i += 1) {
    const confirmed = i % 5 !== 0
    const rating = i % 2 === 0
    add({
      title: rating ? 'Avaliacao: nota 0-10' : confirmed ? 'Confirmacao final curta' : 'Resumo final recusado',
      intent: rating ? 'avaliacao' : 'confirmacao',
      stage: rating ? 'avaliacao' : 'confirmacao',
      has_upsell: false,
      has_price: true,
      user_message: rating ? String((i % 11)) : confirmed ? pick(typoAffirmatives, i) : pick(typoNegatives, i),
      ideal_reply: rating
        ? 'Obrigado pela avaliacao! Atendimento finalizado.'
        : confirmed
          ? 'Perfeito, vou registrar agora.'
          : 'Tudo bem, nao vou finalizar esse pedido. Se quiser alterar algo, me diga o que prefere.',
      notes: rating ? 'Salvar CSAT de 0 a 10 no contexto/sessao.' : 'Confirmacao curta so vale depois do resumo final exibido.',
      state_expected: rating ? 'status=closed; csat_score preenchido' : confirmed ? 'shouldSaveOrder=true; pedido so salva agora' : 'status=cancelado; pedido nao salva',
      guard_action: rating ? 'pedir_avaliacao' : confirmed ? 'confirmar_salvar' : 'cancelar',
      blocked_reasons: confirmed || rating ? [] : ['confirmacao_recusada'],
      can_save_order: confirmed && !rating,
      tags: ['confirmacao', rating ? 'avaliacao' : confirmed ? 'salvar' : 'cancelar'],
    })
  }
}

function addBathAndGrooming() {
  for (let i = 0; i < 35; i += 1) {
    const breed = pick(breeds, i)
    const noSlot = i % 9 === 0
    const hasPetName = i % 4 !== 0
    const service = i % 3 === 0 ? 'banho e tosa' : 'banho'
    add({
      title: noSlot ? 'Banho/tosa: agenda cheia' : 'Banho/tosa: agenda real',
      intent: noSlot ? 'sem_horario' : 'banho_tosa',
      stage: noSlot ? 'oferta' : hasPetName ? 'oferta' : 'coleta',
      has_upsell: !noSlot,
      has_price: !noSlot,
      user_message: hasPetName ? `Quero ${service} para ${pick(pets, i)} ${breed.breed}` : `Quero ${service} para meu ${breed.breed}`,
      ideal_reply: noSlot
        ? 'Consultei a agenda e nao achei horario disponivel agora. Quer que eu chame a equipe para ver outros horarios?'
        : hasPetName
          ? `Consultei a agenda e tenho:\n1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]\n2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]\n3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]\n\nQual horario prefere?`
          : `Perfeito. Qual o nome do pet?\n\nVou considerar ${breed.breed} como porte ${breed.size} para consultar a agenda certa.`,
      notes: 'Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.',
      state_expected: noSlot ? 'blockedReasons inclui sem_horario_real; sem horario inventado' : `servico=${service}; porte=${breed.size}; agenda consultada`,
      guard_action: noSlot ? 'sem_horario' : hasPetName ? 'oferecer_horarios' : 'pedir_nome_pet',
      blocked_reasons: noSlot ? ['sem_horario_real'] : [],
      tags: ['banho_tosa', noSlot ? 'sem_horario' : 'agenda_real', 'raca_contexto'],
    })
  }
}

function addVeterinary() {
  const symptoms = [
    { text: 'espirrando muito', critical: false },
    { text: 'mancando', critical: false },
    { text: 'coceira forte', critical: false },
    { text: 'nao esta comendo', critical: false },
    { text: 'vomitando desde ontem', critical: false },
    { text: 'comeu veneno agora', critical: true },
    { text: 'com falta de ar', critical: true },
    { text: 'sangrando bastante', critical: true },
    { text: 'convulsionando', critical: true },
  ]
  for (let i = 0; i < 30; i += 1) {
    const symptom = pick(symptoms, i)
    const species = i % 3 === 0 ? 'gato' : 'cachorro'
    add({
      title: symptom.critical ? 'Veterinaria: sintoma sensivel' : 'Veterinaria: triagem basica',
      intent: 'veterinaria',
      stage: symptom.critical ? 'geral' : 'oferta',
      has_upsell: false,
      has_price: !symptom.critical,
      user_message: `Meu ${species} esta ${symptom.text}`,
      ideal_reply: symptom.critical
        ? 'Entendi. Esse caso precisa de atencao da equipe agora. Vou chamar um atendente para te orientar com prioridade.'
        : `Entendi. Qual seu nome e o nome do pet?\n\nDepois vou consultar a agenda real. A consulta so sera confirmada depois do valor e do resumo final.`,
      notes: symptom.critical ? 'Nao vender nem diagnosticar; pedir humano.' : 'Coletar cliente, pet, especie, problema principal e horario real.',
      state_expected: symptom.critical ? 'status=human_requested; needsHuman=true' : `intent=veterinaria; especie=${species}; symptom=${symptom.text}`,
      guard_action: symptom.critical ? 'handoff_humano' : 'pedir_nome',
      blocked_reasons: symptom.critical ? ['veterinaria_sensivel'] : [],
      tags: ['veterinaria', symptom.critical ? 'urgencia' : 'triagem', species],
    })
  }
}

function addStressCases() {
  const stress = [
    {
      title: 'Desconto: recusa gentil',
      intent: 'desconto',
      stage: 'oferta',
      user_message: 'faz mais barato pra mim?',
      ideal_reply: 'Infelizmente nao conseguimos aplicar desconto nesse pedido.\n\nSe quiser, posso te mostrar uma opcao mais economica do banco.',
      guard_action: 'recusar_desconto',
      tags: ['desconto', 'proibido'],
    },
    {
      title: 'Erro de digitacao: racao',
      intent: 'produto',
      stage: 'triagem',
      user_message: 'qro racao pro meu shitzu aduto',
      ideal_reply: 'Claro. Posso saber seu nome, por favor?\n\nVou considerar Shih Tzu como porte pequeno e adulto como categoria do pet.',
      guard_action: 'pedir_nome',
      tags: ['typo', 'raca_contexto'],
    },
    {
      title: 'Humano solicitado',
      intent: 'geral',
      stage: 'geral',
      user_message: 'quero falar com uma pessoa',
      ideal_reply: 'Claro. Vou chamar alguem da equipe para continuar seu atendimento.',
      guard_action: 'handoff_humano',
      blocked_reasons: ['humano_solicitado'],
      tags: ['humano', 'handoff'],
    },
    {
      title: 'Multi-intencao: separar fluxos',
      intent: 'produto',
      stage: 'coleta',
      user_message: 'quero racao e banho',
      ideal_reply: 'Claro. Vou organizar uma coisa por vez para nao misturar.\n\nQual seu nome?',
      guard_action: 'pedir_nome',
      tags: ['multi_intencao'],
    },
    {
      title: 'Cliente muda de ideia',
      intent: 'veterinaria',
      stage: 'coleta',
      user_message: 'na verdade quero veterinario',
      ideal_reply: 'Sem problema. Vou trocar para atendimento veterinario.\n\nQual o nome do pet e o problema principal?',
      guard_action: 'pedir_nome_pet',
      tags: ['mudanca_intencao'],
    },
    {
      title: 'Nao repetir dado coletado',
      intent: 'produto',
      stage: 'oferta',
      user_message: 'eu ja falei, e adulto',
      ideal_reply: `Perfeito, desculpa. Vou seguir com adulto e consultar o estoque real agora.\n\n${productReply()}`,
      guard_action: 'oferecer_produtos',
      tags: ['nao_repetir'],
    },
    {
      title: 'Produto inexistente',
      intent: 'sem_estoque',
      stage: 'oferta',
      user_message: 'tem uma racao importada azul que nao lembro o nome?',
      ideal_reply: 'Consultei aqui e nao encontrei produto disponivel com esses dados. Quer que eu chame alguem da equipe para te ajudar?',
      guard_action: 'sem_estoque',
      blocked_reasons: ['estoque_ausente'],
      tags: ['sem_estoque'],
    },
    {
      title: 'Pedido de link de pagamento',
      intent: 'pagamento',
      stage: 'pagamento',
      user_message: 'manda link pra pagar',
      ideal_reply: 'No momento nao trabalho com link de pagamento por aqui.\n\nQual forma prefere? pix, dinheiro ou cartao?',
      guard_action: 'pedir_pagamento',
      tags: ['pagamento', 'sem_link'],
    },
    {
      title: 'Cliente impaciente',
      intent: 'produto',
      stage: 'coleta',
      user_message: 'anda logo, so quero comprar',
      ideal_reply: 'Claro, vou ser rapido.\n\nSo preciso saber se e para cachorro ou gato para consultar o produto certo.',
      guard_action: 'pedir_especie',
      tags: ['tom_humano', 'cliente_impaciente'],
    },
    {
      title: 'Pergunta de taxa antes do pedido',
      intent: 'entrega',
      stage: 'triagem',
      user_message: 'quanto e a entrega?',
      ideal_reply: 'Vou consultar a regra da loja. A taxa de entrega e R$ [TAXA_DE_ENTREGA_DO_BANCO].\n\nO que voce quer pedir?',
      guard_action: 'identificar_intencao',
      tags: ['taxa_entrega'],
    },
  ]

  for (let i = 0; i < 25; i += 1) {
    const base = pick(stress, i)
    add({
      ...base,
      has_upsell: false,
      has_price: base.ideal_reply.includes('[VALOR') || base.ideal_reply.includes('[TAXA'),
      notes: 'Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.',
      state_expected: 'guardiao deve bloquear avancos inseguros e manter resposta curta',
      can_save_order: false,
    })
  }
}

addProductTriage()
addProductOffers()
addProductChoiceAndUpsell()
addUpsellResolution()
addPaymentAndDelivery()
addAddressAndFinalSummary()
addConfirmationAndRating()
addBathAndGrooming()
addVeterinary()
addStressCases()

if (examples.length !== 300) {
  throw new Error(`Expected 300 examples, got ${examples.length}`)
}

const txt = [
  'PetBot Knowledge Base - 300 cenarios corretos',
  `Gerado em: ${generatedAt}`,
  '',
  'Uso previsto:',
  '- Revisao humana do fluxo do PetBot.',
  '- Base de conhecimento/RAG com exemplos aprovados.',
  '- Seed futuro em bot_conversation_examples.',
  '- QA offline do guardiao deterministico.',
  '',
  'Regras destes exemplos:',
  '- Nunca inventar produto, preco, estoque, horario ou taxa.',
  '- Placeholders entre colchetes sempre dependem do banco.',
  '- Confirmacao curta so salva se o resumo final ja foi exibido.',
  '- Entrega so fecha com rua, numero, bairro e referencia.',
  '- Upsell e oferecido no maximo uma vez e sem insistir.',
  '',
  ...examples.flatMap((example, index) => [
    `## ${example.source_key} | ${example.title}`,
    `Contexto inicial: ${example.initial_context}`,
    `Intent: ${example.intent}`,
    `Stage: ${example.stage}`,
    `Cliente: ${example.user_message}`,
    'Bot ideal:',
    example.ideal_reply,
    `Estado esperado: ${example.state_expected}`,
    `Acao do guardiao: ${example.guard_action}`,
    `Bloqueios esperados: ${example.blocked_reasons.length ? example.blocked_reasons.join(', ') : 'nenhum'}`,
    `Pode salvar pedido/agendamento: ${example.can_save_order ? 'sim' : 'nao'}`,
    `Tags: ${example.tags.join(', ')}`,
    example.notes ? `Notas: ${example.notes}` : '',
    '',
  ]),
].join('\n')

const jsonl = examples.map((example) => JSON.stringify(example)).join('\n') + '\n'

const rows = examples.map((example) => {
  const tags = [...new Set([...(example.tags || []), example.guard_action].filter(Boolean))]
  return `(
  null,
  'petshop',
  '${example.intent}',
  '${example.stage}',
  '${example.tone}',
  ${example.has_upsell ? 'true' : 'false'},
  ${example.has_price ? 'true' : 'false'},
  true,
  '${example.source_key}',
  ${quoteSql(example.user_message, 'user')},
  ${quoteSql(example.ideal_reply, 'reply')},
  ${quoteSql(`${example.title}. Contexto inicial: ${example.initial_context}. Guardiao: ${example.guard_action}. Estado esperado: ${example.state_expected}. Bloqueios: ${example.blocked_reasons.length ? example.blocked_reasons.join(', ') : 'nenhum'}. ${example.notes || ''}`, 'notes')},
  ${arraySql(tags)}
)`
}).join(',\n')

const sql = `-- =============================================================================
-- YuiSync - PetBot Knowledge Base 300
-- =============================================================================
-- Gerado por scripts/generate-petbot-knowledge-base.mjs em ${generatedAt}.
-- Estes exemplos sao globais (tenant_id null) e usam placeholders.
-- Nao substituem banco/guardiao: produto, preco, estoque, taxa e horario
-- continuam obrigatoriamente vindos das tabelas operacionais.
-- =============================================================================

begin;

insert into public.bot_conversation_examples (
  tenant_id,
  module_id,
  intent,
  stage,
  tone,
  has_upsell,
  has_price,
  has_bank_placeholder,
  source_key,
  user_message,
  ideal_reply,
  notes,
  tags
) values
${rows}
on conflict (module_id, source_key) where tenant_id is null and source_key is not null
do update set
  intent = excluded.intent,
  stage = excluded.stage,
  tone = excluded.tone,
  has_upsell = excluded.has_upsell,
  has_price = excluded.has_price,
  has_bank_placeholder = excluded.has_bank_placeholder,
  user_message = excluded.user_message,
  ideal_reply = excluded.ideal_reply,
  notes = excluded.notes,
  tags = excluded.tags,
  active = true,
  updated_at = now();

commit;
`

fs.writeFileSync(outTxt, txt, 'utf8')
fs.writeFileSync(outJsonl, jsonl, 'utf8')
fs.writeFileSync(outSql, sql, 'utf8')

console.log(`Generated ${examples.length} PetBot examples:`)
console.log(`- ${path.relative(root, outTxt)}`)
console.log(`- ${path.relative(root, outJsonl)}`)
console.log(`- ${path.relative(root, outSql)}`)
