import { getSupabaseAdmin } from "../supabase";
import { invalidateAllProductCaches } from "../products";
import { bumpCatalogVersion } from "../catalog/edgeCache";

const NUVEX_KEY = "nuvex";
const BATCH_SIZE = 200;

export async function isNuvexCatalogEnabled(): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("provider_catalog_settings")
    .select("enabled")
    .eq("provider_key", NUVEX_KEY)
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer el estado de Nuvex: ${error.message}`);
  return data?.enabled !== false;
}

/** Activa/desactiva el catálogo Nuvex usando el identificador numérico de sus productos. */
export async function setNuvexCatalogEnabled(enabled: boolean): Promise<{ enabled: boolean; affected: number }> {
  const admin = getSupabaseAdmin();
  const { data: rows, error: readError } = await admin.from("products").select("id");
  if (readError) throw new Error(`No se pudieron leer los productos: ${readError.message}`);

  const ids = (rows ?? [])
    .map((row) => String(row.id))
    .filter((id) => /^\d+$/.test(id));

  let affected = 0;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const { error } = await admin.from("products").update({ active: enabled }).in("id", batch);
    if (error) throw new Error(`No se pudo actualizar el catálogo Nuvex: ${error.message}`);
    affected += batch.length;
  }

  const { error: settingError } = await admin
    .from("provider_catalog_settings")
    .upsert({ provider_key: NUVEX_KEY, enabled }, { onConflict: "provider_key" });
  if (settingError) throw new Error(`No se pudo guardar el estado de Nuvex: ${settingError.message}`);

  invalidateAllProductCaches();
  await bumpCatalogVersion();

  return { enabled, affected };
}
