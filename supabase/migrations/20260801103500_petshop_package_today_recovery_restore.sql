begin;

-- Restaura exatamente o horário originalmente escolhido pelo usuário após a
-- 1034 instalar a regra definitiva em que somente datas anteriores a hoje são
-- tratadas como legado.
do $$
begin
  if to_regclass('public._yuisync_package_today_recovery_stage') is null then
    return;
  end if;

  update public.client_subscriptions subscription
  set first_appointment_at = stage.original_first_appointment_at,
      updated_at = now()
  from public._yuisync_package_today_recovery_stage stage
  where subscription.id = stage.subscription_id
    and subscription.tenant_id = stage.tenant_id;
end;
$$;

drop table if exists public._yuisync_package_today_recovery_stage;

commit;
