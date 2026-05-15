-- =============================================================================
-- YuiSync - PetBot Knowledge Base 300
-- =============================================================================
-- Gerado por scripts/generate-petbot-knowledge-base.mjs em 2026-05-14.
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
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_001',
  $user$Oi, quero racao para gato adulto castrado da Premier$user$,
  $reply$Perfeito, [NOME_DO_CLIENTE]. Vou usar os dados do cadastro e consultar o estoque real.
Vou filtrar por gato adulto castrado.

Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: triagem de gato. Contexto inicial: Telefone ja cadastrado; nome do tutor conhecido; usar historico sem repetir pergunta.. Guardiao: oferecer_produtos. Estado esperado: cliente conhecido; intent=produto; especie=gato; porte=nao aplicavel; idade=adulto castrado. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'gato', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_002',
  $user$Oi, quero racao para poodle filhote$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar poodle como porte pequeno e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=pequeno; idade=filhote. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_003',
  $user$Oi, quero racao para pinscher adulto$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar pinscher como porte pequeno e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=pequeno; idade=adulto. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_004',
  $user$Oi, quero racao para yorkshire filhote da Formula Natural$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar yorkshire como porte pequeno e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=pequeno; idade=filhote. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_005',
  $user$Oi, quero racao para lhasa$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar lhasa como porte pequeno e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=pequeno; idade=pendente. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_006',
  $user$Oi, quero racao para spitz filhote$user$,
  $reply$Perfeito, [NOME_DO_CLIENTE]. Vou usar os dados do cadastro e consultar o estoque real.
Vou considerar spitz como porte pequeno e categoria filhote.

Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Telefone ja cadastrado; nome do tutor conhecido; usar historico sem repetir pergunta.. Guardiao: oferecer_produtos. Estado esperado: cliente conhecido; intent=produto; especie=cachorro; porte=pequeno; idade=filhote. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_007',
  $user$Oi, quero racao para beagle adulto da Premier$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar beagle como porte medio e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=medio; idade=adulto. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_008',
  $user$Oi, quero racao para gato filhote$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Depois vou consultar somente produtos de gato no banco.$reply$,
  $notes$Produto: triagem de gato. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=gato; porte=nao aplicavel; idade=filhote. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'gato', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_009',
  $user$Oi, quero racao para border collie$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar border collie como porte medio e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=medio; idade=pendente. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_010',
  $user$Oi, quero racao para golden filhote da Formula Natural$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar golden como porte grande e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=grande; idade=filhote. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_011',
  $user$Oi, quero racao para labrador adulto$user$,
  $reply$Perfeito, [NOME_DO_CLIENTE]. Vou usar os dados do cadastro e consultar o estoque real.
Vou considerar labrador como porte grande e categoria adulto.

Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Telefone ja cadastrado; nome do tutor conhecido; usar historico sem repetir pergunta.. Guardiao: oferecer_produtos. Estado esperado: cliente conhecido; intent=produto; especie=cachorro; porte=grande; idade=adulto. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_012',
  $user$Oi, quero racao para rottweiler filhote$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar rottweiler como porte grande e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=grande; idade=filhote. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_013',
  $user$Oi, quero racao para shih tzu da Premier$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar shih tzu como porte pequeno e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=pequeno; idade=pendente. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_014',
  $user$Oi, quero racao para poodle filhote$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar poodle como porte pequeno e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=pequeno; idade=filhote. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_015',
  $user$Oi, quero racao para gato adulto$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Depois vou consultar somente produtos de gato no banco.$reply$,
  $notes$Produto: triagem de gato. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=gato; porte=nao aplicavel; idade=adulto. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'gato', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_016',
  $user$Oi, quero racao para yorkshire filhote da Formula Natural$user$,
  $reply$Perfeito, [NOME_DO_CLIENTE]. Vou usar os dados do cadastro e consultar o estoque real.
Vou considerar yorkshire como porte pequeno e categoria filhote.

Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Telefone ja cadastrado; nome do tutor conhecido; usar historico sem repetir pergunta.. Guardiao: oferecer_produtos. Estado esperado: cliente conhecido; intent=produto; especie=cachorro; porte=pequeno; idade=filhote. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_017',
  $user$Oi, quero racao para lhasa$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar lhasa como porte pequeno e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=pequeno; idade=pendente. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_018',
  $user$Oi, quero racao para spitz filhote$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar spitz como porte pequeno e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=pequeno; idade=filhote. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_019',
  $user$Oi, quero racao para beagle adulto da Premier$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar beagle como porte medio e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=medio; idade=adulto. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_020',
  $user$Oi, quero racao para cocker filhote$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar cocker como porte medio e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=medio; idade=filhote. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'coleta',
  'curto',
  false,
  false,
  true,
  'petbot_kb_021',
  $user$Oi, quero racao para border collie$user$,
  $reply$Perfeito, [NOME_DO_CLIENTE]. Vou usar os dados do cadastro e consultar o estoque real.
Vou considerar border collie como porte medio. Ele e adulto ou filhote?$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Telefone ja cadastrado; nome do tutor conhecido; usar historico sem repetir pergunta.. Guardiao: pedir_categoria_pet. Estado esperado: cliente conhecido; intent=produto; especie=cachorro; porte=medio; idade=pendente. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_categoria_pet']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_022',
  $user$Oi, quero racao para gato adulto castrado da Formula Natural$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Depois vou consultar somente produtos de gato no banco.$reply$,
  $notes$Produto: triagem de gato. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=gato; porte=nao aplicavel; idade=adulto castrado. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'gato', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_023',
  $user$Oi, quero racao para labrador adulto$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar labrador como porte grande e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=grande; idade=adulto. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_024',
  $user$Oi, quero racao para rottweiler filhote$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar rottweiler como porte grande e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=grande; idade=filhote. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_025',
  $user$Oi, quero racao para shih tzu da Premier$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar shih tzu como porte pequeno e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=pequeno; idade=pendente. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_026',
  $user$Oi, quero racao para poodle filhote$user$,
  $reply$Perfeito, [NOME_DO_CLIENTE]. Vou usar os dados do cadastro e consultar o estoque real.
Vou considerar poodle como porte pequeno e categoria filhote.

Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Telefone ja cadastrado; nome do tutor conhecido; usar historico sem repetir pergunta.. Guardiao: oferecer_produtos. Estado esperado: cliente conhecido; intent=produto; especie=cachorro; porte=pequeno; idade=filhote. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_027',
  $user$Oi, quero racao para pinscher adulto$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar pinscher como porte pequeno e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=pequeno; idade=adulto. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_028',
  $user$Oi, quero racao para yorkshire filhote da Formula Natural$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar yorkshire como porte pequeno e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=pequeno; idade=filhote. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_029',
  $user$Oi, quero racao para gato filhote$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Depois vou consultar somente produtos de gato no banco.$reply$,
  $notes$Produto: triagem de gato. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=gato; porte=nao aplicavel; idade=filhote. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'gato', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_030',
  $user$Oi, quero racao para spitz filhote$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar spitz como porte pequeno e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=pequeno; idade=filhote. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_031',
  $user$Oi, quero racao para beagle adulto da Premier$user$,
  $reply$Perfeito, [NOME_DO_CLIENTE]. Vou usar os dados do cadastro e consultar o estoque real.
Vou considerar beagle como porte medio e categoria adulto.

Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Telefone ja cadastrado; nome do tutor conhecido; usar historico sem repetir pergunta.. Guardiao: oferecer_produtos. Estado esperado: cliente conhecido; intent=produto; especie=cachorro; porte=medio; idade=adulto. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_032',
  $user$Oi, quero racao para cocker filhote$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar cocker como porte medio e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=medio; idade=filhote. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_033',
  $user$Oi, quero racao para border collie$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar border collie como porte medio e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=medio; idade=pendente. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_034',
  $user$Oi, quero racao para golden filhote da Formula Natural$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar golden como porte grande e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=grande; idade=filhote. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_035',
  $user$Oi, quero racao para labrador adulto$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar labrador como porte grande e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=grande; idade=adulto. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_036',
  $user$Oi, quero racao para gato adulto$user$,
  $reply$Perfeito, [NOME_DO_CLIENTE]. Vou usar os dados do cadastro e consultar o estoque real.
Vou filtrar por gato adulto.

Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: triagem de gato. Contexto inicial: Telefone ja cadastrado; nome do tutor conhecido; usar historico sem repetir pergunta.. Guardiao: oferecer_produtos. Estado esperado: cliente conhecido; intent=produto; especie=gato; porte=nao aplicavel; idade=adulto. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'gato', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_037',
  $user$Oi, quero racao para shih tzu da Premier$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar shih tzu como porte pequeno e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=pequeno; idade=pendente. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_038',
  $user$Oi, quero racao para poodle filhote$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar poodle como porte pequeno e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=pequeno; idade=filhote. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_039',
  $user$Oi, quero racao para pinscher adulto$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar pinscher como porte pequeno e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=pequeno; idade=adulto. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_040',
  $user$Oi, quero racao para yorkshire filhote da Formula Natural$user$,
  $reply$Oi! Claro. Posso saber seu nome, por favor?

