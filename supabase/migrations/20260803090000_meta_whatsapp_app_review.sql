-- YuiSync - Meta WhatsApp App Review support
-- Adds the non-secret WABA asset ID and prevents authenticated browser clients
-- from writing WhatsApp credentials through the legacy helper functions.

begin;

alter table public.tenant_bot_channels
  add column if not exists whatsapp_business_account_id text;

create index if not exists idx_tenant_bot_channels_whatsapp_waba
  on public.tenant_bot_channels (whatsapp_business_account_id)
  where channel = 'whatsapp'
    and active = true
    and whatsapp_business_account_id is not null;

comment on column public.tenant_bot_channels.whatsapp_business_account_id is
  'Meta WhatsApp Business Account ID. This is an asset identifier, not an access token.';

-- Credentials must be written only by trusted backend code using service_role.
-- The previous migration granted these helpers to every authenticated user.
revoke execute on function public.upsert_tenant_whatsapp_bot_channel(
  uuid, text, text, text, text, text, text, boolean
) from public, anon, authenticated;

grant execute on function public.upsert_tenant_whatsapp_bot_channel(
  uuid, text, text, text, text, text, text, boolean
) to service_role;

revoke execute on function public.upsert_single_active_whatsapp_bot_channel(
  text, text, text, text, text, text, boolean
) from public, anon, authenticated;

grant execute on function public.upsert_single_active_whatsapp_bot_channel(
  text, text, text, text, text, text, boolean
) to service_role;

commit;
