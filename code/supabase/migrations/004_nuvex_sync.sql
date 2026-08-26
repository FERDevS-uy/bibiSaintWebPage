-- 004_nuvex_sync.sql
-- Soporte de base de datos para el sync de Nuvex desde el panel admin:
--  - preview_tokens: nonce/jti consumido para evitar replay de previews firmados.
--  - products.temporary_price: precio manual temporal cargado por el admin
--    (el próximo precio válido de Nuvex lo reemplaza).
-- Idempotente: seguro de re-ejecutar. Ejecutar desde el SQL Editor o `supabase db push`.

-- ============================================================
-- 1) preview_tokens (anti-replay de previews firmados)
-- ============================================================

create table if not exists public.preview_tokens (
  jti        text primary key,
  actor_id   uuid,                                  -- admin que generó el preview
  plan_hash  text not null,
  expires_at timestamptz not null,
  consumed   boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.preview_tokens is
  'Registra los tokens de preview (jti) usados para evitar replay del apply de sync de proveedores.';

-- Limpieza eficiente de tokens vencidos (el flujo de apply y un job periódico la usan).
create index if not exists idx_preview_tokens_expires_at
  on public.preview_tokens (expires_at);

-- RLS: solo admins pueden leer/insertar/marcar preview_tokens.
alter table public.preview_tokens enable row level security;

drop policy if exists "preview_tokens_admin_all" on public.preview_tokens;
create policy "preview_tokens_admin_all"
  on public.preview_tokens for all
  using (auth.uid() in (select id from public.admin_profiles))
  with check (auth.uid() in (select id from public.admin_profiles));

-- ============================================================
-- 2) products.temporary_price (precio manual temporal)
-- ============================================================

alter table public.products
  add column if not exists temporary_price text;

comment on column public.products.temporary_price is
  'Precio manual temporal cargado por el admin cuando Nuvex no expone precio. '
  'El próximo precio válido de Nuvex lo reemplaza; price sigue siendo el vigente.';

-- ============================================================
-- 3) RLS / lectura autorizada
-- ============================================================
-- La lectura de comparación del preview/apply usa service role (getSupabaseAdmin),
-- que elude RLS. La lectura pública sigue exponiendo solo active = true (policy
-- existente "products_select_public"); NO se habilitan lecturas de inactivos por anon.
-- No se requieren cambios de policy para esto.

-- ============================================================
-- 4) Índices / estrategia de consulta para productos Nuvex
-- ============================================================
-- Los productos Nuvex se identifican por id numérico (PK) y, en fallback, por
-- payment_link que contenga "nuvex.uy" (payment_link es jsonb[]).
create index if not exists idx_products_payment_link
  on public.products using gin (payment_link jsonb_path_ops);

comment on index public.idx_products_payment_link is
  'Facilita detectar productos Nuvex por URL en payment_link para la identificación por nombre/ausentes.';