Vou considerar yorkshire como porte pequeno e consultar o banco antes de oferecer.$reply$,
  $notes$Produto: triagem com raca implicita. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: cliente_nome pendente; intent=produto; especie=cachorro; porte=pequeno; idade=filhote. Bloqueios: nenhum. $notes$,
  array['produto', 'triagem', 'raca_contexto', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'sem_estoque',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_041',
  $user$Tem Premier para shih tzu adulto?$user$,
  $reply$Nao encontrei Premier disponivel agora, mas achei alternativas com estoque:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: marca sem estoque com alternativa. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Gabriel; pet=cachorro/shih tzu/pequeno/adulto; product_options com product_id, preco e estoque. Bloqueios: marca_sem_estoque. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'marca_sem_estoque', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_042',
  $user$Ana, e para poodle adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Ana; pet=cachorro/poodle/pequeno/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_043',
  $user$Carlos, e para pinscher adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Carlos; pet=cachorro/pinscher/pequeno/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_044',
  $user$Marina, e para yorkshire adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Marina; pet=cachorro/yorkshire/pequeno/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_045',
  $user$Joao, e para lhasa adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Joao; pet=cachorro/lhasa/pequeno/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_046',
  $user$Lara, e para spitz adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Lara; pet=cachorro/spitz/pequeno/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'sem_estoque',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_047',
  $user$Tem Premier para beagle adulto?$user$,
  $reply$Nao encontrei Premier disponivel agora, mas achei alternativas com estoque:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: marca sem estoque com alternativa. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Paula; pet=cachorro/beagle/medio/adulto; product_options com product_id, preco e estoque. Bloqueios: marca_sem_estoque. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'marca_sem_estoque', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_048',
  $user$Bruno, e para cocker adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Bruno; pet=cachorro/cocker/medio/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_049',
  $user$Fernanda, e para border collie adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Fernanda; pet=cachorro/border collie/medio/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_050',
  $user$Diego, e para golden adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Diego; pet=cachorro/golden/grande/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_051',
  $user$Rafael, e para labrador adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Rafael; pet=cachorro/labrador/grande/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_052',
  $user$Bianca, e para rottweiler adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Bianca; pet=cachorro/rottweiler/grande/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'sem_estoque',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_053',
  $user$Tem Premier para shih tzu adulto?$user$,
  $reply$Nao encontrei Premier disponivel agora, mas achei alternativas com estoque:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: marca sem estoque com alternativa. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Rodrigo; pet=cachorro/shih tzu/pequeno/adulto; product_options com product_id, preco e estoque. Bloqueios: marca_sem_estoque. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'marca_sem_estoque', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_054',
  $user$Camila, e para poodle adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Camila; pet=cachorro/poodle/pequeno/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_055',
  $user$Igor, e para pinscher adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Igor; pet=cachorro/pinscher/pequeno/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_056',
  $user$Simone, e para yorkshire adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Simone; pet=cachorro/yorkshire/pequeno/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_057',
  $user$Thiago, e para lhasa adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Thiago; pet=cachorro/lhasa/pequeno/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_058',
  $user$Juliana, e para spitz adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Juliana; pet=cachorro/spitz/pequeno/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'sem_estoque',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_059',
  $user$Tem Premier para beagle adulto?$user$,
  $reply$Nao encontrei Premier disponivel agora, mas achei alternativas com estoque:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: marca sem estoque com alternativa. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Roberto; pet=cachorro/beagle/medio/adulto; product_options com product_id, preco e estoque. Bloqueios: marca_sem_estoque. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'marca_sem_estoque', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_060',
  $user$Leticia, e para cocker adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Leticia; pet=cachorro/cocker/medio/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_061',
  $user$Gabriel, e para border collie adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Gabriel; pet=cachorro/border collie/medio/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_062',
  $user$Ana, e para golden adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Ana; pet=cachorro/golden/grande/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_063',
  $user$Carlos, e para labrador adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Carlos; pet=cachorro/labrador/grande/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_064',
  $user$Marina, e para rottweiler adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Marina; pet=cachorro/rottweiler/grande/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'sem_estoque',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_065',
  $user$Tem Premier para shih tzu adulto?$user$,
  $reply$Nao encontrei Premier disponivel agora, mas achei alternativas com estoque:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: marca sem estoque com alternativa. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Joao; pet=cachorro/shih tzu/pequeno/adulto; product_options com product_id, preco e estoque. Bloqueios: marca_sem_estoque. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'marca_sem_estoque', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_066',
  $user$Lara, e para poodle adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Lara; pet=cachorro/poodle/pequeno/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_067',
  $user$Paula, e para pinscher adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Paula; pet=cachorro/pinscher/pequeno/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_068',
  $user$Bruno, e para yorkshire adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Bruno; pet=cachorro/yorkshire/pequeno/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_069',
  $user$Fernanda, e para lhasa adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Fernanda; pet=cachorro/lhasa/pequeno/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_070',
  $user$Diego, e para spitz adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Diego; pet=cachorro/spitz/pequeno/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'sem_estoque',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_071',
  $user$Tem Premier para beagle adulto?$user$,
  $reply$Nao encontrei Premier disponivel agora, mas achei alternativas com estoque:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: marca sem estoque com alternativa. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Rafael; pet=cachorro/beagle/medio/adulto; product_options com product_id, preco e estoque. Bloqueios: marca_sem_estoque. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'marca_sem_estoque', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_072',
  $user$Bianca, e para cocker adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Bianca; pet=cachorro/cocker/medio/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_073',
  $user$Rodrigo, e para border collie adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Rodrigo; pet=cachorro/border collie/medio/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_074',
  $user$Camila, e para golden adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Camila; pet=cachorro/golden/grande/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_075',
  $user$Igor, e para labrador adulto$user$,
  $reply$Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Produto: oferta real do banco. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: cliente=Igor; pet=cachorro/labrador/grande/adulto; product_options com product_id, preco e estoque. Bloqueios: nenhum. Produto, preco e estoque precisam vir do banco. Nunca dizer que tem marca pedida sem product_id ativo.$notes$,
  array['produto', 'oferta', 'estoque_real', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_076',
  $user$pode ser 2 sacos da Premier$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Thor; selected_product.product_id preenchido; quantidade=2; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_077',
  $user$pode ser Royal Canin$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Mel; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_078',
  $user$pode ser Golden$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Nina; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_079',
  $user$pode ser Formula Natural$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Bob; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_080',
  $user$pode ser Special Dog$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Luna; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_081',
  $user$pode ser 2 sacos da Whiskas$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Rex; selected_product.product_id preenchido; quantidade=2; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_082',
  $user$pode ser Premier$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Toby; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_083',
  $user$pode ser Royal Canin$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Mia; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_084',
  $user$pode ser Golden$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Apollo; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_085',
  $user$pode ser Formula Natural$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Cookie; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_086',
  $user$pode ser 2 sacos da Special Dog$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Fred; selected_product.product_id preenchido; quantidade=2; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_087',
  $user$pode ser Whiskas$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Pipoca; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_088',
  $user$pode ser Premier$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Thor; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_089',
  $user$pode ser Royal Canin$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Mel; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_090',
  $user$pode ser Golden$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Nina; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_091',
  $user$pode ser 2 sacos da Formula Natural$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Bob; selected_product.product_id preenchido; quantidade=2; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_092',
  $user$pode ser Special Dog$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Luna; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_093',
  $user$pode ser Whiskas$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Rex; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_094',
  $user$pode ser Premier$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Toby; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_095',
  $user$pode ser Royal Canin$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Mia; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_096',
  $user$pode ser 2 sacos da Golden$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Apollo; selected_product.product_id preenchido; quantidade=2; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_097',
  $user$pode ser Formula Natural$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Cookie; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_098',
  $user$pode ser Special Dog$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Fred; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_099',
  $user$pode ser Whiskas$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Pipoca; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_100',
  $user$pode ser Premier$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Thor; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_101',
  $user$pode ser 2 sacos da Royal Canin$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Mel; selected_product.product_id preenchido; quantidade=2; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_102',
  $user$pode ser Golden$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Nina; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_103',
  $user$pode ser Formula Natural$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Bob; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_104',
  $user$pode ser Special Dog$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Luna; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'upsell',
  'curto',
  true,
  true,
  true,
  'petbot_kb_105',
  $user$pode ser Whiskas$user$,
  $reply$A [PRODUTO_ESCOLHIDO_DO_BANCO] fica R$ [VALOR_DO_BANCO].

Posso incluir [UPSELL_RELACIONADO] por R$ [VALOR_UPSELL_DO_BANCO]? Quer adicionar?$reply$,
  $notes$Produto: escolha natural e upsell unico. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_upsell. Estado esperado: pet=Rex; selected_product.product_id preenchido; quantidade=1; upsell.offered=true. Bloqueios: nenhum. Se houver quantidade, guardar quantidade antes de recalcular o total. Oferecer somente um upsell.$notes$,
  array['produto', 'escolha', 'upsell_unico', 'quantidade_1', 'oferecer_upsell']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_106',
  $user$pode colocar$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: [UPSELL_RELACIONADO]
• Total parcial: R$ [PRODUTO + UPSELL]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente aceitou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=true; total inclui extra. Bloqueios: nenhum. Somar upsell no total parcial.$notes$,
  array['upsell', 'aceito', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_107',
  $user$n$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: nao adicionado
• Total parcial: R$ [PRODUTO]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente recusou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=false; total sem extra. Bloqueios: nenhum. Nao insistir no upsell recusado.$notes$,
  array['upsell', 'recusado', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_108',
  $user$deixa$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: nao adicionado
• Total parcial: R$ [PRODUTO]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente recusou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=false; total sem extra. Bloqueios: nenhum. Nao insistir no upsell recusado.$notes$,
  array['upsell', 'recusado', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_109',
  $user$pode colocar$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: [UPSELL_RELACIONADO]
• Total parcial: R$ [PRODUTO + UPSELL]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente aceitou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=true; total inclui extra. Bloqueios: nenhum. Somar upsell no total parcial.$notes$,
  array['upsell', 'aceito', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_110',
  $user$nao quero$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: nao adicionado
• Total parcial: R$ [PRODUTO]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente recusou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=false; total sem extra. Bloqueios: nenhum. Nao insistir no upsell recusado.$notes$,
  array['upsell', 'recusado', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_111',
  $user$nao$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: nao adicionado
• Total parcial: R$ [PRODUTO]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente recusou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=false; total sem extra. Bloqueios: nenhum. Nao insistir no upsell recusado.$notes$,
  array['upsell', 'recusado', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_112',
  $user$pode colocar$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: [UPSELL_RELACIONADO]
• Total parcial: R$ [PRODUTO + UPSELL]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente aceitou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=true; total inclui extra. Bloqueios: nenhum. Somar upsell no total parcial.$notes$,
  array['upsell', 'aceito', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_113',
  $user$deixa$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: nao adicionado
• Total parcial: R$ [PRODUTO]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente recusou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=false; total sem extra. Bloqueios: nenhum. Nao insistir no upsell recusado.$notes$,
  array['upsell', 'recusado', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_114',
  $user$sem extra$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: nao adicionado
• Total parcial: R$ [PRODUTO]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente recusou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=false; total sem extra. Bloqueios: nenhum. Nao insistir no upsell recusado.$notes$,
  array['upsell', 'recusado', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_115',
  $user$pode colocar$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: [UPSELL_RELACIONADO]
• Total parcial: R$ [PRODUTO + UPSELL]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente aceitou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=true; total inclui extra. Bloqueios: nenhum. Somar upsell no total parcial.$notes$,
  array['upsell', 'aceito', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_116',
  $user$nao$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: nao adicionado
• Total parcial: R$ [PRODUTO]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente recusou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=false; total sem extra. Bloqueios: nenhum. Nao insistir no upsell recusado.$notes$,
  array['upsell', 'recusado', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_117',
  $user$n$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: nao adicionado
• Total parcial: R$ [PRODUTO]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente recusou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=false; total sem extra. Bloqueios: nenhum. Nao insistir no upsell recusado.$notes$,
  array['upsell', 'recusado', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_118',
  $user$pode colocar$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: [UPSELL_RELACIONADO]
• Total parcial: R$ [PRODUTO + UPSELL]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente aceitou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=true; total inclui extra. Bloqueios: nenhum. Somar upsell no total parcial.$notes$,
  array['upsell', 'aceito', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_119',
  $user$sem extra$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: nao adicionado
• Total parcial: R$ [PRODUTO]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente recusou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=false; total sem extra. Bloqueios: nenhum. Nao insistir no upsell recusado.$notes$,
  array['upsell', 'recusado', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_120',
  $user$nao quero$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: nao adicionado
• Total parcial: R$ [PRODUTO]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente recusou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=false; total sem extra. Bloqueios: nenhum. Nao insistir no upsell recusado.$notes$,
  array['upsell', 'recusado', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_121',
  $user$pode colocar$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: [UPSELL_RELACIONADO]
• Total parcial: R$ [PRODUTO + UPSELL]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente aceitou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=true; total inclui extra. Bloqueios: nenhum. Somar upsell no total parcial.$notes$,
  array['upsell', 'aceito', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_122',
  $user$n$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: nao adicionado
• Total parcial: R$ [PRODUTO]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente recusou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=false; total sem extra. Bloqueios: nenhum. Nao insistir no upsell recusado.$notes$,
  array['upsell', 'recusado', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_123',
  $user$deixa$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: nao adicionado
• Total parcial: R$ [PRODUTO]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente recusou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=false; total sem extra. Bloqueios: nenhum. Nao insistir no upsell recusado.$notes$,
  array['upsell', 'recusado', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_124',
  $user$pode colocar$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: [UPSELL_RELACIONADO]
• Total parcial: R$ [PRODUTO + UPSELL]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente aceitou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=true; total inclui extra. Bloqueios: nenhum. Somar upsell no total parcial.$notes$,
  array['upsell', 'aceito', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_125',
  $user$nao quero$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: nao adicionado
• Total parcial: R$ [PRODUTO]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente recusou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=false; total sem extra. Bloqueios: nenhum. Nao insistir no upsell recusado.$notes$,
  array['upsell', 'recusado', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_126',
  $user$nao$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: nao adicionado
• Total parcial: R$ [PRODUTO]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente recusou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=false; total sem extra. Bloqueios: nenhum. Nao insistir no upsell recusado.$notes$,
  array['upsell', 'recusado', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_127',
  $user$pode colocar$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: [UPSELL_RELACIONADO]
• Total parcial: R$ [PRODUTO + UPSELL]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente aceitou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=true; total inclui extra. Bloqueios: nenhum. Somar upsell no total parcial.$notes$,
  array['upsell', 'aceito', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_128',
  $user$deixa$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: nao adicionado
• Total parcial: R$ [PRODUTO]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente recusou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=false; total sem extra. Bloqueios: nenhum. Nao insistir no upsell recusado.$notes$,
  array['upsell', 'recusado', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_129',
  $user$sem extra$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: nao adicionado
• Total parcial: R$ [PRODUTO]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente recusou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=false; total sem extra. Bloqueios: nenhum. Nao insistir no upsell recusado.$notes$,
  array['upsell', 'recusado', 'resumo_parcial', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'resumo_parcial',
  'curto',
  true,
  true,
  true,
  'petbot_kb_130',
  $user$pode colocar$user$,
  $reply$**Pedido em andamento:**
• Cliente: [NOME]
• Pet: [PET] / [ESPECIE] [PORTE_OU_CATEGORIA]
• Produto/servico: [PRODUTO_COM_ESTOQUE]
• Extra: [UPSELL_RELACIONADO]
• Total parcial: R$ [PRODUTO + UPSELL]
• Pagamento: aguardando
• Entrega/retirada: aguardando

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Upsell: cliente aceitou. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: upsell.accepted=true; total inclui extra. Bloqueios: nenhum. Somar upsell no total parcial.$notes$,
  array['upsell', 'aceito', 'resumo_parcial', 'pedir_pagamento']
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
  'petbot_kb_131',
  $user$pix, entrega aqui pra mim$user$,
  $reply$Perfeito. A taxa de entrega e R$ [TAXA_DE_ENTREGA_DO_BANCO].
Me passa rua, numero, bairro e ponto de referencia.$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: payment=pix; fulfillment=delivery pendente endereco. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'pix', 'entrega', 'pedir_endereco']
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
  'petbot_kb_132',
  $user$cartao$user$,
  $reply$Perfeito. Sera entrega ou retirada na loja?$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_entrega_retirada. Estado esperado: payment=cartao; fulfillment=pendente. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'cartao', 'retirada_pendente', 'pedir_entrega_retirada']
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
  'petbot_kb_133',
  $user$dinheiro$user$,
  $reply$Precisa de troco para quanto?$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_troco. Estado esperado: payment=dinheiro; fulfillment=delivery pendente endereco. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'dinheiro', 'entrega', 'pedir_troco']
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
  'petbot_kb_134',
  $user$pix$user$,
  $reply$Perfeito. Sera entrega ou retirada na loja?$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_entrega_retirada. Estado esperado: payment=pix; fulfillment=pendente. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'pix', 'retirada_pendente', 'pedir_entrega_retirada']
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
  'petbot_kb_135',
  $user$cartao, entrega aqui pra mim$user$,
  $reply$Perfeito. A taxa de entrega e R$ [TAXA_DE_ENTREGA_DO_BANCO].
Me passa rua, numero, bairro e ponto de referencia.$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: payment=cartao; fulfillment=delivery pendente endereco. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'cartao', 'entrega', 'pedir_endereco']
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
  'petbot_kb_136',
  $user$dinheiro$user$,
  $reply$Precisa de troco para quanto?$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_troco. Estado esperado: payment=dinheiro; fulfillment=pendente. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'dinheiro', 'retirada_pendente', 'pedir_troco']
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
  'petbot_kb_137',
  $user$pix, entrega aqui pra mim$user$,
  $reply$Perfeito. A taxa de entrega e R$ [TAXA_DE_ENTREGA_DO_BANCO].
Me passa rua, numero, bairro e ponto de referencia.$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: payment=pix; fulfillment=delivery pendente endereco. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'pix', 'entrega', 'pedir_endereco']
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
  'petbot_kb_138',
  $user$cartao$user$,
  $reply$Perfeito. Sera entrega ou retirada na loja?$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_entrega_retirada. Estado esperado: payment=cartao; fulfillment=pendente. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'cartao', 'retirada_pendente', 'pedir_entrega_retirada']
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
  'petbot_kb_139',
  $user$dinheiro$user$,
  $reply$Precisa de troco para quanto?$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_troco. Estado esperado: payment=dinheiro; fulfillment=delivery pendente endereco. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'dinheiro', 'entrega', 'pedir_troco']
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
  'petbot_kb_140',
  $user$pix$user$,
  $reply$Perfeito. Sera entrega ou retirada na loja?$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_entrega_retirada. Estado esperado: payment=pix; fulfillment=pendente. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'pix', 'retirada_pendente', 'pedir_entrega_retirada']
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
  'petbot_kb_141',
  $user$cartao, entrega aqui pra mim$user$,
  $reply$Perfeito. A taxa de entrega e R$ [TAXA_DE_ENTREGA_DO_BANCO].
Me passa rua, numero, bairro e ponto de referencia.$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: payment=cartao; fulfillment=delivery pendente endereco. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'cartao', 'entrega', 'pedir_endereco']
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
  'petbot_kb_142',
  $user$dinheiro$user$,
  $reply$Precisa de troco para quanto?$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_troco. Estado esperado: payment=dinheiro; fulfillment=pendente. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'dinheiro', 'retirada_pendente', 'pedir_troco']
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
  'petbot_kb_143',
  $user$pix, entrega aqui pra mim$user$,
  $reply$Perfeito. A taxa de entrega e R$ [TAXA_DE_ENTREGA_DO_BANCO].
Me passa rua, numero, bairro e ponto de referencia.$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: payment=pix; fulfillment=delivery pendente endereco. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'pix', 'entrega', 'pedir_endereco']
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
  'petbot_kb_144',
  $user$cartao$user$,
  $reply$Perfeito. Sera entrega ou retirada na loja?$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_entrega_retirada. Estado esperado: payment=cartao; fulfillment=pendente. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'cartao', 'retirada_pendente', 'pedir_entrega_retirada']
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
  'petbot_kb_145',
  $user$dinheiro$user$,
  $reply$Precisa de troco para quanto?$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_troco. Estado esperado: payment=dinheiro; fulfillment=delivery pendente endereco. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'dinheiro', 'entrega', 'pedir_troco']
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
  'petbot_kb_146',
  $user$pix$user$,
  $reply$Perfeito. Sera entrega ou retirada na loja?$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_entrega_retirada. Estado esperado: payment=pix; fulfillment=pendente. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'pix', 'retirada_pendente', 'pedir_entrega_retirada']
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
  'petbot_kb_147',
  $user$cartao, entrega aqui pra mim$user$,
  $reply$Perfeito. A taxa de entrega e R$ [TAXA_DE_ENTREGA_DO_BANCO].
Me passa rua, numero, bairro e ponto de referencia.$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: payment=cartao; fulfillment=delivery pendente endereco. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'cartao', 'entrega', 'pedir_endereco']
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
  'petbot_kb_148',
  $user$dinheiro$user$,
  $reply$Precisa de troco para quanto?$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_troco. Estado esperado: payment=dinheiro; fulfillment=pendente. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'dinheiro', 'retirada_pendente', 'pedir_troco']
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
  'petbot_kb_149',
  $user$pix, entrega aqui pra mim$user$,
  $reply$Perfeito. A taxa de entrega e R$ [TAXA_DE_ENTREGA_DO_BANCO].
Me passa rua, numero, bairro e ponto de referencia.$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: payment=pix; fulfillment=delivery pendente endereco. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'pix', 'entrega', 'pedir_endereco']
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
  'petbot_kb_150',
  $user$cartao$user$,
  $reply$Perfeito. Sera entrega ou retirada na loja?$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_entrega_retirada. Estado esperado: payment=cartao; fulfillment=pendente. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'cartao', 'retirada_pendente', 'pedir_entrega_retirada']
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
  'petbot_kb_151',
  $user$dinheiro$user$,
  $reply$Precisa de troco para quanto?$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_troco. Estado esperado: payment=dinheiro; fulfillment=delivery pendente endereco. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'dinheiro', 'entrega', 'pedir_troco']
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
  'petbot_kb_152',
  $user$pix$user$,
  $reply$Perfeito. Sera entrega ou retirada na loja?$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_entrega_retirada. Estado esperado: payment=pix; fulfillment=pendente. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'pix', 'retirada_pendente', 'pedir_entrega_retirada']
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
  'petbot_kb_153',
  $user$cartao, entrega aqui pra mim$user$,
  $reply$Perfeito. A taxa de entrega e R$ [TAXA_DE_ENTREGA_DO_BANCO].
Me passa rua, numero, bairro e ponto de referencia.$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: payment=cartao; fulfillment=delivery pendente endereco. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'cartao', 'entrega', 'pedir_endereco']
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
  'petbot_kb_154',
  $user$dinheiro$user$,
  $reply$Precisa de troco para quanto?$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_troco. Estado esperado: payment=dinheiro; fulfillment=pendente. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'dinheiro', 'retirada_pendente', 'pedir_troco']
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
  'petbot_kb_155',
  $user$pix, entrega aqui pra mim$user$,
  $reply$Perfeito. A taxa de entrega e R$ [TAXA_DE_ENTREGA_DO_BANCO].
Me passa rua, numero, bairro e ponto de referencia.$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: payment=pix; fulfillment=delivery pendente endereco. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'pix', 'entrega', 'pedir_endereco']
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
  'petbot_kb_156',
  $user$cartao$user$,
  $reply$Perfeito. Sera entrega ou retirada na loja?$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_entrega_retirada. Estado esperado: payment=cartao; fulfillment=pendente. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'cartao', 'retirada_pendente', 'pedir_entrega_retirada']
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
  'petbot_kb_157',
  $user$dinheiro$user$,
  $reply$Precisa de troco para quanto?$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_troco. Estado esperado: payment=dinheiro; fulfillment=delivery pendente endereco. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'dinheiro', 'entrega', 'pedir_troco']
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
  'petbot_kb_158',
  $user$pix$user$,
  $reply$Perfeito. Sera entrega ou retirada na loja?$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_entrega_retirada. Estado esperado: payment=pix; fulfillment=pendente. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'pix', 'retirada_pendente', 'pedir_entrega_retirada']
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
  'petbot_kb_159',
  $user$cartao, entrega aqui pra mim$user$,
  $reply$Perfeito. A taxa de entrega e R$ [TAXA_DE_ENTREGA_DO_BANCO].
