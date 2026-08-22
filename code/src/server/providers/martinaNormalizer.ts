// martinaNormalizer.ts
// ProductNormalizer: función pura que convierte price/price1 de Martina en
// el precio vigente + precio original + flag de oferta.
//
// Regla observada en Martina: `price1 > price` => hay descuento.
// Sin descuento => original_price = null y en_oferta = false (se evita dejar
// ofertas fantasma si el producto antes estaba en oferta).

import { parsePrice } from "./utils";

export interface NormalizedPrice {
  /** Precio vigente formateado (ej: "1.599"). */
  price: string;
  /** Precio original (tachado) cuando hay descuento; null en otro caso. */
  originalPrice: string | null;
  enOferta: boolean;
}

function toNumber(formatted: string): number {
  if (!formatted) return 0;
  const numeric = parseFloat(formatted.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numeric) ? numeric : 0;
}

export function normalizeProductPrice(
  priceRaw: unknown,
  price1Raw: unknown,
  multiplier = 1,
): NormalizedPrice {
  const price = parsePrice(String(priceRaw ?? ""), multiplier);
  const price1 = parsePrice(String(price1Raw ?? ""), multiplier);

  const priceNum = toNumber(price);
  const price1Num = toNumber(price1);
  const enOferta = priceNum > 0 && price1Num > priceNum;

  return {
    price,
    originalPrice: enOferta ? price1 : null,
    enOferta,
  };
}