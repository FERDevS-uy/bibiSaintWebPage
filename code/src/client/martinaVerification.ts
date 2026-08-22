// martinaVerification.ts (client)
// Verificación oficial del precio de un producto Martina a través del endpoint
// interno /api/martina/product-price.
//
// - Comparte una ÚNICA promesa por producto: la página y el carrito reutilizan
//   la misma verificación en curso sin duplicar consultas a Martina.
// - Cachea el último resultado verificado por sesión.

import { withBasePath } from "../utils/basePath";

export interface MartinaColorDetail {
  id: number;
  hex: string;
  name: string;
  rawSizes: string[];
  sizes: string[];
}

export interface MartinaProductPrice {
  provider: "martina";
  price: string;
  originalPrice: string | null;
  isDiscount: boolean;
  inStock: boolean | null;
  colors: MartinaColorDetail[];
  sizes: string[];
  campaignCode: string;
  verifiedAt: number;
}

let active: { baseId: string; promise: Promise<MartinaProductPrice | null> } | null = null;
const lastResults = new Map<string, MartinaProductPrice>();

function baseIdOf(productId: string): string {
  return String(productId || "").split("__")[0];
}

/** Devuelve la verificación en curso para el producto, si existe. */
export function getActiveMartinaVerification(
  productId: string,
): Promise<MartinaProductPrice | null> | null {
  if (active && active.baseId === baseIdOf(productId)) return active.promise;
  return null;
}

/** Último resultado verificado para el producto en esta sesión. */
export function getLastMartinaResult(productId: string): MartinaProductPrice | null {
  return lastResults.get(baseIdOf(productId)) ?? null;
}

/** true si existe un precio verificado (para no sobrescribirlo tras hidratación). */
export function hasVerifiedPrice(productId: string): boolean {
  return lastResults.has(baseIdOf(productId));
}

/**
 * Verifica (o reutiliza) el precio oficial de un producto Martina.
 * Nunca rechaza: ante cualquier fallo devuelve null.
 */
export async function fetchMartinaProductPrice(
  productId: string,
): Promise<MartinaProductPrice | null> {
  const baseId = baseIdOf(productId);

  const existing = getActiveMartinaVerification(baseId);
  if (existing) return existing;

  const promise = doFetch(baseId).catch(() => null);
  active = { baseId, promise };
  const result = await promise;
  if (active?.promise === promise) active = null;
  return result;
}

async function doFetch(baseId: string): Promise<MartinaProductPrice | null> {
  try {
    const endpoint = new URL(withBasePath("/api/martina/product-price"), window.location.origin);
    endpoint.searchParams.set("productId", baseId);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(endpoint.toString(), {
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return null;

      const payload = await response.json();
      if (!payload || typeof payload !== "object") return null;

      const result: MartinaProductPrice = {
        provider: "martina",
        price: String(payload.price ?? "").trim(),
        originalPrice: payload.originalPrice == null ? null : String(payload.originalPrice),
        isDiscount: Boolean(payload.isDiscount),
        inStock: typeof payload.inStock === "boolean" ? payload.inStock : null,
        colors: Array.isArray(payload.colors) ? payload.colors : [],
        sizes: Array.isArray(payload.sizes) ? payload.sizes : [],
        campaignCode: String(payload.campaignCode ?? ""),
        verifiedAt: Date.now(),
      };
      lastResults.set(baseId, result);
      return result;
    } finally {
      window.clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

/**
 * Precio que debe usar el carrito para un producto Martina:
 * - si hay verificación en curso → espera la misma promesa;
 * - si ya se verificó → usa ese resultado;
 * - si falló o nunca se verificó → usa el fallback (precio sincronizado).
 */
export async function getMartinaVerifiedPrice(
  productId: string,
  fallback: string,
): Promise<string> {
  const baseId = baseIdOf(productId);
  const existing = getActiveMartinaVerification(baseId);
  if (existing) {
    const result = await existing;
    return result?.price || fallback;
  }
  return getLastMartinaResult(baseId)?.price || fallback;
}