// Normalización unificada de talles (elimina duplicación entre normalizeSize y normalizeLegacySize)

const CANONICAL_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] as const;

const SIZE_ALIAS_MAP: Record<string, string> = {
  "0": "XS",
  "1": "S",
  "2": "M",
  "3": "L",
  "4": "XL",
  "5": "XXL",
  "40": "S",
  "42": "M",
  "44": "L",
  "46": "XL",
  "48": "XXL",
  "50": "XXXL",
  XS: "XS",
  P: "S",
  S: "S",
  M: "M",
  G: "L",
  GG: "XL",
  XG: "XL",
  L: "L",
  XL: "XL",
  XXL: "XXL",
  XXXL: "XXXL",
};

/**
 * Normaliza un talle crudo a su forma canónica (XS, S, M, L, XL, XXL, XXXL)
 * Combina la lógica de normalizeSize (live) y normalizeLegacySize (fallback)
 */
export function normalizeSize(rawSize: string): string | null {
  const token = String(rawSize || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!token) return null;

  // Match directo en el mapa
  if (SIZE_ALIAS_MAP[token]) return SIZE_ALIAS_MAP[token];

  // Probar partes separadas por "/"
  const parts = token.split("/");
  for (const part of parts) {
    if (SIZE_ALIAS_MAP[part]) return SIZE_ALIAS_MAP[part];
  }

  // Regex para tokens sueltos dentro de strings compuestos
  const matches = token.match(/(XXXL|XXL|XL|XS|S|M|L|50|48|46|44|42|40|[0-5])/g);
  if (!matches) return null;

  for (const match of matches) {
    if (SIZE_ALIAS_MAP[match]) return SIZE_ALIAS_MAP[match];
  }

  return null;
}

/**
 * Normaliza un array de talles crudos y devuelve solo los canónicos únicos, ordenados
 */
export function normalizeSizes(rawSizes: string[]): string[] {
  const values = new Set<string>();

  rawSizes.forEach((raw) => {
    const normalized = normalizeSize(raw);
    if (normalized) values.add(normalized);
  });

  return CANONICAL_ORDER.filter((size) => values.has(size));
}

/**
 * Detecta si la lista de talles crudos indica explícitamente "sin talle" / talla única
 */
export function hasExplicitNoSize(rawSizes: string[]): boolean {
  return rawSizes.some((raw) => {
    const token = String(raw ?? "").trim().toLowerCase();
    return (
      token === "/" ||
      token === "-" ||
      token === "sin talle" ||
      token === "unico" ||
      token === "único" ||
      token === "one size"
    );
  });
}

/**
 * Orden canónico exportado para consumidores que lo necesiten
 */
export { CANONICAL_ORDER };