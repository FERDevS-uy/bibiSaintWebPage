export const MAX_FEATURED_PRODUCTS = 8;

export function normalizeFeaturedProductIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("productIds must be an array.");
  if (value.length > 100) throw new Error("Too many product IDs supplied.");
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") throw new Error("Every featured product ID must be a string.");
    const id = item.trim();
    if (!id || id.length > 100 || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("Featured product IDs contain an invalid value.");
    if (!result.includes(id)) result.push(id);
  }
  if (result.length > MAX_FEATURED_PRODUCTS) throw new Error(`Choose up to ${MAX_FEATURED_PRODUCTS} featured products.`);
  return result;
}

export function orderFeaturedProductRows<T extends { id: string }>(ids: string[], rows: T[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

export function chooseFeaturedProducts<T>(editorial: T[], fallback: T[]): T[] {
  return editorial.length ? editorial : fallback;
}
