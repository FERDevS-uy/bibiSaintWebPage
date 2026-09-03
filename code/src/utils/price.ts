export function parsePrice(rawPrice: string): number {
  const value = String(rawPrice || "").trim().replace(/\s+/g, "");
  if (!value) return 0;

  const hasComma = value.includes(",");
  const hasDot = value.includes(".");

  if (hasComma && hasDot) {
    // Detectamos cuál separador aparece último:
    // - "1.234,56": punto de miles, coma decimal
    // - "1,200.9": coma de miles, punto decimal
    const lastComma = value.lastIndexOf(",");
    const lastDot = value.lastIndexOf(".");
    if (lastDot > lastComma) {
      // Punto decimal al final: la coma es de miles → quitar comas
      return Number(value.replace(/,/g, ""));
    }
    // Coma decimal al final: el punto es de miles → quitar puntos y usar coma
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

export type PriceInput = string | number | null | undefined;

function parsePriceInput(rawPrice: PriceInput): number {
  if (typeof rawPrice === "number") return rawPrice;
  return parsePrice(String(rawPrice ?? ""));
}

export function normalizeOfferOriginalPrice(
  rawOriginalPrice: PriceInput,
  rawCurrentPrice: PriceInput,
): number | null {
  const currentPrice = parsePriceInput(rawCurrentPrice);
  const originalPrice = parsePriceInput(rawOriginalPrice);

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;
  if (!Number.isFinite(originalPrice) || originalPrice <= currentPrice) return null;

  return originalPrice;
}

export function formatPrice(value: number): string {
  const integerValue = Number.isFinite(value) ? Math.round(value) : 0;
  return integerValue.toLocaleString("es-UY");
}
