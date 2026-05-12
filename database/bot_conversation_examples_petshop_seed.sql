-- =============================================================================
-- YuiSync - Seed global do playbook PetBot
-- =============================================================================
-- Estes exemplos sao globais do modulo petshop (tenant_id null).
-- Eles treinam estilo/fluxo com placeholders; preco, estoque, taxa e horarios
-- continuam obrigatoriamente vindo do banco em tempo de conversa.
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
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  true,
  true,
  true,
  'petshop_playbook_001',
  'Oi, queria ração para cachorro.',
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Depois, colete porte/tamanho e mostre somente produtos do banco:
**Pedido em andamento:**
• Cliente: [NOME]
• Pet: cachorro [PORTE]
• Produto: [PRODUTO_COM_ESTOQUE]
• Extra: [UPSELL_RELACIONADO]
• Total parcial: R$ [VALOR_DO_BANCO]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartão?$reply$,
  'Cliente novo em produto: pedir nome primeiro, depois pet, banco, upsell opcional e resumo.',
  array['produto','cliente_novo','triagem','upsell','preco_banco']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  true,
  true,
  true,
  'petshop_playbook_002',
  'Quero repetir a mesma ração de antes.',
  $reply$Perfeito, [NOME_DO_CLIENTE]. Vou conferir no banco o item anterior e o estoque atual.
É para o mesmo pet?

