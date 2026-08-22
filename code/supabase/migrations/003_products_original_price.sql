-- 003_products_original_price.sql
-- Agrega original_price (precio anterior / para tachar) a public.products.
--  - text nullable: solo se completa cuando hay descuento real (en_oferta = true).
--  - Idempotente: seguro de re-ejecutar.
-- Ejecutar desde el SQL Editor de Supabase o vía `supabase db push`.

alter table public.products
  add column if not exists original_price text;

comment on column public.products.original_price is
  'Precio anterior (tachado) cuando hay descuento; NULL si no hay oferta.';

-- Tuplas existentes: históricamente no se persistía price1 (precio original),
-- por lo que no se puede reconstruir su valor real. Se normaliza el campo:
--  - en_oferta = false => original_price = NULL (evita tachados fantasma).
--  - en_oferta = true  => se deja NULL y lo completa el próximo sync/apply
--    de Martina o el admin desde el panel.
update public.products
   set original_price = null
 where en_oferta = false
   and original_price is not null;