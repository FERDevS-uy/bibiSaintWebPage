-- Control administrativo de catálogos completos.
-- Nuvex se identifica por productos cuyo id es exclusivamente numérico.

create table if not exists public.provider_catalog_settings (
  provider_key text primary key,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.provider_catalog_settings (provider_key, enabled)
values ('nuvex', true)
on conflict (provider_key) do nothing;

alter table public.provider_catalog_settings enable row level security;

drop policy if exists "provider_catalog_settings_admin_all" on public.provider_catalog_settings;
create policy "provider_catalog_settings_admin_all"
  on public.provider_catalog_settings for all
  using (auth.uid() in (select id from public.admin_profiles))
  with check (auth.uid() in (select id from public.admin_profiles));

drop trigger if exists trg_provider_catalog_settings_updated_at on public.provider_catalog_settings;
create trigger trg_provider_catalog_settings_updated_at
  before update on public.provider_catalog_settings
  for each row execute function public.set_updated_at();