Me passa rua, numero, bairro e ponto de referencia.$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: payment=cartao; fulfillment=delivery pendente endereco. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'cartao', 'entrega', 'pedir_endereco']
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
  'petbot_kb_160',
  $user$dinheiro$user$,
  $reply$Precisa de troco para quanto?$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_troco. Estado esperado: payment=dinheiro; fulfillment=pendente. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'dinheiro', 'retirada_pendente', 'pedir_troco']
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
  'petbot_kb_161',
  $user$pix, entrega aqui pra mim$user$,
  $reply$Perfeito. A taxa de entrega e R$ [TAXA_DE_ENTREGA_DO_BANCO].
Me passa rua, numero, bairro e ponto de referencia.$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: payment=pix; fulfillment=delivery pendente endereco. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'pix', 'entrega', 'pedir_endereco']
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
  'petbot_kb_162',
  $user$cartao$user$,
  $reply$Perfeito. Sera entrega ou retirada na loja?$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_entrega_retirada. Estado esperado: payment=cartao; fulfillment=pendente. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'cartao', 'retirada_pendente', 'pedir_entrega_retirada']
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
  'petbot_kb_163',
  $user$dinheiro$user$,
  $reply$Precisa de troco para quanto?$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_troco. Estado esperado: payment=dinheiro; fulfillment=delivery pendente endereco. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'dinheiro', 'entrega', 'pedir_troco']
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
  'petbot_kb_164',
  $user$pix$user$,
  $reply$Perfeito. Sera entrega ou retirada na loja?$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_entrega_retirada. Estado esperado: payment=pix; fulfillment=pendente. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'pix', 'retirada_pendente', 'pedir_entrega_retirada']
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
  'petbot_kb_165',
  $user$cartao, entrega aqui pra mim$user$,
  $reply$Perfeito. A taxa de entrega e R$ [TAXA_DE_ENTREGA_DO_BANCO].