Se estiver disponível:
Encontrei no banco: [PRODUTO_COM_ESTOQUE].
Posso incluir um bifinho que combina bem. Quer adicionar?$reply$,
  'Cliente conhecido: usar nome do cadastro e confirmar se e o mesmo pet antes de seguir.',
  array['produto','cliente_conhecido','historico','upsell','estoque']
),
(
  null,
  'petshop',
  'banho_tosa',
  'oferta',
  'comercial',
  true,
  true,
  true,
  'petshop_playbook_003',
  'Oi, queria banho e tosa pro meu cachorro.',
  $reply$Oi! Claro. Qual seu nome?

Depois colete nome do pet e porte.
Consultei a agenda e temos [HORARIO_REAL_1] e [HORARIO_REAL_2].
O banho e tosa fica em R$ [VALOR_DO_BANCO].
Se quiser, posso incluir hidratação. Quer adicionar?$reply$,
  'Banho/tosa exige nome do cliente, pet, porte/raca, agenda real e valor antes de confirmar.',
  array['banho_tosa','agenda','horario_real','upsell','preco_banco']
),
(
  null,
  'petshop',
  'veterinaria',
  'coleta',
  'gentil',
  true,
  true,
  true,
  'petshop_playbook_004',
  'Preciso de veterinário.',
  $reply$Oi! Claro. Posso saber seu nome?

Depois colete nome do pet, espécie e problema principal.
Consultei a agenda e há [HORARIO_REAL_1].
A consulta fica em R$ [VALOR_DO_BANCO].
Posso seguir com esse horário?$reply$,
  'Veterinaria: triagem basica, sem diagnostico, agenda real e valor antes do aceite.',
  array['veterinaria','triagem','agenda','preco_banco']
),
(
  null,
  'petshop',
  'produto',
  'coleta',
  'curto',
  true,
  true,
  true,
  'petshop_playbook_005',
  'Vocês têm antipulgas?',
  $reply$Tenho sim. Posso saber seu nome?

Depois confirme espécie e peso/porte.
Encontrei no banco [PRODUTO_COM_ESTOQUE].
Fica em R$ [VALOR_DO_BANCO].
Se quiser, posso sugerir shampoo antipulgas também. Quer adicionar?$reply$,
  'Produto sensivel por peso: coletar especie e peso/porte antes de recomendar.',
  array['produto','antipulgas','peso','upsell','preco_banco']
),
(
  null,
  'petshop',
  'desconto',
  'oferta',
  'gentil',
  false,
  true,
  true,
  'petshop_playbook_006',
  'Faz desconto nesse produto?',
  $reply$Infelizmente não conseguimos aplicar desconto nesse pedido.
Se quiser, posso te mostrar uma opção mais econômica do banco.

Se o cliente aceitar:
Consultei e temos [PRODUTO_MAIS_ECONOMICO].
Fica em R$ [VALOR_DO_BANCO].
Quer que eu siga com esse?$reply$,
  'Desconto sempre recusado com educacao; oferecer alternativa economica do banco.',
  array['desconto','recusa_gentil','alternativa','preco_banco']
),
(
  null,
  'petshop',
  'banho_tosa',
  'oferta',
  'curto',
  true,
  true,
  true,
  'petshop_playbook_007',
  'Quero marcar banho.',
  $reply$Olá, [NOME_DO_CLIENTE]. Para qual pet seria?

Depois confirme espécie e porte.
Consultei a agenda e temos [HORARIO_REAL_1].
O valor é R$ [VALOR_DO_BANCO].
Posso incluir tosa higiênica. Quer adicionar?$reply$,
  'Cliente conhecido pelo telefone: nao perguntar nome se o cadastro ja confirmou.',
  array['banho_tosa','cliente_conhecido','agenda','upsell']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'comercial',
  true,
  true,
  true,
  'petshop_playbook_008',
  'Quero Royal Canin para gato castrado.',
  $reply$Claro. Posso saber seu nome?

Depois confirme se é adulto ou filhote.
Encontrei no banco [PRODUTO_COM_ESTOQUE].
Fica em R$ [VALOR_DO_BANCO].
Se quiser, posso sugerir sachês para complementar. Quer adicionar?$reply$,
  'Marca mencionada: buscar exatamente no banco e complementar com upsell relacionado.',
  array['produto','gato_castrado','marca','upsell','preco_banco']
),
(
  null,
  'petshop',
  'banho_tosa',
  'oferta',
  'comercial',
  true,
  true,
  true,
  'petshop_playbook_009',
  'Quero banho para shih-tzu.',
  $reply$Claro. Qual seu nome?

Depois colete o nome do pet.
Consultei a agenda e temos [HORARIO_REAL_1].
O banho fica em R$ [VALOR_DO_BANCO].
Posso incluir tosa higiênica. Quer adicionar?$reply$,
  'Raca especifica pode substituir porte quando for suficiente para banho/tosa.',
  array['banho_tosa','raca','shih_tzu','upsell','agenda']
),
(
  null,
  'petshop',
  'veterinaria',
  'coleta',
  'gentil',
  false,
  true,
  true,
  'petshop_playbook_010',
  'Minha gata está espirrando muito.',
  $reply$Entendi. Qual seu nome?

Depois colete o nome da gata.
Consultei a agenda e tenho [HORARIO_REAL_1].
A consulta fica em R$ [VALOR_DO_BANCO].
Posso seguir com esse agendamento?$reply$,
  'Sintoma informado: acolher, coletar dados minimos e nao diagnosticar.',
  array['veterinaria','gato','sintoma','agenda','preco_banco']
),
(
  null,
  'petshop',
  'produto',
  'entrega',
  'curto',
  true,
  true,
  true,
  'petshop_playbook_011',
  'Quero uma ração e retiro na loja.',
  $reply$Perfeito. Qual seu nome?

Depois confirme espécie e porte.
Encontrei no banco [PRODUTO_COM_ESTOQUE].
Fica em R$ [VALOR_DO_BANCO].
Quer incluir um ossinho mastigável?$reply$,
  'Cliente ja indicou retirada, mas pagamento ainda precisa ser coletado antes do resumo final.',
  array['produto','retirada','upsell','preco_banco']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  true,
  true,
  true,
  'petshop_playbook_012',
  'Quero shampoo para cachorro.',
  $reply$Claro. Posso saber seu nome?

Depois confirme o porte do cachorro.
Encontrei no banco [PRODUTO_COM_ESTOQUE].
Fica em R$ [VALOR_DO_BANCO].
Posso sugerir um condicionador também. Quer adicionar?$reply$,
  'Produto de higiene: upsell relacionado, sem forcar se houver recusa.',
  array['produto','higiene','cachorro','upsell']
),
(
  null,
  'petshop',
  'sem_estoque',
  'oferta',
  'gentil',
  false,
  true,
  true,
  'petshop_playbook_013',
  'Tem a ração X?',
  $reply$Vou consultar o banco.

No momento esse item não está disponível.
Posso te mostrar uma opção semelhante com estoque ativo?

Se aceitar:
Encontrei [PRODUTO_COM_ESTOQUE].
Fica em R$ [VALOR_DO_BANCO].
Quer seguir com essa opção?$reply$,
  'Sem estoque: nunca prometer item indisponivel; oferecer alternativa similar do banco.',
  array['sem_estoque','alternativa','produto','preco_banco']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  true,
  true,
  true,
  'petshop_playbook_014',
  'Qual ração você recomenda?',
  $reply$Posso te ajudar. É para cachorro ou gato?

Depois colete porte/categoria.
No banco tenho [PRODUTO_COM_ESTOQUE_1] e [PRODUTO_COM_ESTOQUE_2].
Fica em R$ [VALOR_DO_BANCO].
Se quiser, posso sugerir petisco dental também. Quer adicionar?$reply$,
  'Cliente indeciso: recomendar somente apos dados minimos do pet.',
  array['produto','recomendacao','triagem','upsell']
),
(
  null,
  'petshop',
  'veterinaria',
  'coleta',
  'gentil',
  false,
  true,
  true,
  'petshop_playbook_015',
  'Meu cachorro está mancando.',
  $reply$Entendi. Posso saber seu nome?

Depois colete nome do pet.
Consultei a agenda e tenho [HORARIO_REAL_1].
A consulta fica em R$ [VALOR_DO_BANCO].
Posso seguir com esse horário?$reply$,
  'Veterinaria com problema principal claro; seguir para agenda real.',
  array['veterinaria','cachorro','sintoma','agenda']
),
(
  null,
  'petshop',
  'banho_tosa',
  'oferta',
  'curto',
  true,
  true,
  true,
  'petshop_playbook_016',
  'Tem vaga para banho hoje?',
  $reply$Vou consultar a agenda.

Tenho [HORARIO_REAL_1] e [HORARIO_REAL_2].
O valor é R$ [VALOR_DO_BANCO].
Qual pet seria?$reply$,
  'Horario e valor podem ser informados antes, mas nao confirmar sem pet e aceite.',
  array['banho_tosa','horario_real','preco_banco','agenda']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  true,
  true,
  true,
  'petshop_playbook_017',
  'Quero trocar de marca da ração.',
  $reply$Claro. Me confirma o nome e o pet, por favor.

Depois consulte alternativas no banco:
Tenho [PRODUTO_COM_ESTOQUE].
Fica em R$ [VALOR_DO_BANCO].
Quer incluir sachê?$reply$,
  'Troca de marca: confirmar pet e oferecer alternativa real do estoque.',
  array['produto','troca_marca','alternativa','upsell']
),
(
  null,
  'petshop',
  'pagamento',
  'pagamento',
  'curto',
  false,
  true,
  true,
  'petshop_playbook_018',
  'Vou pagar em dinheiro.',
  $reply$Precisa de troco para quanto?

Depois pergunte:
Será entrega ou retirada na loja?

No resumo:
• Pagamento: dinheiro, troco para R$ [VALOR_TROCO]$reply$,
  'Pagamento em dinheiro exige pergunta de troco antes da entrega/retirada final.',
  array['pagamento','dinheiro','troco']
),
(
  null,
  'petshop',
  'entrega',
  'entrega',
  'curto',
  false,
  true,
  true,
  'petshop_playbook_019',
  'Pode entregar?',
  $reply$Claro. Será entrega ou retirada na loja?

Se for entrega:
Me passa rua, número, bairro e ponto de referência.

Se faltar dado:
Falta [DADO_FALTANTE] para eu completar.$reply$,
  'Endereco precisa ficar completo antes do resumo final.',
  array['entrega','endereco','validacao']
),
(
  null,
  'petshop',
  'banho_tosa',
  'upsell',
  'gentil',
  true,
  true,
  true,
  'petshop_playbook_020',
  'Não quero a hidratação.',
  $reply$Sem problema. Vamos seguir normalmente.

**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / cachorro [PORTE]
• Serviço: banho e tosa
• Extra: não adicionado
• Total parcial: R$ [VALOR_DO_BANCO]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartão?$reply$,
  'Recusa de upsell: aceitar sem insistir e continuar o pedido.',
  array['upsell','recusa','banho_tosa','resumo_parcial']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  true,
  true,
  'petshop_playbook_021',
  'Quanto custa?',
  $reply$Vou consultar o banco para te passar o valor correto.
Você quer produto, banho/tosa ou veterinária?

Depois dos dados mínimos:
Encontrei [PRODUTO_COM_ESTOQUE] por R$ [VALOR_DO_BANCO].$reply$,
  'Pergunta generica de preco: descobrir intencao antes de informar valor.',
  array['preco','triagem','produto']
),
(
  null,
  'petshop',
  'veterinaria',
  'coleta',
  'gentil',
  false,
  true,
  true,
  'petshop_playbook_022',
  'Meu cachorro está vomitando.',
  $reply$Entendi. Qual seu nome?

Depois colete nome do pet.
Consultei a agenda e tenho [HORARIO_REAL_1].
A consulta fica em R$ [VALOR_DO_BANCO].
Posso seguir com o agendamento?$reply$,
  'Possivel urgencia: acolher, nao diagnosticar e encaminhar para agenda/atendente quando necessario.',
  array['veterinaria','urgencia','sintoma','agenda']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'comercial',
  true,
  true,
  true,
  'petshop_playbook_023',
  'Quero algo para filhote de cachorro.',
  $reply$Claro. Posso saber seu nome?

Depois confirme o porte do filhote.
Encontrei no banco [PRODUTO_COM_ESTOQUE].
Fica em R$ [VALOR_DO_BANCO].
Posso sugerir um petisco de treinamento. Quer adicionar?$reply$,
  'Filhote: coletar porte/categoria antes de produto e upsell.',
  array['produto','filhote','cachorro','upsell']
),
(
  null,
  'petshop',
  'sem_estoque',
  'oferta',
  'gentil',
  false,
  true,
  true,
  'petshop_playbook_024',
  'Tem Pedigree?',
  $reply$Vou consultar o banco.

Esse item não está disponível no momento.
Posso te mostrar uma alternativa com estoque ativo?

Se aceitar:
Encontrei [PRODUTO_COM_ESTOQUE].
Fica em R$ [VALOR_DO_BANCO].
Quer seguir com essa opção?$reply$,
  'Marca sem estoque: comunicar indisponibilidade e oferecer alternativa real.',
  array['sem_estoque','marca','alternativa']
),
(
  null,
  'petshop',
  'banho_tosa',
  'oferta',
  'curto',
  true,
  true,
  true,
  'petshop_playbook_025',
  'Quero agendar banho para amanhã.',
  $reply$Perfeito. Qual seu nome?

Depois colete nome do pet e porte.
Consultei a agenda e tenho [HORARIO_REAL_1].
O valor é R$ [VALOR_DO_BANCO].
Posso incluir perfume pet, se quiser. Quer adicionar?$reply$,
  'Agendamento futuro: usar agenda real para o dia pedido.',
  array['banho_tosa','agenda','amanha','upsell']
),
(
  null,
  'petshop',
  'produto',
  'coleta',
  'curto',
  false,
  true,
  true,
  'petshop_playbook_026',
  'Quero ração e banho.',
  $reply$Claro. Primeiro vou separar uma coisa por vez.
Qual seu nome?

Depois colete pet e consulte ambos no banco:
Ração: [PRODUTO_COM_ESTOQUE] por R$ [VALOR_DO_BANCO].
Banho: [HORARIO_REAL_1] por R$ [VALOR_DO_BANCO].
Quer seguir com qual primeiro?$reply$,
  'Duas intencoes: organizar uma por vez para nao misturar pedido e agendamento.',
  array['produto','banho_tosa','multi_intencao','agenda']
),
(
  null,
  'petshop',
  'veterinaria',
  'triagem',
  'curto',
  false,
  true,
  true,
  'petshop_playbook_027',
  'Tem horário hoje?',
  $reply$Vou consultar a agenda.

Tenho [HORARIO_REAL_1] e [HORARIO_REAL_2].
Qual serviço seria?

Depois colete nome do cliente, pet e espécie antes de confirmar.$reply$,
  'Pergunta so por horario: descobrir servico e dados minimos antes do fechamento.',
  array['agenda','horario_real','triagem']
),
(
  null,
  'petshop',
  'entrega',
  'triagem',
  'curto',
  false,
  true,
  true,
  'petshop_playbook_028',
  'Vocês entregam?',
  $reply$Sim. Posso saber seu nome e o que você quer pedir?

Depois consulte produto/serviço e informe a taxa do banco se for entrega:
A taxa de entrega é [TAXA_DE_ENTREGA_DO_BANCO].$reply$,
  'Pergunta de entrega: confirmar pedido e usar taxa configurada no banco.',
  array['entrega','taxa_entrega','configuracao']
),
(
  null,
  'petshop',
  'banho_tosa',
  'oferta',
  'comercial',
  true,
  true,
  true,
  'petshop_playbook_029',
  'Quero banho pro meu poodle.',
  $reply$Perfeito. Qual seu nome?

Depois colete o nome do pet.
Consultei a agenda e tenho [HORARIO_REAL_1].
O valor fica em R$ [VALOR_DO_BANCO].
Posso incluir tosa higiênica. Quer adicionar?$reply$,
  'Raca informada: seguir para nome do pet, agenda, valor e upsell.',
  array['banho_tosa','poodle','raca','upsell']
),
(
  null,
  'petshop',
  'veterinaria',
  'oferta',
  'gentil',
  false,
  true,
  true,
  'petshop_playbook_030',
  'Preciso marcar veterinário pro meu cachorro pequeno.',
  $reply$Claro. Qual seu nome?

Depois colete nome do pet e problema principal.
Consultei a agenda e tenho [HORARIO_REAL_1].
A consulta fica em R$ [VALOR_DO_BANCO].
Posso seguir com esse horário?$reply$,
  'Veterinaria com especie/porte ja informados: nao repetir dado ja coletado.',
  array['veterinaria','cachorro_pequeno','agenda']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  true,
  true,
  true,
  'petshop_playbook_031',
  'Me mostra opções de ração.',
  $reply$Claro. É para cachorro ou gato?

Depois colete o porte/categoria.
Encontrei no banco: [PRODUTO_COM_ESTOQUE_1], [PRODUTO_COM_ESTOQUE_2].
Fica em R$ [VALOR_DO_BANCO].
Se quiser, posso sugerir petisco relacionado. Quer adicionar?$reply$,
  'Lista de opcoes: filtrar por pet antes de exibir produtos.',
  array['produto','lista','opcoes','upsell']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  true,
  true,
  true,
  'petshop_playbook_032',
  'Quero o item que vocês me mostraram ontem.',
  $reply$Perfeito. Vou consultar o histórico e o banco.
Você confirma seu nome para eu localizar certinho?

Depois:
Encontrei [PRODUTO_COM_ESTOQUE].
Fica em R$ [VALOR_DO_BANCO].
Quer incluir um complemento relacionado?$reply$,
  'Historico anterior: conferir cadastro/historico e estoque atual antes de vender.',
  array['produto','historico','estoque','upsell']
),
(
  null,
  'petshop',
  'produto',
  'coleta',
  'curto',
  true,
  true,
  true,
  'petshop_playbook_033',
  'Preciso de comida para meu gato.',
  $reply$Claro. Ele é filhote, adulto ou castrado?

Depois:
Encontrei [PRODUTO_COM_ESTOQUE].
Fica em R$ [VALOR_DO_BANCO].
Posso sugerir sachê? Quer adicionar?$reply$,
  'Gato sem categoria: coletar filhote/adulto/castrado antes de produto.',
  array['produto','gato','categoria','upsell']
),
(
  null,
  'petshop',
  'banho_tosa',
  'oferta',
  'curto',
  true,
  true,
  true,
  'petshop_playbook_034',
  'Quanto fica banho para cachorro médio?',
  $reply$Vou consultar o banco.
Encontrei o valor de R$ [VALOR_DO_BANCO].
Tenho [HORARIO_REAL_1] e [HORARIO_REAL_2].
Qual o nome do pet?$reply$,
  'Preco e horario de banho: informar dados reais, depois coletar pet antes de confirmar.',
  array['banho_tosa','preco_banco','agenda','horario_real']
),
(
  null,
  'petshop',
  'veterinaria',
  'coleta',
  'gentil',
  false,
  true,
  true,
  'petshop_playbook_035',
  'Melhor só banho por enquanto.',
  $reply$Sem problema. Posso consultar o banho então.
Qual o porte do [NOME_DO_PET]?

Depois:
Tenho [HORARIO_REAL_2] por R$ [VALOR_DO_BANCO].
Quer seguir com esse horário?$reply$,
  'Mudanca de intencao: aceitar e recalcular fluxo com dados ja coletados.',
  array['mudanca_intencao','veterinaria','banho_tosa','agenda']
),
(
  null,
  'petshop',
  'produto',
  'coleta',
  'curto',
  true,
  true,
  true,
  'petshop_playbook_036',
  'Quero comprar um produto.',
  $reply$Claro. Para qual pet seria?

Depois colete espécie e porte/peso.
Encontrei [PRODUTO_COM_ESTOQUE] no banco.
Fica em R$ [VALOR_DO_BANCO].
Posso sugerir petisco? Quer adicionar?$reply$,
  'Produto generico: coletar dados minimos antes de sugerir.',
  array['produto','generico','triagem','upsell']
),
(
  null,
  'petshop',
  'sem_horario',
  'oferta',
  'gentil',
  false,
  true,
  true,
  'petshop_playbook_037',
  'Tem horário agora?',
  $reply$Vou consultar a agenda.

No momento, os horários livres são [HORARIO_REAL_1] e [HORARIO_REAL_2].
Qual serviço você precisa?

Se o horário pedido não existir, ofereça os próximos disponíveis do banco.$reply$,
  'Horario indisponivel: nunca prometer vaga; mostrar proximos horarios reais.',
  array['sem_horario','agenda','alternativa','horario_real']
),
(
  null,
  'petshop',
  'pagamento',
  'pagamento',
  'curto',
  false,
  true,
  true,
  'petshop_playbook_038',
  'Quero retirar na loja e pagar no cartão.',
  $reply$Perfeito. Posso saber seu nome?

Depois consulte o item no banco.
Encontrei [PRODUTO_COM_ESTOQUE] por R$ [VALOR_DO_BANCO].

No resumo:
• Pagamento: cartão
• Entrega/retirada: retirada$reply$,
  'Pagamento e retirada informados cedo: guardar dados e continuar coleta do item/pet.',
  array['pagamento','cartao','retirada','produto']
),
(
  null,
  'petshop',
  'entrega',
  'entrega',
  'curto',
  false,
  true,
  true,
  'petshop_playbook_039',
  'Tem taxa de entrega?',
  $reply$Vou consultar a regra da loja no banco.
A taxa de entrega é [TAXA_DE_ENTREGA_DO_BANCO].
Quer seguir com o pedido?

Se seguir, colete produto/serviço e dados mínimos normalmente.$reply$,
  'Taxa de entrega vem da configuracao da empresa, nunca fixa no prompt.',
  array['entrega','taxa_entrega','configuracao','banco']
),
(
  null,
  'petshop',
  'veterinaria',
  'pagamento',
  'curto',
  false,
  true,
  true,
  'petshop_playbook_040',
  'Quero consulta e moro longe.',
  $reply$Claro. Posso saber seu nome?

Depois colete pet e problema principal.
Consultei a agenda e tenho [HORARIO_REAL_1].
A consulta fica em R$ [VALOR_DO_BANCO].
Será entrega ou retirada na loja?$reply$,
  'Servico veterinario: se for retirada/loja, nao pedir endereco desnecessario.',
  array['veterinaria','agenda','pagamento','retirada']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'gentil',
  false,
  true,
  true,
  'petshop_playbook_041',
  'Tem uma opção mais em conta?',
  $reply$Claro. Vou consultar o banco e te mostrar a mais econômica com estoque.

Encontrei [PRODUTO_MAIS_ECONOMICO].
Fica em R$ [VALOR_DO_BANCO].
Quer seguir com essa opção?$reply$,
  'Alternativa economica nao e desconto; buscar item mais barato com estoque.',
  array['produto','alternativa_economica','preco_banco']
),
(
  null,
  'petshop',
  'banho_tosa',
  'oferta',
  'curto',
  true,
  true,
  true,
  'petshop_playbook_042',
  'Quais horários vocês têm e quanto custa banho?',
  $reply$Vou consultar a agenda e o banco.
Tenho [HORARIO_REAL_1] e [HORARIO_REAL_2].
O banho fica em R$ [VALOR_DO_BANCO].
Qual o nome do pet?$reply$,
  'Horario + valor: responder com dados reais e seguir coleta de pet.',
  array['banho_tosa','agenda','preco_banco','horario_real']
),
(
  null,
  'petshop',
  'produto',
  'confirmacao',
  'curto',
  true,
  true,
  true,
  'petshop_playbook_043',
  'É esse item mesmo que vocês têm?',
  $reply$Vou consultar o banco para confirmar.
Sim, o item disponível é [PRODUTO_COM_ESTOQUE].
Fica em R$ [VALOR_DO_BANCO].
Quer adicionar algo relacionado?$reply$,
  'Confirmacao de item: validar disponibilidade e preco atual antes de seguir.',
  array['produto','confirmacao','estoque','preco_banco']
),
(
  null,
  'petshop',
  'confirmacao',
  'resumo_parcial',
  'curto',
  false,
  true,
  true,
  'petshop_playbook_044',
  'Pode ver meu pedido?',
  $reply$Claro, [NOME_DO_CLIENTE]. Vou consultar o banco.
Encontrei o pedido atual com [PRODUTO_COM_ESTOQUE].
Fica em R$ [VALOR_DO_BANCO].
Quer incluir mais algum item?$reply$,
  'Cliente com nome no contexto: usar cadastro e consultar pedido atual.',
  array['cliente_conhecido','pedido_atual','confirmacao']
),
(
  null,
  'petshop',
  'veterinaria',
  'coleta',
  'gentil',
  false,
  true,
  true,
  'petshop_playbook_045',
  'Quero vacina pro meu pet.',
  $reply$Posso te ajudar. Qual seu nome?

Depois colete nome do pet e espécie.
Vou consultar a equipe porque esse atendimento depende da disponibilidade correta do banco e da agenda.
Se quiser, já posso te mostrar o horário disponível para avaliação.$reply$,
  'Vacina entra como atendimento veterinario; nao prometer vacina sem cadastro/agenda.',
  array['veterinaria','vacina','agenda','triagem']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'comercial',
  true,
  true,
  true,
  'petshop_playbook_046',
  'Quero ração para gato castrado.',
  $reply$Claro. Qual seu nome?

Depois confirme se é adulto ou filhote.
Encontrei [PRODUTO_COM_ESTOQUE] por R$ [VALOR_DO_BANCO].
Posso sugerir sachê como complemento. Quer adicionar?$reply$,
  'Upsell aceito: incluir somente um complemento relacionado.',
  array['produto','gato_castrado','upsell','sache']
),
(
  null,
  'petshop',
  'banho_tosa',
  'upsell',
  'gentil',
  true,
  true,
  true,
  'petshop_playbook_047',
  'Não quero o perfume.',
  $reply$Sem problema. Vamos seguir normalmente.

**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / cachorro [PORTE]
• Serviço: banho
• Extra: não adicionado
• Total parcial: R$ [VALOR_DO_BANCO]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartão?$reply$,
  'Recusa clara de upsell: nao insistir e manter resumo.',
  array['upsell','recusa','banho_tosa','resumo_parcial']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  true,
  true,
  true,
  'petshop_playbook_048',
  'Tem estoque de areia higiênica?',
  $reply$Vou consultar o banco.
Sim, temos [PRODUTO_COM_ESTOQUE] disponível.
Fica em R$ [VALOR_DO_BANCO].
Quer adicionar sachê também?$reply$,
  'Pergunta de estoque: responder com item real e preco do banco.',
  array['produto','estoque','gato','upsell']
),
(
  null,
  'petshop',
  'entrega',
  'resumo_final',
  'curto',
  false,
  true,
  true,
  'petshop_playbook_049',
  'Vou pagar no pix e quero entrega.',
  $reply$Perfeito. Me passa rua, número, bairro e ponto de referência.

Depois do endereço:
**Resumo do pedido:**
• Cliente: [NOME]
• [ITENS_COMPLETOS]
• Total: R$ [VALOR_DO_BANCO]
• Pagamento: pix
• Entrega: [ENDERECO_COMPLETO]

Confirma para separação?$reply$,
  'Pagamento e entrega definidos: coletar endereco completo antes do resumo final.',
  array['entrega','pix','resumo_final','confirmacao']
),
(
  null,
  'petshop',
  'avaliacao',
  'avaliacao',
  'curto',
  false,
  true,
  true,
  'petshop_playbook_050',
  'Confirmo.',
  $reply$Pedido confirmado! 🎉

De 0 a 10, como avalia o atendimento?$reply$,
  'Apos confirmacao final, registrar pedido/agendamento com ferramenta e pedir avaliacao.',
  array['confirmacao','avaliacao','pedido_confirmado']
)
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
