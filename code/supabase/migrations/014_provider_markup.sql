-- 014_provider_markup.sql
-- Configurable profit margin (markup) per provider.
--
-- markup is a numeric multiplier applied over the provider base price
-- (e.g. 1.22 = +22%). NULL (or an absent row) means "use the code default"
-- from DEFAULT_PROVIDER_MARKUP in src/config/providerMargins.ts, so the app
-- keeps working even without rows. RLS already applies to this table
-- (admin-only, migration 012); no new policies needed.
--
-- Idempotent: safe to re-run (alter table ... if not exists).

alter table public.provider_catalog_settings
  add column if not exists markup numeric(5,3);

comment on column public.provider_catalog_settings.markup is
  'Profit markup multiplier per provider (e.g. 1.22 = +22%). NULL falls back to the code default.';