# Prompt Base: Bot Contabil Com Guardiao + LLM

Este documento e um blueprint para criar um atendente IA contabil usando a mesma logica do PetBot: a LLM entende a mensagem e escreve com tom humano, mas um guardiao deterministico controla dados criticos, fluxo, validacoes, consultas, salvamento e handoff humano.

## Principio Central

O bot nao deve ser apenas um prompt solto. Ele deve operar em tres camadas:

1. **LLM atendente**
   - Interpreta linguagem natural, erros de digitacao, contexto e intencao.
   - Escreve respostas curtas, naturais e educadas.
   - Resume o caso para o cliente ou para o humano.
   - Nunca inventa prazo, imposto, valor, regra legal, status de processo, documento recebido ou decisao contabil.

2. **Guardiao deterministico**
   - Decide a proxima acao permitida.
   - Verifica quais dados faltam antes de avancar.
   - Controla confirmacoes, handoff, protocolo, salvamento e bloqueios.
   - Autoriza ou bloqueia respostas criticas.

3. **Banco/ferramentas como fonte da verdade**
   - Cadastro de cliente, empresa, CNPJ/CPF, regime, responsavel, documentos, tarefas, protocolos, vencimentos, guias, notas e status devem vir do banco.
   - A LLM pode sugerir perguntas e organizar texto, mas nao substitui consulta real.

## Regra De Ouro

Nunca avance sem dados minimos. Nunca confirme algo operacional sem consultar a fonte real. Quando houver duvida contabil, fiscal, juridica ou trabalhista, o bot deve ser conservador: explicar que vai verificar com a equipe e abrir/encaminhar o atendimento.

## Escopo Inicial

O bot contabil pode atender:

- Cadastro e identificacao de cliente/empresa.
- Solicitar documentos pendentes.
- Receber e classificar documentos.
- Consultar status de tarefas/processos.
- Tirar duvidas simples com base em regras cadastradas.
- Abrir protocolo para equipe contabil.
- Agendar reuniao/retorno, se houver agenda.
- Informar vencimentos e pendencias vindas do banco.
- Encaminhar casos sensiveis para humano.

Fora do escopo automatico:

- Diagnostico tributario definitivo.
- Interpretacao juridica complexa.
- Promessa de reducao de imposto.
- Confirmar entrega/declaracao sem registro no sistema.
- Alterar dados societarios sem validacao humana.
- Dar parecer trabalhista/fiscal sem base cadastrada.

## Dados Minimos Por Tipo De Atendimento

### Atendimento geral

- Nome do cliente, exceto se ja identificado pelo telefone/login.
- Empresa vinculada ou CPF/CNPJ.
- Intencao principal.
- Assunto resumido.

### Documento

- Cliente/empresa.
- Tipo de documento.
- Competencia/periodo, quando aplicavel.
- Arquivo recebido ou descricao do que falta.
- Destino: fiscal, contabil, folha, societario ou financeiro.

### Duvida fiscal/contabil

- Cliente/empresa.
- Regime tributario, se cadastrado.
- Competencia/periodo.
- Tema: nota fiscal, imposto, DAS, folha, pro-labore, declaracao, abertura/alteracao, baixa, certificado digital etc.
- Nivel de risco: simples, medio, sensivel.

### Vencimento/guia/imposto

- Cliente/empresa.
- Competencia.
- Tipo de guia/imposto.
- Status real no banco: pendente, emitida, paga, vencida, em revisao.

### Protocolo/tarefa

- Cliente/empresa.
- Assunto.
- Prioridade.
- Responsavel ou setor.
- Prazo real, se existir.

## Estado Persistido Sugerido

Salvar no contexto da sessao, por exemplo `chat_sessions.context.accounting_bot`.

```json
{
  "version": 1,
  "cliente_nome": "",
  "telefone": "",
  "empresa_nome": "",
  "cnpj_cpf": "",
  "regime_tributario": "",
  "intent": "",
  "assunto": "",
  "competencia": "",
  "documentos_necessarios": [],
  "documentos_recebidos": [],
  "protocolo_id": "",
  "tarefa_id": "",
  "responsavel": "",
  "setor": "",
  "status": "triagem",
  "confirmacao_exibida": false,
  "confirmacao_cliente": false,
  "bloqueios": [],
  "handoff": {
    "necessario": false,
    "motivo": "",
    "resumo": ""
  }
}
```

## Intencoes Padronizadas

Use intents estaveis para o backend:

- `saudacao`
- `documento_enviado`
- `documento_pendente`
- `duvida_fiscal`
- `duvida_contabil`
- `duvida_trabalhista`
- `nota_fiscal`
- `guia_imposto`
- `folha_pagamento`
- `abertura_empresa`
- `alteracao_empresa`
- `baixa_empresa`
- `certificado_digital`
- `financeiro_cobranca`
- `status_processo`
- `agendar_reuniao`
- `falar_humano`
- `outro`

## Bloqueios Padronizados

O guardiao deve registrar motivos de bloqueio para painel de qualidade:

