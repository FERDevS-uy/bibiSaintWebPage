// Columnas editables del catálogo. Cualquier otra propiedad enviada desde
// el cliente se descarta antes de tocar Supabase (previene mass assignment).
export const PRODUCT_WRITABLE_COLUMNS = [
  "name",
  "description",
  "price",
  "img",
  "categories",
  "payment_link",
  "relacionados",
  "en_oferta",
  "colors",
  "source",
  "active",
  "external_id",
  "auto_update_price",
] as const;

export function pickWritable<T extends Record<string, unknown>>(
  body: T,
  columns: readonly string[] = PRODUCT_WRITABLE_COLUMNS,
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const key of columns) {
    if (Object.prototype.hasOwnProperty.call(body ?? {}, key)) {
      clean[key] = body[key];
    }
  }
  return clean;
}
