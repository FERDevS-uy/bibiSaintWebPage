-- Editorial storefront selection; deliberately separate from the generated catalog read model.
create table if not exists public.featured_products (
  id smallint primary key check (id = 1),
  product_ids text[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint featured_products_limit check (cardinality(product_ids) <= 8)
);

insert into public.featured_products (id, product_ids)
values (1, '{}')
on conflict (id) do nothing;

alter table public.featured_products enable row level security;
revoke all on public.featured_products from public, anon, authenticated;
grant select on public.featured_products to anon, authenticated;
grant select, insert, update, delete on public.featured_products to service_role;

create policy "Public can read featured product IDs"
  on public.featured_products for select
  to anon, authenticated
  using (true);
