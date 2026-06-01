export function normalizeSize(rawSize: string): string | null {
  const map: Record<string, string> = {
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
    S: "S",
    M: "M",
    L: "L",
    XL: "XL",
    XXL: "XXL",
    XXXL: "XXXL",
  };

  const token = rawSize.toUpperCase().replace(/\s+/g, "").trim();
  if (!token) return null;
  if (map[token]) return map[token];

  const parts = token.split("/");
  for (const part of parts) {
    if (map[part]) return map[part];
  }

  const matches = token.match(/(XXXL|XXL|XL|XS|S|M|L|50|48|46|44|42|40|[0-5])/g);
  if (!matches) return null;
  for (const match of matches) {
    if (map[match]) return map[match];
  }

  return null;
}

export function normalizeSizes(rawSizes: string[]): string[] {
  const canonicalOrder = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
  const values = new Set<string>();

  rawSizes.forEach((raw) => {
    const normalized = normalizeSize(raw);
    if (normalized) values.add(normalized);
  });

  return canonicalOrder.filter((size) => values.has(size));
}