Me passa rua, numero, bairro e ponto de referencia.$reply$,
  $notes$Checkout: pagamento e entrega. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: payment=cartao; fulfillment=delivery pendente endereco. Bloqueios: nenhum. Pagamento pode ser guardado cedo, mas resumo final so depois de entrega/retirada e endereco completo se for entrega.$notes$,
  array['checkout', 'cartao', 'entrega', 'pedir_endereco']
),
(
  null,
  'petshop',
  'entrega',
  'entrega',
  'curto',
  true,
  true,
  true,
  'petbot_kb_166',
  $user$Rua A, 123$user$,
  $reply$Falta bairro e ponto de referencia para eu completar a entrega.
Me passa, por favor?$reply$,
  $notes$Entrega: endereco incompleto. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: endereco incompleto: falta bairro e ponto de referencia. Bloqueios: endereco_incompleto. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_incompleto', 'taxa_entrega', 'pedir_endereco']
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
  'petbot_kb_167',
  $user$Av. Bernardo Mascarenhas, 1327 ap 303b$user$,
  $reply$Falta bairro e ponto de referencia para eu completar a entrega.
Me passa, por favor?$reply$,
  $notes$Entrega: endereco incompleto. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: endereco incompleto: falta bairro e ponto de referencia. Bloqueios: endereco_incompleto. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_incompleto', 'taxa_entrega', 'pedir_endereco']
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
  'petbot_kb_168',
  $user$Rua B, 200, Centro, perto da farmacia$user$,
  $reply$**Resumo do pedido:**
• Cliente: [NOME]
• [ITENS_COMPLETOS]
• Taxa de entrega: R$ [TAXA_DE_ENTREGA_DO_BANCO]
• Total: R$ [TOTAL_COM_TAXA]
• Pagamento: dinheiro
• Entrega: Rua B, 200, Centro, perto da farmacia

Confirma para separacao?$reply$,
  $notes$Entrega: endereco completo e resumo final. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: resumo_final. Estado esperado: endereco completo; finalSummaryShown=true; total inclui taxa. Bloqueios: nenhum. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_completo', 'taxa_entrega', 'resumo_final']
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
  'petbot_kb_169',
  $user$Avenida Brasil 45 bairro Sao Pedro referencia mercado$user$,
  $reply$**Resumo do pedido:**
• Cliente: [NOME]
• [ITENS_COMPLETOS]
• Taxa de entrega: R$ [TAXA_DE_ENTREGA_DO_BANCO]
• Total: R$ [TOTAL_COM_TAXA]
• Pagamento: pix
• Entrega: Avenida Brasil 45 bairro Sao Pedro referencia mercado

Confirma para separacao?$reply$,
  $notes$Entrega: endereco completo e resumo final. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: resumo_final. Estado esperado: endereco completo; finalSummaryShown=true; total inclui taxa. Bloqueios: nenhum. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_completo', 'taxa_entrega', 'resumo_final']
),
(
  null,
  'petshop',
  'entrega',
  'entrega',
  'curto',
  true,
  true,
  true,
  'petbot_kb_170',
  $user$Rua das Flores numero 80$user$,
  $reply$Falta bairro e ponto de referencia para eu completar a entrega.
Me passa, por favor?$reply$,
  $notes$Entrega: endereco incompleto. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: endereco incompleto: falta bairro e ponto de referencia. Bloqueios: endereco_incompleto. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_incompleto', 'taxa_entrega', 'pedir_endereco']
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
  'petbot_kb_171',
  $user$Rua A, 123$user$,
  $reply$Falta bairro e ponto de referencia para eu completar a entrega.
Me passa, por favor?$reply$,
  $notes$Entrega: endereco incompleto. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: endereco incompleto: falta bairro e ponto de referencia. Bloqueios: endereco_incompleto. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_incompleto', 'taxa_entrega', 'pedir_endereco']
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
  'petbot_kb_172',
  $user$Av. Bernardo Mascarenhas, 1327 ap 303b$user$,
  $reply$Falta bairro e ponto de referencia para eu completar a entrega.
Me passa, por favor?$reply$,
  $notes$Entrega: endereco incompleto. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: endereco incompleto: falta bairro e ponto de referencia. Bloqueios: endereco_incompleto. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_incompleto', 'taxa_entrega', 'pedir_endereco']
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
  'petbot_kb_173',
  $user$Rua B, 200, Centro, perto da farmacia$user$,
  $reply$**Resumo do pedido:**
• Cliente: [NOME]
• [ITENS_COMPLETOS]
• Taxa de entrega: R$ [TAXA_DE_ENTREGA_DO_BANCO]
• Total: R$ [TOTAL_COM_TAXA]
• Pagamento: cartao
• Entrega: Rua B, 200, Centro, perto da farmacia

Confirma para separacao?$reply$,
  $notes$Entrega: endereco completo e resumo final. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: resumo_final. Estado esperado: endereco completo; finalSummaryShown=true; total inclui taxa. Bloqueios: nenhum. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_completo', 'taxa_entrega', 'resumo_final']
),
(
  null,
  'petshop',
  'entrega',
  'resumo_final',
  'curto',
  true,
  true,
  true,
  'petbot_kb_174',
  $user$Avenida Brasil 45 bairro Sao Pedro referencia mercado$user$,
  $reply$**Resumo do pedido:**
• Cliente: [NOME]
• [ITENS_COMPLETOS]
• Taxa de entrega: R$ [TAXA_DE_ENTREGA_DO_BANCO]
• Total: R$ [TOTAL_COM_TAXA]
• Pagamento: dinheiro
• Entrega: Avenida Brasil 45 bairro Sao Pedro referencia mercado

Confirma para separacao?$reply$,
  $notes$Entrega: endereco completo e resumo final. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: resumo_final. Estado esperado: endereco completo; finalSummaryShown=true; total inclui taxa. Bloqueios: nenhum. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_completo', 'taxa_entrega', 'resumo_final']
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
  'petbot_kb_175',
  $user$Rua das Flores numero 80$user$,
  $reply$Falta bairro e ponto de referencia para eu completar a entrega.
Me passa, por favor?$reply$,
  $notes$Entrega: endereco incompleto. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: endereco incompleto: falta bairro e ponto de referencia. Bloqueios: endereco_incompleto. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_incompleto', 'taxa_entrega', 'pedir_endereco']
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
  'petbot_kb_176',
  $user$Rua A, 123$user$,
  $reply$Falta bairro e ponto de referencia para eu completar a entrega.
Me passa, por favor?$reply$,
  $notes$Entrega: endereco incompleto. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: endereco incompleto: falta bairro e ponto de referencia. Bloqueios: endereco_incompleto. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_incompleto', 'taxa_entrega', 'pedir_endereco']
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
  'petbot_kb_177',
  $user$Av. Bernardo Mascarenhas, 1327 ap 303b$user$,
  $reply$Falta bairro e ponto de referencia para eu completar a entrega.
Me passa, por favor?$reply$,
  $notes$Entrega: endereco incompleto. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: endereco incompleto: falta bairro e ponto de referencia. Bloqueios: endereco_incompleto. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_incompleto', 'taxa_entrega', 'pedir_endereco']
),
(
  null,
  'petshop',
  'entrega',
  'resumo_final',
  'curto',
  true,
  true,
  true,
  'petbot_kb_178',
  $user$Rua B, 200, Centro, perto da farmacia$user$,
  $reply$**Resumo do pedido:**
• Cliente: [NOME]
• [ITENS_COMPLETOS]
• Taxa de entrega: R$ [TAXA_DE_ENTREGA_DO_BANCO]
• Total: R$ [TOTAL_COM_TAXA]
• Pagamento: pix
• Entrega: Rua B, 200, Centro, perto da farmacia

Confirma para separacao?$reply$,
  $notes$Entrega: endereco completo e resumo final. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: resumo_final. Estado esperado: endereco completo; finalSummaryShown=true; total inclui taxa. Bloqueios: nenhum. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_completo', 'taxa_entrega', 'resumo_final']
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
  'petbot_kb_179',
  $user$Avenida Brasil 45 bairro Sao Pedro referencia mercado$user$,
  $reply$**Resumo do pedido:**
• Cliente: [NOME]
• [ITENS_COMPLETOS]
• Taxa de entrega: R$ [TAXA_DE_ENTREGA_DO_BANCO]
• Total: R$ [TOTAL_COM_TAXA]
• Pagamento: cartao
• Entrega: Avenida Brasil 45 bairro Sao Pedro referencia mercado

Confirma para separacao?$reply$,
  $notes$Entrega: endereco completo e resumo final. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: resumo_final. Estado esperado: endereco completo; finalSummaryShown=true; total inclui taxa. Bloqueios: nenhum. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_completo', 'taxa_entrega', 'resumo_final']
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
  'petbot_kb_180',
  $user$Rua das Flores numero 80$user$,
  $reply$Falta bairro e ponto de referencia para eu completar a entrega.
Me passa, por favor?$reply$,
  $notes$Entrega: endereco incompleto. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: endereco incompleto: falta bairro e ponto de referencia. Bloqueios: endereco_incompleto. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_incompleto', 'taxa_entrega', 'pedir_endereco']
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
  'petbot_kb_181',
  $user$Rua A, 123$user$,
  $reply$Falta bairro e ponto de referencia para eu completar a entrega.
Me passa, por favor?$reply$,
  $notes$Entrega: endereco incompleto. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: endereco incompleto: falta bairro e ponto de referencia. Bloqueios: endereco_incompleto. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_incompleto', 'taxa_entrega', 'pedir_endereco']
),
(
  null,
  'petshop',
  'entrega',
  'entrega',
  'curto',
  true,
  true,
  true,
  'petbot_kb_182',
  $user$Av. Bernardo Mascarenhas, 1327 ap 303b$user$,
  $reply$Falta bairro e ponto de referencia para eu completar a entrega.
Me passa, por favor?$reply$,
  $notes$Entrega: endereco incompleto. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: endereco incompleto: falta bairro e ponto de referencia. Bloqueios: endereco_incompleto. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_incompleto', 'taxa_entrega', 'pedir_endereco']
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
  'petbot_kb_183',
  $user$Rua B, 200, Centro, perto da farmacia$user$,
  $reply$**Resumo do pedido:**
• Cliente: [NOME]
• [ITENS_COMPLETOS]
• Taxa de entrega: R$ [TAXA_DE_ENTREGA_DO_BANCO]
• Total: R$ [TOTAL_COM_TAXA]
• Pagamento: dinheiro
• Entrega: Rua B, 200, Centro, perto da farmacia

Confirma para separacao?$reply$,
  $notes$Entrega: endereco completo e resumo final. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: resumo_final. Estado esperado: endereco completo; finalSummaryShown=true; total inclui taxa. Bloqueios: nenhum. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_completo', 'taxa_entrega', 'resumo_final']
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
  'petbot_kb_184',
  $user$Avenida Brasil 45 bairro Sao Pedro referencia mercado$user$,
  $reply$**Resumo do pedido:**
• Cliente: [NOME]
• [ITENS_COMPLETOS]
• Taxa de entrega: R$ [TAXA_DE_ENTREGA_DO_BANCO]
• Total: R$ [TOTAL_COM_TAXA]
• Pagamento: pix
• Entrega: Avenida Brasil 45 bairro Sao Pedro referencia mercado

Confirma para separacao?$reply$,
  $notes$Entrega: endereco completo e resumo final. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: resumo_final. Estado esperado: endereco completo; finalSummaryShown=true; total inclui taxa. Bloqueios: nenhum. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_completo', 'taxa_entrega', 'resumo_final']
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
  'petbot_kb_185',
  $user$Rua das Flores numero 80$user$,
  $reply$Falta bairro e ponto de referencia para eu completar a entrega.
Me passa, por favor?$reply$,
  $notes$Entrega: endereco incompleto. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: endereco incompleto: falta bairro e ponto de referencia. Bloqueios: endereco_incompleto. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_incompleto', 'taxa_entrega', 'pedir_endereco']
),
(
  null,
  'petshop',
  'entrega',
  'entrega',
  'curto',
  true,
  true,
  true,
  'petbot_kb_186',
  $user$Rua A, 123$user$,
  $reply$Falta bairro e ponto de referencia para eu completar a entrega.
Me passa, por favor?$reply$,
  $notes$Entrega: endereco incompleto. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: endereco incompleto: falta bairro e ponto de referencia. Bloqueios: endereco_incompleto. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_incompleto', 'taxa_entrega', 'pedir_endereco']
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
  'petbot_kb_187',
  $user$Av. Bernardo Mascarenhas, 1327 ap 303b$user$,
  $reply$Falta bairro e ponto de referencia para eu completar a entrega.
Me passa, por favor?$reply$,
  $notes$Entrega: endereco incompleto. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: endereco incompleto: falta bairro e ponto de referencia. Bloqueios: endereco_incompleto. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_incompleto', 'taxa_entrega', 'pedir_endereco']
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
  'petbot_kb_188',
  $user$Rua B, 200, Centro, perto da farmacia$user$,
  $reply$**Resumo do pedido:**
• Cliente: [NOME]
• [ITENS_COMPLETOS]
• Taxa de entrega: R$ [TAXA_DE_ENTREGA_DO_BANCO]
• Total: R$ [TOTAL_COM_TAXA]
• Pagamento: cartao
• Entrega: Rua B, 200, Centro, perto da farmacia

Confirma para separacao?$reply$,
  $notes$Entrega: endereco completo e resumo final. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: resumo_final. Estado esperado: endereco completo; finalSummaryShown=true; total inclui taxa. Bloqueios: nenhum. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_completo', 'taxa_entrega', 'resumo_final']
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
  'petbot_kb_189',
  $user$Avenida Brasil 45 bairro Sao Pedro referencia mercado$user$,
  $reply$**Resumo do pedido:**
• Cliente: [NOME]
• [ITENS_COMPLETOS]
• Taxa de entrega: R$ [TAXA_DE_ENTREGA_DO_BANCO]
• Total: R$ [TOTAL_COM_TAXA]
• Pagamento: dinheiro
• Entrega: Avenida Brasil 45 bairro Sao Pedro referencia mercado

Confirma para separacao?$reply$,
  $notes$Entrega: endereco completo e resumo final. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: resumo_final. Estado esperado: endereco completo; finalSummaryShown=true; total inclui taxa. Bloqueios: nenhum. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_completo', 'taxa_entrega', 'resumo_final']
),
(
  null,
  'petshop',
  'entrega',
  'entrega',
  'curto',
  true,
  true,
  true,
  'petbot_kb_190',
  $user$Rua das Flores numero 80$user$,
  $reply$Falta bairro e ponto de referencia para eu completar a entrega.
Me passa, por favor?$reply$,
  $notes$Entrega: endereco incompleto. Contexto inicial: Pagamento ja coletado; falta definir ou completar entrega.. Guardiao: pedir_endereco. Estado esperado: endereco incompleto: falta bairro e ponto de referencia. Bloqueios: endereco_incompleto. Taxa de entrega precisa aparecer explicitamente e entrar no total final.$notes$,
  array['entrega', 'endereco_incompleto', 'taxa_entrega', 'pedir_endereco']
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
  'petbot_kb_191',
  $user$0$user$,
  $reply$Obrigado pela avaliacao! Atendimento finalizado.$reply$,
  $notes$Avaliacao: nota 0-10. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: pedir_avaliacao. Estado esperado: status=closed; csat_score preenchido. Bloqueios: nenhum. Salvar CSAT de 0 a 10 no contexto/sessao.$notes$,
  array['confirmacao', 'avaliacao', 'pedir_avaliacao']
),
(
  null,
  'petshop',
  'confirmacao',
  'confirmacao',
  'curto',
  false,
  true,
  true,
  'petbot_kb_192',
  $user$sm$user$,
  $reply$Perfeito, vou registrar agora.$reply$,
  $notes$Confirmacao final curta. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: confirmar_salvar. Estado esperado: shouldSaveOrder=true; pedido so salva agora. Bloqueios: nenhum. Confirmacao curta so vale depois do resumo final exibido.$notes$,
  array['confirmacao', 'salvar', 'confirmar_salvar']
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
  'petbot_kb_193',
  $user$2$user$,
  $reply$Obrigado pela avaliacao! Atendimento finalizado.$reply$,
  $notes$Avaliacao: nota 0-10. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: pedir_avaliacao. Estado esperado: status=closed; csat_score preenchido. Bloqueios: nenhum. Salvar CSAT de 0 a 10 no contexto/sessao.$notes$,
  array['confirmacao', 'avaliacao', 'pedir_avaliacao']
),
(
  null,
  'petshop',
  'confirmacao',
  'confirmacao',
  'curto',
  false,
  true,
  true,
  'petbot_kb_194',
  $user$fecha$user$,
  $reply$Perfeito, vou registrar agora.$reply$,
  $notes$Confirmacao final curta. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: confirmar_salvar. Estado esperado: shouldSaveOrder=true; pedido so salva agora. Bloqueios: nenhum. Confirmacao curta so vale depois do resumo final exibido.$notes$,
  array['confirmacao', 'salvar', 'confirmar_salvar']
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
  'petbot_kb_195',
  $user$4$user$,
  $reply$Obrigado pela avaliacao! Atendimento finalizado.$reply$,
  $notes$Avaliacao: nota 0-10. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: pedir_avaliacao. Estado esperado: status=closed; csat_score preenchido. Bloqueios: nenhum. Salvar CSAT de 0 a 10 no contexto/sessao.$notes$,
  array['confirmacao', 'avaliacao', 'pedir_avaliacao']
),
(
  null,
  'petshop',
  'confirmacao',
  'confirmacao',
  'curto',
  false,
  true,
  true,
  'petbot_kb_196',
  $user$nao$user$,
  $reply$Tudo bem, nao vou finalizar esse pedido. Se quiser alterar algo, me diga o que prefere.$reply$,
  $notes$Resumo final recusado. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: cancelar. Estado esperado: status=cancelado; pedido nao salva. Bloqueios: confirmacao_recusada. Confirmacao curta so vale depois do resumo final exibido.$notes$,
  array['confirmacao', 'cancelar']
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
  'petbot_kb_197',
  $user$6$user$,
  $reply$Obrigado pela avaliacao! Atendimento finalizado.$reply$,
  $notes$Avaliacao: nota 0-10. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: pedir_avaliacao. Estado esperado: status=closed; csat_score preenchido. Bloqueios: nenhum. Salvar CSAT de 0 a 10 no contexto/sessao.$notes$,
  array['confirmacao', 'avaliacao', 'pedir_avaliacao']
),
(
  null,
  'petshop',
  'confirmacao',
  'confirmacao',
  'curto',
  false,
  true,
  true,
  'petbot_kb_198',
  $user$sm$user$,
  $reply$Perfeito, vou registrar agora.$reply$,
  $notes$Confirmacao final curta. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: confirmar_salvar. Estado esperado: shouldSaveOrder=true; pedido so salva agora. Bloqueios: nenhum. Confirmacao curta so vale depois do resumo final exibido.$notes$,
  array['confirmacao', 'salvar', 'confirmar_salvar']
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
  'petbot_kb_199',
  $user$8$user$,
  $reply$Obrigado pela avaliacao! Atendimento finalizado.$reply$,
  $notes$Avaliacao: nota 0-10. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: pedir_avaliacao. Estado esperado: status=closed; csat_score preenchido. Bloqueios: nenhum. Salvar CSAT de 0 a 10 no contexto/sessao.$notes$,
  array['confirmacao', 'avaliacao', 'pedir_avaliacao']
),
(
  null,
  'petshop',
  'confirmacao',
  'confirmacao',
  'curto',
  false,
  true,
  true,
  'petbot_kb_200',
  $user$fecha$user$,
  $reply$Perfeito, vou registrar agora.$reply$,
  $notes$Confirmacao final curta. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: confirmar_salvar. Estado esperado: shouldSaveOrder=true; pedido so salva agora. Bloqueios: nenhum. Confirmacao curta so vale depois do resumo final exibido.$notes$,
  array['confirmacao', 'salvar', 'confirmar_salvar']
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
  'petbot_kb_201',
  $user$10$user$,
  $reply$Obrigado pela avaliacao! Atendimento finalizado.$reply$,
  $notes$Avaliacao: nota 0-10. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: pedir_avaliacao. Estado esperado: status=closed; csat_score preenchido. Bloqueios: nenhum. Salvar CSAT de 0 a 10 no contexto/sessao.$notes$,
  array['confirmacao', 'avaliacao', 'pedir_avaliacao']
),
(
  null,
  'petshop',
  'confirmacao',
  'confirmacao',
  'curto',
  false,
  true,
  true,
  'petbot_kb_202',
  $user$ta bom$user$,
  $reply$Perfeito, vou registrar agora.$reply$,
  $notes$Confirmacao final curta. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: confirmar_salvar. Estado esperado: shouldSaveOrder=true; pedido so salva agora. Bloqueios: nenhum. Confirmacao curta so vale depois do resumo final exibido.$notes$,
  array['confirmacao', 'salvar', 'confirmar_salvar']
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
  'petbot_kb_203',
  $user$1$user$,
  $reply$Obrigado pela avaliacao! Atendimento finalizado.$reply$,
  $notes$Avaliacao: nota 0-10. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: pedir_avaliacao. Estado esperado: status=closed; csat_score preenchido. Bloqueios: nenhum. Salvar CSAT de 0 a 10 no contexto/sessao.$notes$,
  array['confirmacao', 'avaliacao', 'pedir_avaliacao']
),
(
  null,
  'petshop',
  'confirmacao',
  'confirmacao',
  'curto',
  false,
  true,
  true,
  'petbot_kb_204',
  $user$sm$user$,
  $reply$Perfeito, vou registrar agora.$reply$,
  $notes$Confirmacao final curta. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: confirmar_salvar. Estado esperado: shouldSaveOrder=true; pedido so salva agora. Bloqueios: nenhum. Confirmacao curta so vale depois do resumo final exibido.$notes$,
  array['confirmacao', 'salvar', 'confirmar_salvar']
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
  'petbot_kb_205',
  $user$3$user$,
  $reply$Obrigado pela avaliacao! Atendimento finalizado.$reply$,
  $notes$Avaliacao: nota 0-10. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: pedir_avaliacao. Estado esperado: status=closed; csat_score preenchido. Bloqueios: nenhum. Salvar CSAT de 0 a 10 no contexto/sessao.$notes$,
  array['confirmacao', 'avaliacao', 'pedir_avaliacao']
),
(
  null,
  'petshop',
  'confirmacao',
  'confirmacao',
  'curto',
  false,
  true,
  true,
  'petbot_kb_206',
  $user$nao$user$,
  $reply$Tudo bem, nao vou finalizar esse pedido. Se quiser alterar algo, me diga o que prefere.$reply$,
  $notes$Resumo final recusado. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: cancelar. Estado esperado: status=cancelado; pedido nao salva. Bloqueios: confirmacao_recusada. Confirmacao curta so vale depois do resumo final exibido.$notes$,
  array['confirmacao', 'cancelar']
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
  'petbot_kb_207',
  $user$5$user$,
  $reply$Obrigado pela avaliacao! Atendimento finalizado.$reply$,
  $notes$Avaliacao: nota 0-10. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: pedir_avaliacao. Estado esperado: status=closed; csat_score preenchido. Bloqueios: nenhum. Salvar CSAT de 0 a 10 no contexto/sessao.$notes$,
  array['confirmacao', 'avaliacao', 'pedir_avaliacao']
),
(
  null,
  'petshop',
  'confirmacao',
  'confirmacao',
  'curto',
  false,
  true,
  true,
  'petbot_kb_208',
  $user$ta bom$user$,
  $reply$Perfeito, vou registrar agora.$reply$,
  $notes$Confirmacao final curta. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: confirmar_salvar. Estado esperado: shouldSaveOrder=true; pedido so salva agora. Bloqueios: nenhum. Confirmacao curta so vale depois do resumo final exibido.$notes$,
  array['confirmacao', 'salvar', 'confirmar_salvar']
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
  'petbot_kb_209',
  $user$7$user$,
  $reply$Obrigado pela avaliacao! Atendimento finalizado.$reply$,
  $notes$Avaliacao: nota 0-10. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: pedir_avaliacao. Estado esperado: status=closed; csat_score preenchido. Bloqueios: nenhum. Salvar CSAT de 0 a 10 no contexto/sessao.$notes$,
  array['confirmacao', 'avaliacao', 'pedir_avaliacao']
),
(
  null,
  'petshop',
  'confirmacao',
  'confirmacao',
  'curto',
  false,
  true,
  true,
  'petbot_kb_210',
  $user$sm$user$,
  $reply$Perfeito, vou registrar agora.$reply$,
  $notes$Confirmacao final curta. Contexto inicial: Fluxo ja passou por dados minimos, preco, upsell, pagamento e entrega/retirada conforme aplicavel.. Guardiao: confirmar_salvar. Estado esperado: shouldSaveOrder=true; pedido so salva agora. Bloqueios: nenhum. Confirmacao curta so vale depois do resumo final exibido.$notes$,
  array['confirmacao', 'salvar', 'confirmar_salvar']
),
(
  null,
  'petshop',
  'sem_horario',
  'oferta',
  'curto',
  false,
  false,
  true,
  'petbot_kb_211',
  $user$Quero banho e tosa para meu shih tzu$user$,
  $reply$Consultei a agenda e nao achei horario disponivel agora. Quer que eu chame a equipe para ver outros horarios?$reply$,
  $notes$Banho/tosa: agenda cheia. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: sem_horario. Estado esperado: blockedReasons inclui sem_horario_real; sem horario inventado. Bloqueios: sem_horario_real. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'sem_horario', 'raca_contexto']
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
  'petbot_kb_212',
  $user$Quero banho para Mel poodle$user$,
  $reply$Consultei a agenda e tenho:
