# WhatsApp Business App Coexistence no YuiSync

## Objetivo

Permitir que cada cliente mantenha o mesmo número no WhatsApp Business App enquanto o YuiSync usa a WhatsApp Business Platform para automação, caixa compartilhada e Luna.

A integração deve preservar três garantias:

1. o número continua pertencendo ao cliente;
2. mensagens históricas nunca disparam respostas automáticas;
3. conversas só entram no processo de melhoria da Luna depois de anonimização e aprovação.

## Base oficial da Meta

A coleção oficial **WhatsApp Business Platform**, publicada pela Meta no Postman, define o Embedded Signup como o fluxo de onboarding de clientes para Tech Providers e informa que a liberação exige App Review e acesso avançado às permissões empresariais do WhatsApp.

Referência oficial:

- Meta / WhatsApp Business Platform — Embedded Signup: `https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup`

A documentação pública oficial localizada confirma o fluxo de Embedded Signup e a descoberta de WABAs compartilhadas. Os detalhes operacionais mais novos de Coexistência, histórico, `history`, `smb_message_echoes` e `smb_app_state_sync` nem sempre aparecem indexados nas páginas públicas da Meta. Portanto, formatos de payload devem ser validados com eventos reais do ambiente de teste antes de promover mensagens para as tabelas de atendimento.

## Escopo deste patch

Este patch prepara a recepção segura dos campos de webhook ligados à coexistência:

- `history`;
- `smb_message_echoes`;
- `smb_app_state_sync`.

Os eventos são interceptados antes do webhook conversacional atual. O payload é autenticado com `X-Hub-Signature-256`, associado ao tenant pelo `phone_number_id` e armazenado integralmente.

Mensagens candidatas do campo `history` são normalizadas para uma fila isolada com:

- `historical = true`;
- `should_reply = false`;
- `luna_status = pending_anonymization`.

Nenhuma mensagem histórica é encaminhada para `respondToChatMessage`, transcrição, visão ou envio de resposta.

## Modelo de dados

### `whatsapp_integrations`

Um registro por número conectado, contendo o tenant, WABA, `phone_number_id`, modalidade de conexão e estados de sincronização.

O token não deve ser salvo em texto puro. `token_reference` deverá apontar para um segredo criptografado ou cofre externo em uma etapa posterior.

### `whatsapp_coexistence_events`

Log bruto e auditável dos eventos de coexistência. Serve para validar o formato real dos payloads recebidos antes de ampliar o parser.

### `whatsapp_history_messages`

Fila isolada do histórico. Não é a tabela de conversas ativas. A promoção para dataset da Luna exige anonimização e revisão.

## Pipeline planejado para a Luna

```text
webhook assinado
  -> evento bruto auditável
  -> mensagem histórica isolada
  -> anonimização determinística
  -> classificação de intenção/cenário
  -> revisão humana por amostra
  -> cenário de regressão da Luna
```

A anonimização deverá remover ou substituir, no mínimo:

- telefones e identificadores do WhatsApp;
- CPF/CNPJ;
- e-mails;
- CEP e endereços;
- nomes próprios quando não forem essenciais ao cenário;
- links e identificadores de pagamento.

O dataset final deve preservar apenas a estrutura do atendimento: intenção, contexto operacional, decisão correta, ferramenta esperada e resposta esperada.

## Próximas etapas

1. Aplicar a migração em Preview e cadastrar a integração do tenant de teste.
2. Assinar `history`, `smb_message_echoes` e `smb_app_state_sync` somente depois do deploy deste patch.
3. Executar o Embedded Signup com Coexistência em um número de teste elegível.
4. Capturar payloads reais e ajustar o normalizador sem quebrar o armazenamento bruto.
5. Implementar troca de código e armazenamento seguro de credenciais por tenant.
6. Implementar anonimização, aprovação e exportação para cenários da Luna.
7. Só então habilitar a importação de histórico para clientes externos.

## Critérios de aceite da primeira fase

- webhook comum continua chegando ao runtime atual;
- eventos de coexistência são autenticados e armazenados;
- mensagens históricas possuem `should_reply = false` por restrição de banco;
- nenhuma chamada à Luna ocorre no caminho de histórico;
- duplicatas são ignoradas por `(tenant_id, external_message_id)`;
- o evento bruto permanece disponível para auditoria e evolução do parser.