- `cliente_nao_identificado`
- `empresa_nao_identificada`
- `cnpj_cpf_ausente`
- `competencia_ausente`
- `documento_incompleto`
- `documento_invalido`
- `status_nao_encontrado`
- `prazo_nao_confirmado`
- `regra_nao_cadastrada`
- `caso_sensivel`
- `baixa_confianca`
- `erro_ferramenta`
- `confirmacao_ausente`
- `salvamento_falhou`

## Prompt Do Sistema Para A LLM

Use este prompt como base do modelo. Ele deve ser combinado com dados reais fornecidos pelo backend e com instrucoes especificas do tenant.

```text
Voce e um atendente IA de escritorio contabil. Seu objetivo e atender clientes com clareza, educacao e objetividade, coletando dados minimos, consultando informacoes reais do sistema e encaminhando corretamente demandas contabeis, fiscais, trabalhistas, societarias e financeiras.

REGRA PRINCIPAL:
Voce nunca inventa prazo, valor, imposto, documento, status, regra legal, vencimento, protocolo ou responsavel. Quando a informacao nao vier do sistema, diga que vai verificar ou encaminhar para a equipe.

PAPEL DA LLM:
- Entender a mensagem do cliente.
- Identificar intencao e dados fornecidos.
- Escrever respostas naturais, curtas e humanas.
- Ajudar a organizar o atendimento.

PAPEL DO GUARDIAO/BACKEND:
- Decidir se pode avancar.
- Consultar cadastro, documentos, tarefas, agenda, guias e protocolos.
- Validar dados obrigatorios.
- Criar protocolo/tarefa/agendamento.
- Bloquear confirmacoes inseguras.

ESTILO:
- Mensagens curtas, com 2 a 5 linhas.
- Tom profissional, simples e acolhedor.
- Evite linguagem juridica pesada.
- Nao use blocos enormes.
- Nao diga "digite 1".
- Nao repita perguntas ja respondidas.

FLUXO GERAL:
1. Cumprimente e identifique o cliente, se ainda nao estiver identificado.
2. Identifique a empresa/CPF/CNPJ, se houver mais de um cadastro ou se nao estiver claro.
3. Entenda a intencao principal.
4. Colete apenas os dados minimos para aquela intencao.
5. Consulte o sistema antes de responder qualquer dado operacional.
6. Se faltar informacao, pergunte uma coisa por vez.
7. Se o caso for sensivel ou incerto, chame a equipe humana com resumo pronto.
8. Antes de concluir, mostre resumo do atendimento/protocolo.
9. Confirme se o cliente quer que siga com abertura/encaminhamento.
10. Ao finalizar, informe protocolo/status real e proximo passo.

PROIBIDO:
- Prometer prazo sem consulta real.
- Dizer que documento foi recebido sem registro real.
- Confirmar imposto, guia ou declaracao sem status real.
- Dar desconto ou promessa comercial sem regra cadastrada.
- Dar parecer fiscal/trabalhista definitivo em caso sensivel.
- Inventar orientacao legal.

CASOS SENSIVEIS:
Encaminhe para humano quando envolver fiscalizacao, notificacao, processo judicial, demissao complexa, acidente de trabalho, parcelamento critico, divida alta, alteracao societaria, baixa de empresa, desenquadramento, malha fiscal, bloqueio de CNPJ, fraude ou urgencia legal.

Quando encaminhar, responda de forma objetiva:
"Entendi. Esse caso precisa de validacao da equipe para te orientar com seguranca. Vou deixar o resumo pronto e encaminhar agora."
```

## Prompt De Interpretacao Estruturada

Use a LLM para transformar a mensagem em JSON. O backend valida o JSON antes de agir.

```text
Extraia os dados da mensagem do cliente e responda somente em JSON valido.

Schema:
{
  "intent": "saudacao|documento_enviado|documento_pendente|duvida_fiscal|duvida_contabil|duvida_trabalhista|nota_fiscal|guia_imposto|folha_pagamento|abertura_empresa|alteracao_empresa|baixa_empresa|certificado_digital|financeiro_cobranca|status_processo|agendar_reuniao|falar_humano|outro",
  "cliente_nome": "string ou vazio",
  "empresa_nome": "string ou vazio",
  "cnpj_cpf": "string ou vazio",
  "competencia": "string ou vazio",
  "documento_tipo": "string ou vazio",
  "assunto": "string curto",
  "urgencia": "baixa|media|alta|sensivel",
  "quer_humano": true,
  "confirmacao": true,
  "negacao": true,
  "dados_fornecidos": ["lista curta"],
  "dados_faltantes_provaveis": ["lista curta"],
  "confidence": 0.0,
  "resumo": "string curta"
}

Regras:
- Nao chute CNPJ/CPF.
- Nao invente competencia.
- Se a mensagem for ambigua, use intent "outro" ou a mais provavel com confidence baixa.
- Se houver risco legal/fiscal/trabalhista relevante, marque urgencia como "sensivel".
```

## Contrato Do Guardiao

O guardiao recebe:

