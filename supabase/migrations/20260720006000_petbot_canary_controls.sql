-- PetBot rollout controls. The default is deliberately canary: no contact is
-- autonomous until an admin explicitly opts in the tenant or allowlists a phone.

alter table public.settings
  add column if not exists petbot_autonomy_mode text not null default 'canary',
  add column if not exists petbot_autonomy_allowlist jsonb not null default '[]'::jsonb;

alter table public.settings
  drop constraint if exists settings_petbot_autonomy_mode_check;
alter table public.settings
  add constraint settings_petbot_autonomy_mode_check
  check (petbot_autonomy_mode in ('assist', 'canary', 'enabled'));
