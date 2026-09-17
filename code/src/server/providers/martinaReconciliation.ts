import type { MartinaAvailability } from "./martinaAvailability.ts";
import type { ProductRow } from "./utils.ts";
import type { SyncExistingProduct } from "./martinaSync.ts";

export const MARTINA_ABSENT_LIMIT = 20;
export const MARTINA_ABSENT_CONCURRENCY = 3;

export interface MartinaObservation {
  availability: MartinaAvailability;
  reason: string;
  evidence?: unknown[];
}

export function isMartinaManaged(product: SyncExistingProduct): boolean {
  return /^mdt-\d+$/.test(product.id);
}

export async function verifyAbsentMartinaProducts(
  products: ProductRow[],
  existing: Map<string, SyncExistingProduct>,
  _campaignCode: string,
  _lookup: (id: string, campaignCode: string) => Promise<unknown[]>,
  _takeDetailLookup: () => boolean = () => true,
): Promise<Map<string, MartinaObservation>> {
  const incomingIds = new Set(products.map((product) => product.id));
  const absent = [...existing.values()]
    .filter(
      (product) =>
        product.active === true &&
        isMartinaManaged(product) &&
        !incomingIds.has(product.id),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  const observations = new Map<string, MartinaObservation>();
  for (const product of absent) {
    observations.set(product.id, {
      availability: "unavailable",
      reason: "Sin stock: no figura en el catálogo actual",
    });
  }
  return observations;
}

export function martinaChanges(
  product: ProductRow,
  previous: SyncExistingProduct,
): Record<string, unknown> {
  if (!isMartinaManaged(previous) || previous.active !== true) return {};
  if (!product.active) return { active: false };
  const changes: Record<string, unknown> = {};
  // The internal category is a curated business decision. Martina's parent
  // and line metadata must never reassign an existing product.
  if (
    previous.auto_update_price === true &&
    !previous.temporary_price &&
    product.price
  ) {
    if (previous.price !== product.price) changes.price = product.price;
    if (previous.original_price !== (product.original_price ?? null))
      changes.original_price = product.original_price ?? null;
    if (previous.en_oferta !== Boolean(product.en_oferta))
      changes.en_oferta = Boolean(product.en_oferta);
  }
  return changes;
}

export async function readActiveMartinaProducts(client: {
  from: (table: string) => any;
}): Promise<Map<string, SyncExistingProduct>> {
  const existing = new Map<string, SyncExistingProduct>();
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("products")
      .select(
        "id,name,price,en_oferta,original_price,colors,active,source,external_id,auto_update_price,temporary_price",
      )
      .eq("active", true)
      .like("id", "mdt-%")
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (error || !Array.isArray(data))
      throw new Error("No se pudo leer el catálogo activo de Martina");
    for (const row of data) {
      if (isMartinaManaged(row))
        existing.set(row.id, {
          ...row,
          price: String(row.price ?? ""),
          original_price:
            row.original_price == null ? null : String(row.original_price),
        });
    }
    if (data.length < pageSize) break;
  }
  return existing;
}
