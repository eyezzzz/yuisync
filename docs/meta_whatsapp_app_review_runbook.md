# Meta WhatsApp App Review — YuiSync

## Objetivo

Preparar e gravar as evidências solicitadas pela Meta para:

- `whatsapp_business_messaging`
- `whatsapp_business_management`
- `business_management`

O YuiSync usa token de usuário do sistema no backend. O token nunca é enviado ao navegador.

## Preparação antes da gravação

1. Execute no Supabase a migration:

   `supabase/migrations/20260803090000_meta_whatsapp_app_review.sql`

2. Confirme na Vercel as variáveis server-side:

   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_BUSINESS_ACCOUNT_ID`
   - `WHATSAPP_ACCESS_TOKEN`
   - `WHATSAPP_VERIFY_TOKEN`
   - `WHATSAPP_APP_SECRET`
   - `WHATSAPP_GRAPH_VERSION=v25.0`
   - `META_HOSTED_SIGNUP_URL`

3. O `WHATSAPP_ACCESS_TOKEN` deve ser um token de usuário do sistema com os ativos da WABA atribuídos e as permissões aprovadas ou disponíveis no modo de desenvolvimento.

4. Entre no YuiSync como administrador do módulo Petshop e abra:

   `PetShop CRM → Administração → Meta / WhatsApp`

5. Salve o `WhatsApp Business Account ID` e o `Phone Number ID` na primeira seção, caso ainda não apareçam.

6. Clique em **Subscribe WABA to app webhook** e confirme a resposta de sucesso.

## Vídeo 1 — whatsapp_business_messaging

Grave a tela do YuiSync e a interface do WhatsApp recebendo a mensagem.

1. Mantenha a interface do YuiSync em inglês na página `Meta / WhatsApp`.
2. Mostre o status **Messaging API** ativo.
3. No WhatsApp do destinatário, envie primeiro uma mensagem para o número comercial para abrir a janela de atendimento, quando necessário.
4. No YuiSync, informe o número do destinatário em formato internacional, somente números.
5. Clique em **Send through WhatsApp Cloud API**.
6. Mostre a confirmação e o Meta message ID no YuiSync.
7. Mostre a mesma mensagem recebida no WhatsApp Web ou aplicativo móvel.

## Vídeo 2 — whatsapp_business_management

Este vídeo deve ser separado do vídeo de envio.

1. Abra novamente `Meta / WhatsApp`.
2. Mostre o status **Template Management** ativo e o WABA ID.
3. Preencha um nome inédito para o modelo.
4. Selecione categoria `UTILITY` e idioma `English (US)`.
5. Clique em **Create template through Graph API**.
6. Mostre a resposta de sucesso, o ID devolvido pela Meta e o status inicial.
7. Clique em **Refresh templates**.
8. Mostre o modelo criado na tabela **Templates returned by Meta**.

## Observações para o envio da análise

Use uma observação equivalente a:

> YuiSync is a server-to-server technology provider integration. The business completes Meta Hosted Embedded Signup. After onboarding, the YuiSync backend uses a system-user access token to call the WhatsApp Cloud API. The token is never exposed in the browser. The attached messaging video shows the app sending a WhatsApp message and the recipient receiving it. The separate management video shows the app creating and listing a message template through the Graph API.

Não solicite `public_profile` como caso de uso. O YuiSync não lê nome, foto ou outros dados de perfil do Facebook.

## Política de Privacidade

Confirme em janela anônima:

- `/privacidade`
- `/termos`
- `/exclusao-de-dados`

As páginas devem abrir diretamente, sem login e sem redirecionamento para a página inicial.
