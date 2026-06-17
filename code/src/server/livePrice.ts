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

async function getMartinaPrice(productId: string): Promise<{ price: number; inStock: boolean | null }> {
  const productIdNumber = productId.replace(/^mdt-/i, "");
  const code = (import.meta.env.PUBLIC_MARTINA_CODE as string | undefined) || "202605";
  const countryId = (import.meta.env.PUBLIC_MARTINA_COUNTRY_ID as string | undefined) || "598";

  const endpoint = new URL("https://pol21.martinaditrento.com/mdt-services/resources/store/product");
  endpoint.searchParams.set("productId", productIdNumber);
  endpoint.searchParams.set("code", code);
  endpoint.searchParams.set("countryId", countryId);

  const payload = await fetchJson(endpoint.toString(), {
    headers: { Accept: "application/json, text/plain, */*" },
  });

  const dataArray: any[] = Array.isArray(payload?.data) ? payload.data : [];
  if (dataArray.length === 0) return { price: 0, inStock: false };

  const firstEntry = dataArray[0] ?? {};
  const rawPrice = String(firstEntry?.price ?? "").trim();
  return {
    price: Number(rawPrice.replace(/[^\d.]/g, "")) || 0,
    inStock: dataArray.some((entry) => Number(entry?.stock ?? 1) > 0),
  };
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

  try {
    if (provider === "martina") {
      const live = await withTimeout(getMartinaPrice(productId), PROVIDER_TIMEOUT_MS);
      const adjusted = applyProviderMarkupValue(live.price, provider);
      return {
        provider,
        price: formatUy(adjusted) || fallbackResult.price,
        priceValue: adjusted || fallbackValue,
        inStock: live.inStock,
        source: adjusted > 0 ? "live" : "fallback",
      };
    }

    if (provider === "kaideco") {
      const live = await withTimeout(getKaiPrice(providerLink), PROVIDER_TIMEOUT_MS);
      const adjusted = applyProviderMarkupValue(live.price, provider);
      return {
        provider,
        price: formatUy(adjusted) || fallbackResult.price,
        priceValue: adjusted || fallbackValue,
        inStock: live.inStock,
        source: adjusted > 0 ? "live" : "fallback",
      };
    }

    if (provider === "alondra") {
      const live = await withTimeout(getAlondraPrice(productId), PROVIDER_TIMEOUT_MS);
      const adjusted = applyProviderMarkupValue(live.price, provider);
      return {
        provider,
        price: formatUy(adjusted) || fallbackResult.price,
        priceValue: adjusted || fallbackValue,
        inStock: live.inStock,
        source: adjusted > 0 ? "live" : "fallback",
      };
    }

    if (provider === "nuvex") {
      // Política: para Nuvex solo verificamos stock en vivo, precio se mantiene del CSV.
      const inStock = await withTimeout(getNuvexStock(providerLink), PROVIDER_TIMEOUT_MS);
      return {
        ...fallbackResult,
        inStock,
        source: inStock === null ? "fallback" : "live",
      };
    }
  } catch {
    // Cualquier error => fallback silencioso (no romper UI).
  }

  return fallbackResult;
}
