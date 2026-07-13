-- 002_security_hardening.sql
-- Endurece permisos de admin y storage para evitar escalada de privilegios.

-- 1) Quitar autoalta de admin por el propio usuario autenticado.
drop policy if exists "admin_profiles_insert_self" on public.admin_profiles;

-- 2) Endurecer storage para que solo admins reales puedan escribir/borrar/actualizar.
drop policy if exists "product_images_storage_insert" on storage.objects;
drop policy if exists "product_images_storage_delete" on storage.objects;
drop policy if exists "product_images_storage_update" on storage.objects;

create policy "product_images_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'product-images'
    and auth.uid() in (select id from public.admin_profiles)
  );

create policy "product_images_storage_delete"
  on storage.objects for delete
  using (
    bucket_id = 'product-images'
    and auth.uid() in (select id from public.admin_profiles)
  );

create policy "product_images_storage_update"
  on storage.objects for update
  using (
    bucket_id = 'product-images'
    and auth.uid() in (select id from public.admin_profiles)
  )
  with check (
    bucket_id = 'product-images'
    and auth.uid() in (select id from public.admin_profiles)
  );

-- Nota operativa (fuera de SQL): deshabilitar Sign Up público desde Supabase Dashboard
-- Authentication -> Providers -> Email -> Disable Signups.
