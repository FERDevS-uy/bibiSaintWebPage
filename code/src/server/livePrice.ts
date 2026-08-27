/// <reference types="astro/client" />
import { applyProviderMarkupValue, providerFrom, type Provider } from "../client/stockService";

/**
 * Resultado normalizado para Server Islands.
 * - price: ya con markup aplicado y formateado (string "es-UY"), vacío si no se pudo obtener.
 * - inStock: true | false | null (null = indeterminado).
 */
export interface LivePriceResult {
  provider: Provider;
  price: string;
  priceValue: number;
  inStock: boolean | null;
  source: "live" | "fallback";
}

const PROVIDER_TIMEOUT_MS = 6000;

/** TTL de la caché de precios en vivo (5 min, alineado con la caché de productos). */
const LIVE_PRICE_CACHE_TTL = 300_000;
/** Límite de entradas antes de purgar expiradas (evita crecimiento ilimitado en isolates longevos). */
const LIVE_PRICE_CACHE_MAX = 500;

const livePriceCache = new Map<string, { value: LivePriceResult; expires: number }>();

function pruneLivePriceCache(): void {
  if (livePriceCache.size < LIVE_PRICE_CACHE_MAX) return;
  const now = Date.now();
  for (const [key, entry] of livePriceCache) {
    if (entry.expires <= now) livePriceCache.delete(key);
  }
  // Si aún supera el límite (todo vigente), descarta la entrada más antigua.
  while (livePriceCache.size >= LIVE_PRICE_CACHE_MAX) {
    const oldest = livePriceCache.keys().next();
    if (oldest.done) break;
    livePriceCache.delete(oldest.value);
  }
}

const NUVEX_HEADERS: Record<string, string> = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
};