1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]
2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]
3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]

Qual horario prefere?$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: oferecer_horarios. Estado esperado: servico=banho; porte=pequeno; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'oferecer_horarios']
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
  'petbot_kb_213',
  $user$Quero banho para Nina pinscher$user$,
  $reply$Consultei a agenda e tenho:
1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]
2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]
3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]

Qual horario prefere?$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: oferecer_horarios. Estado esperado: servico=banho; porte=pequeno; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'oferecer_horarios']
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
  'petbot_kb_214',
  $user$Quero banho e tosa para Bob yorkshire$user$,
  $reply$Consultei a agenda e tenho:
1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]
2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]
3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]

Qual horario prefere?$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: oferecer_horarios. Estado esperado: servico=banho e tosa; porte=pequeno; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'oferecer_horarios']
),
(
  null,
  'petshop',
  'banho_tosa',
  'coleta',
  'curto',
  true,
  true,
  true,
  'petbot_kb_215',
  $user$Quero banho para meu lhasa$user$,
  $reply$Perfeito. Qual o nome do pet?

Vou considerar lhasa como porte pequeno para consultar a agenda certa.$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: pedir_nome_pet. Estado esperado: servico=banho; porte=pequeno; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'pedir_nome_pet']
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
  'petbot_kb_216',
  $user$Quero banho para Rex spitz$user$,
  $reply$Consultei a agenda e tenho:
1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]
2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]
3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]

Qual horario prefere?$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: oferecer_horarios. Estado esperado: servico=banho; porte=pequeno; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'oferecer_horarios']
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
  'petbot_kb_217',
  $user$Quero banho e tosa para Toby beagle$user$,
  $reply$Consultei a agenda e tenho:
1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]
2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]
3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]

Qual horario prefere?$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: oferecer_horarios. Estado esperado: servico=banho e tosa; porte=medio; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'oferecer_horarios']
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
  'petbot_kb_218',
  $user$Quero banho para Mia cocker$user$,
  $reply$Consultei a agenda e tenho:
1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]
2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]
3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]

Qual horario prefere?$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: oferecer_horarios. Estado esperado: servico=banho; porte=medio; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'oferecer_horarios']
),
(
  null,
  'petshop',
  'banho_tosa',
  'coleta',
  'curto',
  true,
  true,
  true,
  'petbot_kb_219',
  $user$Quero banho para meu border collie$user$,
  $reply$Perfeito. Qual o nome do pet?

Vou considerar border collie como porte medio para consultar a agenda certa.$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: pedir_nome_pet. Estado esperado: servico=banho; porte=medio; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'pedir_nome_pet']
),
(
  null,
  'petshop',
  'sem_horario',
  'oferta',
  'curto',
  false,
  false,
  true,
  'petbot_kb_220',
  $user$Quero banho e tosa para Cookie golden$user$,
  $reply$Consultei a agenda e nao achei horario disponivel agora. Quer que eu chame a equipe para ver outros horarios?$reply$,
  $notes$Banho/tosa: agenda cheia. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: sem_horario. Estado esperado: blockedReasons inclui sem_horario_real; sem horario inventado. Bloqueios: sem_horario_real. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'sem_horario', 'raca_contexto']
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
  'petbot_kb_221',
  $user$Quero banho para Fred labrador$user$,
  $reply$Consultei a agenda e tenho:
1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]
2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]
3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]

Qual horario prefere?$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: oferecer_horarios. Estado esperado: servico=banho; porte=grande; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'oferecer_horarios']
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
  'petbot_kb_222',
  $user$Quero banho para Pipoca rottweiler$user$,
  $reply$Consultei a agenda e tenho:
1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]
2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]
3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]