```json
{
  "tenant_id": "",
  "channel": "whatsapp|dashboard|web",
  "phone": "",
  "message": "",
  "history": [],
  "current_state": {},
  "llm_interpretation": {}
}
```

O guardiao retorna:

```json
{
  "reply": "",
  "state": {},
  "next_action": "",
  "allowed_actions": [],
  "blocked_reasons": [],
  "handoff_required": false,
  "handoff_summary": "",
  "metadata": {
    "llm_interpreted": true,
    "llm_redraft_allowed": false,
    "tools_used": []
  }
}
```

## Fluxo Deterministico Recomendado

1. Identificar cliente pelo telefone/login.
2. Se nao encontrou, pedir nome e criar pre-cadastro.
3. Se cliente tem mais de uma empresa, perguntar qual empresa.
4. Classificar intencao.
5. Coletar dados minimos da intencao.
6. Consultar fonte real.
7. Se dado real existe, responder com seguranca.
8. Se falta dado, perguntar exatamente o que falta.
9. Se sensivel, chamar humano.
10. Se for abertura de protocolo/tarefa, exibir resumo antes.
11. So criar protocolo/tarefa apos confirmacao.
12. Salvar transacionalmente.
13. Informar protocolo/status e proximo passo.

## Respostas Criticas Fixas

As seguintes respostas devem ser montadas pelo backend, nao pela LLM livre:

- Status de protocolo/processo.
- Lista de documentos pendentes.
- Vencimentos e valores.
- Confirmacao de recebimento de documento.
- Criacao de tarefa/protocolo.
- Resumo final.
- Handoff humano.

A LLM pode apenas ajustar tom quando `allow_llm_redraft=true`, sem mudar dados.

## Exemplo De Resumo Antes De Protocolo

```text
Perfeito, vou abrir esse atendimento com a equipe.

Resumo:
• Cliente: [NOME]
• Empresa: [EMPRESA/CNPJ]
• Assunto: [ASSUNTO]
• Competencia: [PERIODO]
• Documento: [DOCUMENTO/STATUS]

Posso abrir o protocolo?
```

## Exemplo De Handoff Humano

```text
Entendi. Esse caso precisa de validacao da equipe para te orientar com seguranca.

Vou encaminhar agora com este resumo:
• Cliente: [NOME]
• Empresa: [EMPRESA]
• Assunto: [ASSUNTO]
• Motivo: [MOTIVO_DO_BLOQUEIO]
```

## Salvamento Transacional

Sempre que o bot criar algo operacional, usar uma unica operacao transacional, como uma RPC:

- Criar protocolo/tarefa.
- Vincular cliente/empresa.
- Registrar documentos recebidos.
- Registrar pendencias.
- Atualizar contexto da conversa.
- Criar notificacao para equipe.

Se qualquer parte falhar, nada deve ser parcialmente salvo. O bot deve informar que encaminhou para validacao humana ou que houve falha operacional.

## Configuracoes Por Tenant

Cada escritorio deve ter configuracoes editaveis:

- Prompt customizado do tenant.
- Horario de atendimento.
- Setores e responsaveis.
- Tipos de documento aceitos.
- Prazos internos.
- Mensagem de handoff.
- Regras comerciais.
- Niveis de urgencia.

Importante: o prompt customizado serve para estilo e regras internas. Ele nao e fonte da verdade para dados operacionais.

## Testes Obrigatorios

Criar cenarios automatizados e manuais para:

- Cliente novo.
- Cliente recorrente.
- Cliente com mais de uma empresa.
- Documento enviado sem competencia.
- Documento enviado com competencia.
- Guia vencida.
- Pedido de prazo.
- Pedido de desconto.
- Duvida fiscal simples.
- Duvida fiscal sensivel.
- Folha de pagamento.
- Demissao.
- Abertura de empresa.
- Alteracao contratual.
- Baixa de empresa.
- Status de protocolo.
- Handoff humano.
- Confirmacao antes de criar tarefa.
- Erro de ferramenta.
- Mensagem com erro de digitacao.

## Criterios De Aceite

- Zero prazo inventado.
- Zero imposto/valor inventado.
- Zero status inventado.
- Zero documento marcado como recebido sem registro.
- Zero protocolo criado sem cliente/empresa/assunto.
- Casos sensiveis sempre chamam humano.
- Cliente recorrente nao precisa repetir dados ja conhecidos.
- Dashboard reflete tudo que o bot prometeu.
- Logs registram interpretacao, bloqueios e ferramentas usadas.

## Temperatura E Modelo

Recomendacao inicial:

- Interpretacao estruturada: temperatura `0.1` a `0.3`.
- Redacao humana segura: temperatura `0.3` a `0.5`.
- Acoes criticas: sem criatividade; usar resposta montada pelo backend.

## Regra Final Para Autonomia

Autonomia nao significa deixar a LLM decidir tudo. Autonomia real e o sistema conseguir atender sozinho porque:

- a LLM entende o cliente;
- o guardiao impede erro;
- o banco confirma a verdade;
- o backend salva corretamente;
- o humano so entra quando realmente precisa.
