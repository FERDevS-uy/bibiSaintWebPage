export function parsePrice(rawPrice: string): number {
  const value = String(rawPrice || "").trim().replace(/\s+/g, "");
  if (!value) return 0;

  const hasComma = value.includes(",");
  const hasDot = value.includes(".");

  if (hasComma && hasDot) {
    // Formato: 1.234,56
    return Number(value.replace(/\./g, "").replace(",", "."));
  }

  if (hasComma) {
    // Formato: 1234,56
    return Number(value.replace(",", "."));
  }

  if (hasDot) {
    const parts = value.split(".");
    const looksLikeThousands =
      parts.length > 1 && parts.slice(1).every((part) => part.length === 3);

    if (looksLikeThousands) {
      // Formato: 1.234 o 12.345.678
      return Number(parts.join(""));
    }
  }

  return Number(value);
}

export function formatPrice(value: number): string {
  const integerValue = Number.isFinite(value) ? Math.round(value) : 0;
  return integerValue.toLocaleString("es-UY");
}