Qual horario prefere?$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: oferecer_horarios. Estado esperado: servico=banho; porte=grande; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'oferecer_horarios']
),
(
  null,
  'petshop',
  'banho_tosa',
  'coleta',
  'curto',
  true,
  true,
  true,
  'petbot_kb_223',
  $user$Quero banho e tosa para meu shih tzu$user$,
  $reply$Perfeito. Qual o nome do pet?

Vou considerar shih tzu como porte pequeno para consultar a agenda certa.$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: pedir_nome_pet. Estado esperado: servico=banho e tosa; porte=pequeno; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'pedir_nome_pet']
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
  'petbot_kb_224',
  $user$Quero banho para Mel poodle$user$,
  $reply$Consultei a agenda e tenho:
1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]
2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]
3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]

Qual horario prefere?$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: oferecer_horarios. Estado esperado: servico=banho; porte=pequeno; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'oferecer_horarios']
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
  'petbot_kb_225',
  $user$Quero banho para Nina pinscher$user$,
  $reply$Consultei a agenda e tenho:
1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]
2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]
3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]

Qual horario prefere?$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: oferecer_horarios. Estado esperado: servico=banho; porte=pequeno; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'oferecer_horarios']
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
  'petbot_kb_226',
  $user$Quero banho e tosa para Bob yorkshire$user$,
  $reply$Consultei a agenda e tenho:
1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]
2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]
3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]

Qual horario prefere?$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: oferecer_horarios. Estado esperado: servico=banho e tosa; porte=pequeno; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'oferecer_horarios']
),
(
  null,
  'petshop',
  'banho_tosa',
  'coleta',
  'curto',
  true,
  true,
  true,
  'petbot_kb_227',
  $user$Quero banho para meu lhasa$user$,
  $reply$Perfeito. Qual o nome do pet?

Vou considerar lhasa como porte pequeno para consultar a agenda certa.$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: pedir_nome_pet. Estado esperado: servico=banho; porte=pequeno; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'pedir_nome_pet']
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
  'petbot_kb_228',
  $user$Quero banho para Rex spitz$user$,
  $reply$Consultei a agenda e tenho:
1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]
2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]
3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]

Qual horario prefere?$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: oferecer_horarios. Estado esperado: servico=banho; porte=pequeno; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'oferecer_horarios']
),
(
  null,
  'petshop',
  'sem_horario',
  'oferta',
  'curto',
  false,
  false,
  true,
  'petbot_kb_229',
  $user$Quero banho e tosa para Toby beagle$user$,
  $reply$Consultei a agenda e nao achei horario disponivel agora. Quer que eu chame a equipe para ver outros horarios?$reply$,
  $notes$Banho/tosa: agenda cheia. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: sem_horario. Estado esperado: blockedReasons inclui sem_horario_real; sem horario inventado. Bloqueios: sem_horario_real. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'sem_horario', 'raca_contexto']
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
  'petbot_kb_230',
  $user$Quero banho para Mia cocker$user$,
  $reply$Consultei a agenda e tenho:
1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]
2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]
3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]

Qual horario prefere?$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: oferecer_horarios. Estado esperado: servico=banho; porte=medio; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'oferecer_horarios']
),
(
  null,
  'petshop',
  'banho_tosa',
  'coleta',
  'curto',
  true,
  true,
  true,
  'petbot_kb_231',
  $user$Quero banho para meu border collie$user$,
  $reply$Perfeito. Qual o nome do pet?

Vou considerar border collie como porte medio para consultar a agenda certa.$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: pedir_nome_pet. Estado esperado: servico=banho; porte=medio; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'pedir_nome_pet']
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
  'petbot_kb_232',
  $user$Quero banho e tosa para Cookie golden$user$,
  $reply$Consultei a agenda e tenho:
1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]
2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]
3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]

Qual horario prefere?$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: oferecer_horarios. Estado esperado: servico=banho e tosa; porte=grande; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'oferecer_horarios']
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
  'petbot_kb_233',
  $user$Quero banho para Fred labrador$user$,
  $reply$Consultei a agenda e tenho:
1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]
2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]
3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]

Qual horario prefere?$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: oferecer_horarios. Estado esperado: servico=banho; porte=grande; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'oferecer_horarios']
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
  'petbot_kb_234',
  $user$Quero banho para Pipoca rottweiler$user$,
  $reply$Consultei a agenda e tenho:
1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]
2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]
3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]

Qual horario prefere?$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: oferecer_horarios. Estado esperado: servico=banho; porte=grande; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'oferecer_horarios']
),
(
  null,
  'petshop',
  'banho_tosa',
  'coleta',
  'curto',
  true,
  true,
  true,
  'petbot_kb_235',
  $user$Quero banho e tosa para meu shih tzu$user$,
  $reply$Perfeito. Qual o nome do pet?

Vou considerar shih tzu como porte pequeno para consultar a agenda certa.$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: pedir_nome_pet. Estado esperado: servico=banho e tosa; porte=pequeno; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'pedir_nome_pet']
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
  'petbot_kb_236',
  $user$Quero banho para Mel poodle$user$,
  $reply$Consultei a agenda e tenho:
1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]
2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]
3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]

Qual horario prefere?$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: oferecer_horarios. Estado esperado: servico=banho; porte=pequeno; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'oferecer_horarios']
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
  'petbot_kb_237',
  $user$Quero banho para Nina pinscher$user$,
  $reply$Consultei a agenda e tenho:
1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]
2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]
3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]

Qual horario prefere?$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: oferecer_horarios. Estado esperado: servico=banho; porte=pequeno; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'oferecer_horarios']
),
(
  null,
  'petshop',
  'sem_horario',
  'oferta',
  'curto',
  false,
  false,
  true,
  'petbot_kb_238',
  $user$Quero banho e tosa para Bob yorkshire$user$,
  $reply$Consultei a agenda e nao achei horario disponivel agora. Quer que eu chame a equipe para ver outros horarios?$reply$,
  $notes$Banho/tosa: agenda cheia. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: sem_horario. Estado esperado: blockedReasons inclui sem_horario_real; sem horario inventado. Bloqueios: sem_horario_real. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'sem_horario', 'raca_contexto']
),
(
  null,
  'petshop',
  'banho_tosa',
  'coleta',
  'curto',
  true,
  true,
  true,
  'petbot_kb_239',
  $user$Quero banho para meu lhasa$user$,
  $reply$Perfeito. Qual o nome do pet?

Vou considerar lhasa como porte pequeno para consultar a agenda certa.$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: pedir_nome_pet. Estado esperado: servico=banho; porte=pequeno; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'pedir_nome_pet']
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
  'petbot_kb_240',
  $user$Quero banho para Rex spitz$user$,
  $reply$Consultei a agenda e tenho:
1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]
2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]
3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]

Qual horario prefere?$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: oferecer_horarios. Estado esperado: servico=banho; porte=pequeno; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'oferecer_horarios']
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
  'petbot_kb_241',
  $user$Quero banho e tosa para Toby beagle$user$,
  $reply$Consultei a agenda e tenho:
1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]
2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]
3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]

Qual horario prefere?$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: oferecer_horarios. Estado esperado: servico=banho e tosa; porte=medio; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'oferecer_horarios']
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
  'petbot_kb_242',
  $user$Quero banho para Mia cocker$user$,
  $reply$Consultei a agenda e tenho:
1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]
2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]
3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]

Qual horario prefere?$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: oferecer_horarios. Estado esperado: servico=banho; porte=medio; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'oferecer_horarios']
),
(
  null,
  'petshop',
  'banho_tosa',
  'coleta',
  'curto',
  true,
  true,
  true,
  'petbot_kb_243',
  $user$Quero banho para meu border collie$user$,
  $reply$Perfeito. Qual o nome do pet?

Vou considerar border collie como porte medio para consultar a agenda certa.$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: pedir_nome_pet. Estado esperado: servico=banho; porte=medio; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'pedir_nome_pet']
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
  'petbot_kb_244',
  $user$Quero banho e tosa para Cookie golden$user$,
  $reply$Consultei a agenda e tenho:
1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]
2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]
3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]

Qual horario prefere?$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: oferecer_horarios. Estado esperado: servico=banho e tosa; porte=grande; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'oferecer_horarios']
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
  'petbot_kb_245',
  $user$Quero banho para Fred labrador$user$,
  $reply$Consultei a agenda e tenho:
1. [HORARIO_REAL_1] - R$ [VALOR_DO_BANCO_1]
2. [HORARIO_REAL_2] - R$ [VALOR_DO_BANCO_2]
3. [HORARIO_REAL_3] - R$ [VALOR_DO_BANCO_3]