function formatUy(value: number): string {
  return Number.isFinite(value) && value > 0 ? Math.round(value).toLocaleString("es-UY") : "";
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function getKaiPrice(providerUrl: string): Promise<{ price: number; inStock: boolean | null }> {
  const productUrl = new URL(providerUrl);
  const segments = productUrl.pathname.split("/").filter(Boolean);
  const productsIndex = segments.findIndex((s) => s === "products");
  const handle = productsIndex >= 0 ? segments[productsIndex + 1] : "";
  if (!handle) throw new Error("kai handle missing");

  const product: any = await fetchJson(`https://kaideco.uy/products/${handle}.js`);
  const variants: any[] = Array.isArray(product?.variants) ? product.variants : [];
  const firstVariant = variants[0] ?? null;
  const rawPrice = Number(firstVariant?.price ?? product?.price ?? 0);
  // Kai (Shopify) entrega precio en centavos cuando es >= 100.
  const normalized = rawPrice >= 100 ? Math.trunc(rawPrice / 100) : Math.trunc(rawPrice);
  return {
    price: normalized,
    inStock: variants.length > 0 ? variants.some((v: any) => Boolean(v?.available)) : null,
  };
}

async function getAlondraPrice(productId: string): Promise<{ price: number; inStock: boolean | null }> {
  const alondraId = String(productId || "").replace(/^alo-/i, "").trim();
  if (!alondraId) throw new Error("alondra id missing");

  const payload: any = await fetchJson(
    `https://alondra-ecommerce-be.sitios.uy/api/products/${encodeURIComponent(alondraId)}`,
  );
  const product = Array.isArray(payload) ? payload[0] : payload;
  const rawPrice = Number(product?.new_price ?? product?.price ?? 0);
  const inStock =
    typeof product?.listed === "boolean"
      ? product.listed
      : typeof product?.in_stock === "boolean"
        ? product.in_stock
        : typeof product?.stock === "number"
          ? product.stock > 0
          : typeof product?.quantity === "number"
            ? product.quantity > 0
            : null;
  return { price: rawPrice, inStock };
}

async function getNuvexStock(providerUrl: string): Promise<boolean | null> {
  const target = new URL(providerUrl);
  target.protocol = "https:";

  const response = await fetch(target.toString(), {
    method: "GET",
    redirect: "follow",
    headers: NUVEX_HEADERS,
  });
  if (!response.ok) return null;

  const html = await response.text();
  const match = html.match(/disponibilidad\s*:\s*([^<\n\r]{1,80})/i);
  if (!match?.[1]) return null;
  const text = match[1].toLowerCase();
  if (/(sin\s*stock|agotado|no\s*disponible|out\s*of\s*stock|sold\s*out)/.test(text)) return false;
  if (/(en\s*stock|disponible|in\s*stock)/.test(text)) return true;
  return null;
}

/**
 * Devuelve precio + stock en vivo. Si falla cualquier cosa, retorna el fallbackPrice.
 * Pensado para ejecutarse dentro de un Server Island (Astro 5 + Cloudflare).
 */
export async function getLivePrice({
  productId,
  providerLink,
  fallbackPrice,
}: {
  productId: string;
  providerLink: string;
  fallbackPrice: string | number;
}): Promise<LivePriceResult> {
  const provider = providerFrom(productId, providerLink);
  const fallbackValue =
    typeof fallbackPrice === "number"
      ? fallbackPrice
      : Number(String(fallbackPrice).replace(/[^\d]/g, "")) || 0;

  const fallbackResult: LivePriceResult = {
    provider,
    price: formatUy(fallbackValue),
    priceValue: fallbackValue,
    inStock: null,
    source: "fallback",
  };

  if (provider === "unknown") return fallbackResult;

  // Caché module-level: solo resultados "live" (un fallo de red no se cachea).
  const cacheKey = `${provider}|${productId}|${providerLink}`;
  const cached = livePriceCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.value;
  }

  let liveResult: LivePriceResult | null = null;

  try {
    if (provider === "martina") {
      // Martina ya no consulta precio runtime acá: el precio live lo resuelve
      // la verificación por producto (endpoint /api/martina/product-price).
      // Aquí se muestra el precio sincronizado como fallback visual.
      return fallbackResult;
    }

    if (provider === "kaideco") {
      const live = await withTimeout(getKaiPrice(providerLink), PROVIDER_TIMEOUT_MS);
      const adjusted = applyProviderMarkupValue(live.price, provider);
      liveResult = {
        provider,
        price: formatUy(adjusted) || fallbackResult.price,
        priceValue: adjusted || fallbackValue,
        inStock: live.inStock,
        source: adjusted > 0 ? "live" : "fallback",
      };
    } else if (provider === "alondra") {
      const live = await withTimeout(getAlondraPrice(productId), PROVIDER_TIMEOUT_MS);
      const adjusted = applyProviderMarkupValue(live.price, provider);
      liveResult = {
        provider,
        price: formatUy(adjusted) || fallbackResult.price,
        priceValue: adjusted || fallbackValue,
        inStock: live.inStock,
        source: adjusted > 0 ? "live" : "fallback",
      };
    } else if (provider === "nuvex") {
      // Política: para Nuvex solo verificamos stock en vivo, precio se mantiene del CSV.
      const inStock = await withTimeout(getNuvexStock(providerLink), PROVIDER_TIMEOUT_MS);
      liveResult = {
        ...fallbackResult,
        inStock,
        source: inStock === null ? "fallback" : "live",
      };
    }
  } catch {
    // Cualquier error => fallback silencioso (no romper UI).
  }

  // Solo se cachean resultados "live" exitosos; los fallbacks (proveedor caído,
  // timeout, error de red) se resuelven de nuevo en cada request.
  if (liveResult && liveResult.source === "live") {
    pruneLivePriceCache();
    livePriceCache.set(cacheKey, {
      value: liveResult,
      expires: Date.now() + LIVE_PRICE_CACHE_TTL,
    });
    return liveResult;
  }

  return fallbackResult;
}
