-- 001_initial_schema.sql
-- Migración inicial: tablas del catálogo para Supabase.
-- Ejecutar desde el SQL Editor de Supabase o vía `supabase db push`.

-- 1. PRODUCTS (tabla principal)
--    source: 'scraper' | 'manual'
--    active: false = soft delete
--    auto_update_price: solo para productos manuales, el scraper puede actualizar price si true

create table if not exists public.products (
  id              text primary key,
  name            text not null,
  description     text not null default '',
  price           text not null default '0',
  img             jsonb not null default '[]'::jsonb,
  categories      jsonb not null default '{}'::jsonb,
  payment_link    jsonb not null default '[]'::jsonb,
  relacionados    jsonb not null default '[]'::jsonb,
  en_oferta       boolean not null default false,
  colors          jsonb default '[]'::jsonb,
  source          text not null default 'manual' check (source in ('scraper', 'manual')),
  active          boolean not null default true,
  external_id     text,
  auto_update_price boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_products_active on public.products (active);
create index idx_products_en_oferta on public.products (en_oferta) where active = true;
create index idx_products_source on public.products (source);
create unique index idx_products_external_id on public.products (external_id) where external_id is not null;

-- 2. PRODUCT_IMAGES
--    Almacena metadatos de cada imagen. El archivo físico vive en Supabase Storage (bucket product-images).

create table if not exists public.product_images (
  id          bigint generated always as identity primary key,
  product_id  text not null references public.products(id) on delete cascade,
  url         text not null,
  position    smallint not null default 0,
  width       int,
  height      int,
  file_size   int,       -- bytes
  created_at  timestamptz not null default now()
);

create index idx_product_images_product on public.product_images (product_id, position);

-- 3. PRODUCT_RELATED (relación bidireccional)
--    Se inserta una fila por cada par (product_id, related_id).
--    Siempre se crean en ambas direcciones para simplificar queries.

create table if not exists public.product_related (
  product_id  text not null references public.products(id) on delete cascade,
  related_id  text not null references public.products(id) on delete cascade,
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  primary key (product_id, related_id)
);

create index idx_product_related_product on public.product_related (product_id);
create index idx_product_related_related on public.product_related (related_id);

-- 4. SCRAPER_DIFFS
--    Cuando el scraper detecta diferencias en un producto source: 'manual',
--    registra la diff aquí para revisión del admin. No se envían correos.

create table if not exists public.scraper_diffs (
  id          bigint generated always as identity primary key,
  product_id  text not null references public.products(id) on delete cascade,
  field_name  text not null,       -- ej: 'price', 'description', 'images'
  old_value   jsonb,
  new_value   jsonb,
  detected_at timestamptz not null default now(),
  reviewed    boolean not null default false,
  reviewed_at timestamptz
);

create index idx_scraper_diffs_product on public.scraper_diffs (product_id);
create index idx_scraper_diffs_unreviewed on public.scraper_diffs (reviewed) where reviewed = false;

-- 5. ADMIN PROFILES
--    Se crea un perfil por cada admin de Supabase Auth.
--    La cuenta inicial se crea desde el dashboard de Supabase.

create table if not exists public.admin_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  name        text,
  created_at  timestamptz not null default now(),
  last_login  timestamptz
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_related enable row level security;
alter table public.scraper_diffs enable row level security;
alter table public.admin_profiles enable row level security;

-- Lectura pública: todos los productos activos son visibles sin autenticación
create policy "products_select_public"
  on public.products for select
  using (active = true);

-- Lectura pública de imágenes
create policy "product_images_select_public"
  on public.product_images for select
  using (true);

-- Lectura pública de relacionados
create policy "product_related_select_public"
  on public.product_related for select
  using (true);

-- Admin: full CRUD sobre products (solo admins de admin_profiles)
create policy "products_admin_all"
  on public.products for all
  using (auth.uid() IN (SELECT id FROM public.admin_profiles))
  with check (auth.uid() IN (SELECT id FROM public.admin_profiles));

create policy "product_images_admin_all"
  on public.product_images for all
  using (auth.uid() IN (SELECT id FROM public.admin_profiles))
  with check (auth.uid() IN (SELECT id FROM public.admin_profiles));

create policy "product_related_admin_all"
  on public.product_related for all
  using (auth.uid() IN (SELECT id FROM public.admin_profiles))
  with check (auth.uid() IN (SELECT id FROM public.admin_profiles));

create policy "scraper_diffs_admin_all"
  on public.scraper_diffs for all
  using (auth.uid() IN (SELECT id FROM public.admin_profiles))
  with check (auth.uid() IN (SELECT id FROM public.admin_profiles));

create policy "admin_profiles_select_self"
  on public.admin_profiles for select
  using (auth.uid() = id);

create policy "admin_profiles_insert_self"
  on public.admin_profiles for insert
  with check (auth.uid() = id);

-- ============================================================
-- TRIGGER: updated_at automático
-- ============================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ============================================================
-- STORAGE: bucket para imágenes de productos
-- ============================================================

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Lectura pública de imágenes
create policy "product_images_storage_select"
  on storage.objects for select
  using (bucket_id = 'product-images');

-- Solo admin puede subir/eliminar
create policy "product_images_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'product-images'
    and auth.role() = 'authenticated'
  );

create policy "product_images_storage_delete"
  on storage.objects for delete
  using (
    bucket_id = 'product-images'
    and auth.role() = 'authenticated'
  );