Qual horario prefere?$reply$,
  $notes$Banho/tosa: agenda real. Contexto inicial: Atendimento de banho/tosa em andamento; agenda precisa ser consultada antes de oferecer horario.. Guardiao: oferecer_horarios. Estado esperado: servico=banho; porte=grande; agenda consultada. Bloqueios: nenhum. Mostrar 2 ou 3 horarios reais quando possivel. Preco antes de confirmar.$notes$,
  array['banho_tosa', 'agenda_real', 'raca_contexto', 'oferecer_horarios']
),
(
  null,
  'petshop',
  'veterinaria',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_246',
  $user$Meu gato esta espirrando muito$user$,
  $reply$Entendi. Qual seu nome e o nome do pet?

Depois vou consultar a agenda real. A consulta so sera confirmada depois do valor e do resumo final.$reply$,
  $notes$Veterinaria: triagem basica. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: intent=veterinaria; especie=gato; symptom=espirrando muito. Bloqueios: nenhum. Coletar cliente, pet, especie, problema principal e horario real.$notes$,
  array['veterinaria', 'triagem', 'gato', 'pedir_nome']
),
(
  null,
  'petshop',
  'veterinaria',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_247',
  $user$Meu cachorro esta mancando$user$,
  $reply$Entendi. Qual seu nome e o nome do pet?

Depois vou consultar a agenda real. A consulta so sera confirmada depois do valor e do resumo final.$reply$,
  $notes$Veterinaria: triagem basica. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: intent=veterinaria; especie=cachorro; symptom=mancando. Bloqueios: nenhum. Coletar cliente, pet, especie, problema principal e horario real.$notes$,
  array['veterinaria', 'triagem', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'veterinaria',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_248',
  $user$Meu cachorro esta coceira forte$user$,
  $reply$Entendi. Qual seu nome e o nome do pet?

Depois vou consultar a agenda real. A consulta so sera confirmada depois do valor e do resumo final.$reply$,
  $notes$Veterinaria: triagem basica. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: intent=veterinaria; especie=cachorro; symptom=coceira forte. Bloqueios: nenhum. Coletar cliente, pet, especie, problema principal e horario real.$notes$,
  array['veterinaria', 'triagem', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'veterinaria',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_249',
  $user$Meu gato esta nao esta comendo$user$,
  $reply$Entendi. Qual seu nome e o nome do pet?

Depois vou consultar a agenda real. A consulta so sera confirmada depois do valor e do resumo final.$reply$,
  $notes$Veterinaria: triagem basica. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: intent=veterinaria; especie=gato; symptom=nao esta comendo. Bloqueios: nenhum. Coletar cliente, pet, especie, problema principal e horario real.$notes$,
  array['veterinaria', 'triagem', 'gato', 'pedir_nome']
),
(
  null,
  'petshop',
  'veterinaria',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_250',
  $user$Meu cachorro esta vomitando desde ontem$user$,
  $reply$Entendi. Qual seu nome e o nome do pet?

Depois vou consultar a agenda real. A consulta so sera confirmada depois do valor e do resumo final.$reply$,
  $notes$Veterinaria: triagem basica. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: intent=veterinaria; especie=cachorro; symptom=vomitando desde ontem. Bloqueios: nenhum. Coletar cliente, pet, especie, problema principal e horario real.$notes$,
  array['veterinaria', 'triagem', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'veterinaria',
  'geral',
  'curto',
  false,
  false,
  true,
  'petbot_kb_251',
  $user$Meu cachorro esta comeu veneno agora$user$,
  $reply$Entendi. Esse caso precisa de atencao da equipe agora. Vou chamar um atendente para te orientar com prioridade.$reply$,
  $notes$Veterinaria: sintoma sensivel. Contexto inicial: Atendimento veterinario em triagem; nao diagnosticar e consultar agenda real.. Guardiao: handoff_humano. Estado esperado: status=human_requested; needsHuman=true. Bloqueios: veterinaria_sensivel. Nao vender nem diagnosticar; pedir humano.$notes$,
  array['veterinaria', 'urgencia', 'cachorro', 'handoff_humano']
),
(
  null,
  'petshop',
  'veterinaria',
  'geral',
  'curto',
  false,
  false,
  true,
  'petbot_kb_252',
  $user$Meu gato esta com falta de ar$user$,
  $reply$Entendi. Esse caso precisa de atencao da equipe agora. Vou chamar um atendente para te orientar com prioridade.$reply$,
  $notes$Veterinaria: sintoma sensivel. Contexto inicial: Atendimento veterinario em triagem; nao diagnosticar e consultar agenda real.. Guardiao: handoff_humano. Estado esperado: status=human_requested; needsHuman=true. Bloqueios: veterinaria_sensivel. Nao vender nem diagnosticar; pedir humano.$notes$,
  array['veterinaria', 'urgencia', 'gato', 'handoff_humano']
),
(
  null,
  'petshop',
  'veterinaria',
  'geral',
  'curto',
  false,
  false,
  true,
  'petbot_kb_253',
  $user$Meu cachorro esta sangrando bastante$user$,
  $reply$Entendi. Esse caso precisa de atencao da equipe agora. Vou chamar um atendente para te orientar com prioridade.$reply$,
  $notes$Veterinaria: sintoma sensivel. Contexto inicial: Atendimento veterinario em triagem; nao diagnosticar e consultar agenda real.. Guardiao: handoff_humano. Estado esperado: status=human_requested; needsHuman=true. Bloqueios: veterinaria_sensivel. Nao vender nem diagnosticar; pedir humano.$notes$,
  array['veterinaria', 'urgencia', 'cachorro', 'handoff_humano']
),
(
  null,
  'petshop',
  'veterinaria',
  'geral',
  'curto',
  false,
  false,
  true,
  'petbot_kb_254',
  $user$Meu cachorro esta convulsionando$user$,
  $reply$Entendi. Esse caso precisa de atencao da equipe agora. Vou chamar um atendente para te orientar com prioridade.$reply$,
  $notes$Veterinaria: sintoma sensivel. Contexto inicial: Atendimento veterinario em triagem; nao diagnosticar e consultar agenda real.. Guardiao: handoff_humano. Estado esperado: status=human_requested; needsHuman=true. Bloqueios: veterinaria_sensivel. Nao vender nem diagnosticar; pedir humano.$notes$,
  array['veterinaria', 'urgencia', 'cachorro', 'handoff_humano']
),
(
  null,
  'petshop',
  'veterinaria',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_255',
  $user$Meu gato esta espirrando muito$user$,
  $reply$Entendi. Qual seu nome e o nome do pet?

Depois vou consultar a agenda real. A consulta so sera confirmada depois do valor e do resumo final.$reply$,
  $notes$Veterinaria: triagem basica. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: intent=veterinaria; especie=gato; symptom=espirrando muito. Bloqueios: nenhum. Coletar cliente, pet, especie, problema principal e horario real.$notes$,
  array['veterinaria', 'triagem', 'gato', 'pedir_nome']
),
(
  null,
  'petshop',
  'veterinaria',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_256',
  $user$Meu cachorro esta mancando$user$,
  $reply$Entendi. Qual seu nome e o nome do pet?

Depois vou consultar a agenda real. A consulta so sera confirmada depois do valor e do resumo final.$reply$,
  $notes$Veterinaria: triagem basica. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: intent=veterinaria; especie=cachorro; symptom=mancando. Bloqueios: nenhum. Coletar cliente, pet, especie, problema principal e horario real.$notes$,
  array['veterinaria', 'triagem', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'veterinaria',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_257',
  $user$Meu cachorro esta coceira forte$user$,
  $reply$Entendi. Qual seu nome e o nome do pet?

Depois vou consultar a agenda real. A consulta so sera confirmada depois do valor e do resumo final.$reply$,
  $notes$Veterinaria: triagem basica. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: intent=veterinaria; especie=cachorro; symptom=coceira forte. Bloqueios: nenhum. Coletar cliente, pet, especie, problema principal e horario real.$notes$,
  array['veterinaria', 'triagem', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'veterinaria',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_258',
  $user$Meu gato esta nao esta comendo$user$,
  $reply$Entendi. Qual seu nome e o nome do pet?

Depois vou consultar a agenda real. A consulta so sera confirmada depois do valor e do resumo final.$reply$,
  $notes$Veterinaria: triagem basica. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: intent=veterinaria; especie=gato; symptom=nao esta comendo. Bloqueios: nenhum. Coletar cliente, pet, especie, problema principal e horario real.$notes$,
  array['veterinaria', 'triagem', 'gato', 'pedir_nome']
),
(
  null,
  'petshop',
  'veterinaria',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_259',
  $user$Meu cachorro esta vomitando desde ontem$user$,
  $reply$Entendi. Qual seu nome e o nome do pet?

Depois vou consultar a agenda real. A consulta so sera confirmada depois do valor e do resumo final.$reply$,
  $notes$Veterinaria: triagem basica. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: intent=veterinaria; especie=cachorro; symptom=vomitando desde ontem. Bloqueios: nenhum. Coletar cliente, pet, especie, problema principal e horario real.$notes$,
  array['veterinaria', 'triagem', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'veterinaria',
  'geral',
  'curto',
  false,
  false,
  true,
  'petbot_kb_260',
  $user$Meu cachorro esta comeu veneno agora$user$,
  $reply$Entendi. Esse caso precisa de atencao da equipe agora. Vou chamar um atendente para te orientar com prioridade.$reply$,
  $notes$Veterinaria: sintoma sensivel. Contexto inicial: Atendimento veterinario em triagem; nao diagnosticar e consultar agenda real.. Guardiao: handoff_humano. Estado esperado: status=human_requested; needsHuman=true. Bloqueios: veterinaria_sensivel. Nao vender nem diagnosticar; pedir humano.$notes$,
  array['veterinaria', 'urgencia', 'cachorro', 'handoff_humano']
),
(
  null,
  'petshop',
  'veterinaria',
  'geral',
  'curto',
  false,
  false,
  true,
  'petbot_kb_261',
  $user$Meu gato esta com falta de ar$user$,
  $reply$Entendi. Esse caso precisa de atencao da equipe agora. Vou chamar um atendente para te orientar com prioridade.$reply$,
  $notes$Veterinaria: sintoma sensivel. Contexto inicial: Atendimento veterinario em triagem; nao diagnosticar e consultar agenda real.. Guardiao: handoff_humano. Estado esperado: status=human_requested; needsHuman=true. Bloqueios: veterinaria_sensivel. Nao vender nem diagnosticar; pedir humano.$notes$,
  array['veterinaria', 'urgencia', 'gato', 'handoff_humano']
),
(
  null,
  'petshop',
  'veterinaria',
  'geral',
  'curto',
  false,
  false,
  true,
  'petbot_kb_262',
  $user$Meu cachorro esta sangrando bastante$user$,
  $reply$Entendi. Esse caso precisa de atencao da equipe agora. Vou chamar um atendente para te orientar com prioridade.$reply$,
  $notes$Veterinaria: sintoma sensivel. Contexto inicial: Atendimento veterinario em triagem; nao diagnosticar e consultar agenda real.. Guardiao: handoff_humano. Estado esperado: status=human_requested; needsHuman=true. Bloqueios: veterinaria_sensivel. Nao vender nem diagnosticar; pedir humano.$notes$,
  array['veterinaria', 'urgencia', 'cachorro', 'handoff_humano']
),
(
  null,
  'petshop',
  'veterinaria',
  'geral',
  'curto',
  false,
  false,
  true,
  'petbot_kb_263',
  $user$Meu cachorro esta convulsionando$user$,
  $reply$Entendi. Esse caso precisa de atencao da equipe agora. Vou chamar um atendente para te orientar com prioridade.$reply$,
  $notes$Veterinaria: sintoma sensivel. Contexto inicial: Atendimento veterinario em triagem; nao diagnosticar e consultar agenda real.. Guardiao: handoff_humano. Estado esperado: status=human_requested; needsHuman=true. Bloqueios: veterinaria_sensivel. Nao vender nem diagnosticar; pedir humano.$notes$,
  array['veterinaria', 'urgencia', 'cachorro', 'handoff_humano']
),
(
  null,
  'petshop',
  'veterinaria',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_264',
  $user$Meu gato esta espirrando muito$user$,
  $reply$Entendi. Qual seu nome e o nome do pet?

Depois vou consultar a agenda real. A consulta so sera confirmada depois do valor e do resumo final.$reply$,
  $notes$Veterinaria: triagem basica. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: intent=veterinaria; especie=gato; symptom=espirrando muito. Bloqueios: nenhum. Coletar cliente, pet, especie, problema principal e horario real.$notes$,
  array['veterinaria', 'triagem', 'gato', 'pedir_nome']
),
(
  null,
  'petshop',
  'veterinaria',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_265',
  $user$Meu cachorro esta mancando$user$,
  $reply$Entendi. Qual seu nome e o nome do pet?

Depois vou consultar a agenda real. A consulta so sera confirmada depois do valor e do resumo final.$reply$,
  $notes$Veterinaria: triagem basica. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: intent=veterinaria; especie=cachorro; symptom=mancando. Bloqueios: nenhum. Coletar cliente, pet, especie, problema principal e horario real.$notes$,
  array['veterinaria', 'triagem', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'veterinaria',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_266',
  $user$Meu cachorro esta coceira forte$user$,
  $reply$Entendi. Qual seu nome e o nome do pet?

Depois vou consultar a agenda real. A consulta so sera confirmada depois do valor e do resumo final.$reply$,
  $notes$Veterinaria: triagem basica. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: intent=veterinaria; especie=cachorro; symptom=coceira forte. Bloqueios: nenhum. Coletar cliente, pet, especie, problema principal e horario real.$notes$,
  array['veterinaria', 'triagem', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'veterinaria',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_267',
  $user$Meu gato esta nao esta comendo$user$,
  $reply$Entendi. Qual seu nome e o nome do pet?

Depois vou consultar a agenda real. A consulta so sera confirmada depois do valor e do resumo final.$reply$,
  $notes$Veterinaria: triagem basica. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: intent=veterinaria; especie=gato; symptom=nao esta comendo. Bloqueios: nenhum. Coletar cliente, pet, especie, problema principal e horario real.$notes$,
  array['veterinaria', 'triagem', 'gato', 'pedir_nome']
),
(
  null,
  'petshop',
  'veterinaria',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_268',
  $user$Meu cachorro esta vomitando desde ontem$user$,
  $reply$Entendi. Qual seu nome e o nome do pet?

Depois vou consultar a agenda real. A consulta so sera confirmada depois do valor e do resumo final.$reply$,
  $notes$Veterinaria: triagem basica. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: intent=veterinaria; especie=cachorro; symptom=vomitando desde ontem. Bloqueios: nenhum. Coletar cliente, pet, especie, problema principal e horario real.$notes$,
  array['veterinaria', 'triagem', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'veterinaria',
  'geral',
  'curto',
  false,
  false,
  true,
  'petbot_kb_269',
  $user$Meu cachorro esta comeu veneno agora$user$,
  $reply$Entendi. Esse caso precisa de atencao da equipe agora. Vou chamar um atendente para te orientar com prioridade.$reply$,
  $notes$Veterinaria: sintoma sensivel. Contexto inicial: Atendimento veterinario em triagem; nao diagnosticar e consultar agenda real.. Guardiao: handoff_humano. Estado esperado: status=human_requested; needsHuman=true. Bloqueios: veterinaria_sensivel. Nao vender nem diagnosticar; pedir humano.$notes$,
  array['veterinaria', 'urgencia', 'cachorro', 'handoff_humano']
),
(
  null,
  'petshop',
  'veterinaria',
  'geral',
  'curto',
  false,
  false,
  true,
  'petbot_kb_270',
  $user$Meu gato esta com falta de ar$user$,
  $reply$Entendi. Esse caso precisa de atencao da equipe agora. Vou chamar um atendente para te orientar com prioridade.$reply$,
  $notes$Veterinaria: sintoma sensivel. Contexto inicial: Atendimento veterinario em triagem; nao diagnosticar e consultar agenda real.. Guardiao: handoff_humano. Estado esperado: status=human_requested; needsHuman=true. Bloqueios: veterinaria_sensivel. Nao vender nem diagnosticar; pedir humano.$notes$,
  array['veterinaria', 'urgencia', 'gato', 'handoff_humano']
),
(
  null,
  'petshop',
  'veterinaria',
  'geral',
  'curto',
  false,
  false,
  true,
  'petbot_kb_271',
  $user$Meu cachorro esta sangrando bastante$user$,
  $reply$Entendi. Esse caso precisa de atencao da equipe agora. Vou chamar um atendente para te orientar com prioridade.$reply$,
  $notes$Veterinaria: sintoma sensivel. Contexto inicial: Atendimento veterinario em triagem; nao diagnosticar e consultar agenda real.. Guardiao: handoff_humano. Estado esperado: status=human_requested; needsHuman=true. Bloqueios: veterinaria_sensivel. Nao vender nem diagnosticar; pedir humano.$notes$,
  array['veterinaria', 'urgencia', 'cachorro', 'handoff_humano']
),
(
  null,
  'petshop',
  'veterinaria',
  'geral',
  'curto',
  false,
  false,
  true,
  'petbot_kb_272',
  $user$Meu cachorro esta convulsionando$user$,
  $reply$Entendi. Esse caso precisa de atencao da equipe agora. Vou chamar um atendente para te orientar com prioridade.$reply$,
  $notes$Veterinaria: sintoma sensivel. Contexto inicial: Atendimento veterinario em triagem; nao diagnosticar e consultar agenda real.. Guardiao: handoff_humano. Estado esperado: status=human_requested; needsHuman=true. Bloqueios: veterinaria_sensivel. Nao vender nem diagnosticar; pedir humano.$notes$,
  array['veterinaria', 'urgencia', 'cachorro', 'handoff_humano']
),
(
  null,
  'petshop',
  'veterinaria',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_273',
  $user$Meu gato esta espirrando muito$user$,
  $reply$Entendi. Qual seu nome e o nome do pet?

Depois vou consultar a agenda real. A consulta so sera confirmada depois do valor e do resumo final.$reply$,
  $notes$Veterinaria: triagem basica. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: intent=veterinaria; especie=gato; symptom=espirrando muito. Bloqueios: nenhum. Coletar cliente, pet, especie, problema principal e horario real.$notes$,
  array['veterinaria', 'triagem', 'gato', 'pedir_nome']
),
(
  null,
  'petshop',
  'veterinaria',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_274',
  $user$Meu cachorro esta mancando$user$,
  $reply$Entendi. Qual seu nome e o nome do pet?

Depois vou consultar a agenda real. A consulta so sera confirmada depois do valor e do resumo final.$reply$,
  $notes$Veterinaria: triagem basica. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: intent=veterinaria; especie=cachorro; symptom=mancando. Bloqueios: nenhum. Coletar cliente, pet, especie, problema principal e horario real.$notes$,
  array['veterinaria', 'triagem', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'veterinaria',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_275',
  $user$Meu cachorro esta coceira forte$user$,
  $reply$Entendi. Qual seu nome e o nome do pet?

Depois vou consultar a agenda real. A consulta so sera confirmada depois do valor e do resumo final.$reply$,
  $notes$Veterinaria: triagem basica. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: intent=veterinaria; especie=cachorro; symptom=coceira forte. Bloqueios: nenhum. Coletar cliente, pet, especie, problema principal e horario real.$notes$,
  array['veterinaria', 'triagem', 'cachorro', 'pedir_nome']
),
(
  null,
  'petshop',
  'desconto',
  'oferta',
  'curto',
  false,
  false,
  true,
  'petbot_kb_276',
  $user$faz mais barato pra mim?$user$,
  $reply$Infelizmente nao conseguimos aplicar desconto nesse pedido.

Se quiser, posso te mostrar uma opcao mais economica do banco.$reply$,
  $notes$Desconto: recusa gentil. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: recusar_desconto. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: nenhum. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['desconto', 'proibido', 'recusar_desconto']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_277',
  $user$qro racao pro meu shitzu aduto$user$,
  $reply$Claro. Posso saber seu nome, por favor?

Vou considerar Shih Tzu como porte pequeno e adulto como categoria do pet.$reply$,
  $notes$Erro de digitacao: racao. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: nenhum. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['typo', 'raca_contexto', 'pedir_nome']
),
(
  null,
  'petshop',
  'geral',
  'geral',
  'curto',
  false,
  false,
  true,
  'petbot_kb_278',
  $user$quero falar com uma pessoa$user$,
  $reply$Claro. Vou chamar alguem da equipe para continuar seu atendimento.$reply$,
  $notes$Humano solicitado. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: handoff_humano. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: humano_solicitado. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['humano', 'handoff', 'handoff_humano']
),
(
  null,
  'petshop',
  'produto',
  'coleta',
  'curto',
  false,
  false,
  true,
  'petbot_kb_279',
  $user$quero racao e banho$user$,
  $reply$Claro. Vou organizar uma coisa por vez para nao misturar.

Qual seu nome?$reply$,
  $notes$Multi-intencao: separar fluxos. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: nenhum. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['multi_intencao', 'pedir_nome']
),
(
  null,
  'petshop',
  'veterinaria',
  'coleta',
  'curto',
  false,
  false,
  true,
  'petbot_kb_280',
  $user$na verdade quero veterinario$user$,
  $reply$Sem problema. Vou trocar para atendimento veterinario.

Qual o nome do pet e o problema principal?$reply$,
  $notes$Cliente muda de ideia. Contexto inicial: Atendimento veterinario em triagem; nao diagnosticar e consultar agenda real.. Guardiao: pedir_nome_pet. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: nenhum. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['mudanca_intencao', 'pedir_nome_pet']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_281',
  $user$eu ja falei, e adulto$user$,
  $reply$Perfeito, desculpa. Vou seguir com adulto e consultar o estoque real agora.

Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Nao repetir dado coletado. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: nenhum. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['nao_repetir', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'sem_estoque',
  'oferta',
  'curto',
  false,
  false,
  true,
  'petbot_kb_282',
  $user$tem uma racao importada azul que nao lembro o nome?$user$,
  $reply$Consultei aqui e nao encontrei produto disponivel com esses dados. Quer que eu chame alguem da equipe para te ajudar?$reply$,
  $notes$Produto inexistente. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: sem_estoque. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: estoque_ausente. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['sem_estoque']
),
(
  null,
  'petshop',
  'pagamento',
  'pagamento',
  'curto',
  false,
  false,
  true,
  'petbot_kb_283',
  $user$manda link pra pagar$user$,
  $reply$No momento nao trabalho com link de pagamento por aqui.

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Pedido de link de pagamento. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: nenhum. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['pagamento', 'sem_link', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'coleta',
  'curto',
  false,
  false,
  true,
  'petbot_kb_284',
  $user$anda logo, so quero comprar$user$,
  $reply$Claro, vou ser rapido.

So preciso saber se e para cachorro ou gato para consultar o produto certo.$reply$,
  $notes$Cliente impaciente. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: pedir_especie. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: nenhum. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['tom_humano', 'cliente_impaciente', 'pedir_especie']
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
  'petbot_kb_285',
  $user$quanto e a entrega?$user$,
  $reply$Vou consultar a regra da loja. A taxa de entrega e R$ [TAXA_DE_ENTREGA_DO_BANCO].

O que voce quer pedir?$reply$,
  $notes$Pergunta de taxa antes do pedido. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: identificar_intencao. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: nenhum. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['taxa_entrega', 'identificar_intencao']
),
(
  null,
  'petshop',
  'desconto',
  'oferta',
  'curto',
  false,
  false,
  true,
  'petbot_kb_286',
  $user$faz mais barato pra mim?$user$,
  $reply$Infelizmente nao conseguimos aplicar desconto nesse pedido.

Se quiser, posso te mostrar uma opcao mais economica do banco.$reply$,
  $notes$Desconto: recusa gentil. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: recusar_desconto. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: nenhum. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['desconto', 'proibido', 'recusar_desconto']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_287',
  $user$qro racao pro meu shitzu aduto$user$,
  $reply$Claro. Posso saber seu nome, por favor?

Vou considerar Shih Tzu como porte pequeno e adulto como categoria do pet.$reply$,
  $notes$Erro de digitacao: racao. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: nenhum. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['typo', 'raca_contexto', 'pedir_nome']
),
(
  null,
  'petshop',
  'geral',
  'geral',
  'curto',
  false,
  false,
  true,
  'petbot_kb_288',
  $user$quero falar com uma pessoa$user$,
  $reply$Claro. Vou chamar alguem da equipe para continuar seu atendimento.$reply$,
  $notes$Humano solicitado. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: handoff_humano. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: humano_solicitado. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['humano', 'handoff', 'handoff_humano']
),
(
  null,
  'petshop',
  'produto',
  'coleta',
  'curto',
  false,
  false,
  true,
  'petbot_kb_289',
  $user$quero racao e banho$user$,
  $reply$Claro. Vou organizar uma coisa por vez para nao misturar.

Qual seu nome?$reply$,
  $notes$Multi-intencao: separar fluxos. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: nenhum. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['multi_intencao', 'pedir_nome']
),
(
  null,
  'petshop',
  'veterinaria',
  'coleta',
  'curto',
  false,
  false,
  true,
  'petbot_kb_290',
  $user$na verdade quero veterinario$user$,
  $reply$Sem problema. Vou trocar para atendimento veterinario.

Qual o nome do pet e o problema principal?$reply$,
  $notes$Cliente muda de ideia. Contexto inicial: Atendimento veterinario em triagem; nao diagnosticar e consultar agenda real.. Guardiao: pedir_nome_pet. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: nenhum. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['mudanca_intencao', 'pedir_nome_pet']
),
(
  null,
  'petshop',
  'produto',
  'oferta',
  'curto',
  false,
  true,
  true,
  'petbot_kb_291',
  $user$eu ja falei, e adulto$user$,
  $reply$Perfeito, desculpa. Vou seguir com adulto e consultar o estoque real agora.

Consultei o estoque e tenho essas opcoes:
1. [PRODUTO_COM_ESTOQUE_1] - R$ [VALOR_DO_BANCO_1]
2. [PRODUTO_COM_ESTOQUE_2] - R$ [VALOR_DO_BANCO_2]
3. [PRODUTO_COM_ESTOQUE_3] - R$ [VALOR_DO_BANCO_3]

Qual prefere?$reply$,
  $notes$Nao repetir dado coletado. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: oferecer_produtos. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: nenhum. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['nao_repetir', 'oferecer_produtos']
),
(
  null,
  'petshop',
  'sem_estoque',
  'oferta',
  'curto',
  false,
  false,
  true,
  'petbot_kb_292',
  $user$tem uma racao importada azul que nao lembro o nome?$user$,
  $reply$Consultei aqui e nao encontrei produto disponivel com esses dados. Quer que eu chame alguem da equipe para te ajudar?$reply$,
  $notes$Produto inexistente. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: sem_estoque. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: estoque_ausente. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['sem_estoque']
),
(
  null,
  'petshop',
  'pagamento',
  'pagamento',
  'curto',
  false,
  false,
  true,
  'petbot_kb_293',
  $user$manda link pra pagar$user$,
  $reply$No momento nao trabalho com link de pagamento por aqui.

Qual forma prefere? pix, dinheiro ou cartao?$reply$,
  $notes$Pedido de link de pagamento. Contexto inicial: Produto/servico ja foi escolhido com preco real do banco.. Guardiao: pedir_pagamento. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: nenhum. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['pagamento', 'sem_link', 'pedir_pagamento']
),
(
  null,
  'petshop',
  'produto',
  'coleta',
  'curto',
  false,
  false,
  true,
  'petbot_kb_294',
  $user$anda logo, so quero comprar$user$,
  $reply$Claro, vou ser rapido.

So preciso saber se e para cachorro ou gato para consultar o produto certo.$reply$,
  $notes$Cliente impaciente. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: pedir_especie. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: nenhum. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['tom_humano', 'cliente_impaciente', 'pedir_especie']
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
  'petbot_kb_295',
  $user$quanto e a entrega?$user$,
  $reply$Vou consultar a regra da loja. A taxa de entrega e R$ [TAXA_DE_ENTREGA_DO_BANCO].

O que voce quer pedir?$reply$,
  $notes$Pergunta de taxa antes do pedido. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: identificar_intencao. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: nenhum. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['taxa_entrega', 'identificar_intencao']
),
(
  null,
  'petshop',
  'desconto',
  'oferta',
  'curto',
  false,
  false,
  true,
  'petbot_kb_296',
  $user$faz mais barato pra mim?$user$,
  $reply$Infelizmente nao conseguimos aplicar desconto nesse pedido.

Se quiser, posso te mostrar uma opcao mais economica do banco.$reply$,
  $notes$Desconto: recusa gentil. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: recusar_desconto. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: nenhum. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['desconto', 'proibido', 'recusar_desconto']
),
(
  null,
  'petshop',
  'produto',
  'triagem',
  'curto',
  false,
  false,
  true,
  'petbot_kb_297',
  $user$qro racao pro meu shitzu aduto$user$,
  $reply$Claro. Posso saber seu nome, por favor?

Vou considerar Shih Tzu como porte pequeno e adulto como categoria do pet.$reply$,
  $notes$Erro de digitacao: racao. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: nenhum. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['typo', 'raca_contexto', 'pedir_nome']
),
(
  null,
  'petshop',
  'geral',
  'geral',
  'curto',
  false,
  false,
  true,
  'petbot_kb_298',
  $user$quero falar com uma pessoa$user$,
  $reply$Claro. Vou chamar alguem da equipe para continuar seu atendimento.$reply$,
  $notes$Humano solicitado. Contexto inicial: Estado anterior minimo conforme acao do guardiao.. Guardiao: handoff_humano. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: humano_solicitado. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['humano', 'handoff', 'handoff_humano']
),
(
  null,
  'petshop',
  'produto',
  'coleta',
  'curto',
  false,
  false,
  true,
  'petbot_kb_299',
  $user$quero racao e banho$user$,
  $reply$Claro. Vou organizar uma coisa por vez para nao misturar.

Qual seu nome?$reply$,
  $notes$Multi-intencao: separar fluxos. Contexto inicial: Cliente novo ou telefone sem cadastro confirmado.. Guardiao: pedir_nome. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: nenhum. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['multi_intencao', 'pedir_nome']
),
(
  null,
  'petshop',
  'veterinaria',
  'coleta',
  'curto',
  false,
  false,
  true,
  'petbot_kb_300',
  $user$na verdade quero veterinario$user$,
  $reply$Sem problema. Vou trocar para atendimento veterinario.

Qual o nome do pet e o problema principal?$reply$,
  $notes$Cliente muda de ideia. Contexto inicial: Atendimento veterinario em triagem; nao diagnosticar e consultar agenda real.. Guardiao: pedir_nome_pet. Estado esperado: guardiao deve bloquear avancos inseguros e manter resposta curta. Bloqueios: nenhum. Caso de stress para impedir improviso, desconto, repeticao ou mistura de fluxo.$notes$,
  array['mudanca_intencao', 'pedir_nome_pet']
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
