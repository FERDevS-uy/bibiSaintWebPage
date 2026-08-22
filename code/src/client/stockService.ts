import { normalizeSizes } from "../utils/sizes";
import { withBasePath } from "../utils/basePath";
import { fetchMartinaProductPrice } from "./martinaVerification";

export type Provider = "martina" | "nuvex" | "kaideco" | "alondra" | "unknown";

const PROVIDER_MULTIPLIER: Record<Exclude<Provider, "unknown">, number> = {
  martina: 1,
  nuvex: 1.4,
  kaideco: 1.2,
  alondra: 1.22,
};

let nuvexApiReachability: Promise<boolean> | null = null;

async function canUseNuvexApi(endpoint: URL): Promise<boolean> {
  if (!nuvexApiReachability) {
    nuvexApiReachability = (async () => {
      try {
        const probe = new URL(endpoint.toString());
        probe.searchParams.set("url", "https://nuvex.uy");

        const response = await fetch(probe.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        // 400 JSON => endpoint existe pero faltan/invalidan params (esperado para probe)
        if (response.status === 400) return true;
        if (response.status === 404 || response.status === 405) return false;

        const contentType = response.headers.get("content-type") || "";
        return contentType.toLowerCase().includes("application/json");
      } catch {
        return false;
      }
    })();
  }

  return nuvexApiReachability;
}

function parseLoosePrice(rawPrice: unknown): number {
  const value = String(rawPrice ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\d,.-]/g, "");

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
    return Number(value.replace(",", "."));
  }

  if (hasDot) {
    const parts = value.split(".");
    const looksLikeThousands =
      parts.length > 1 && parts.slice(1).every((part) => part.length === 3);

    if (looksLikeThousands) {
      return Number(parts.join(""));
    }
  }

  return Number(value);
}

function formatUyPrice(price: number): string {
  const value = Number.isFinite(price) ? Math.round(price) : 0;
  return value.toLocaleString("es-UY");
}

export function applyProviderMarkupValue(rawPrice: unknown, provider: Provider): number {
  const base = parseLoosePrice(rawPrice);
  if (!Number.isFinite(base) || base <= 0) return 0;

  if (provider === "unknown") return Math.round(base);

  const multiplier = PROVIDER_MULTIPLIER[provider] ?? 1;
  return Math.round(base * multiplier);
}

export function applyProviderMarkup(rawPrice: unknown, provider: Provider): string {
  const adjusted = applyProviderMarkupValue(rawPrice, provider);
  return adjusted > 0 ? formatUyPrice(adjusted) : "";
}

export function providerFrom(id: string, link: string): Provider {
  const idLower = id.toLowerCase();
  const linkLower = link.toLowerCase();

  if (idLower.startsWith("mdt-")) return "martina";
  if (idLower.startsWith("kai-") || linkLower.includes("kaideco.uy")) return "kaideco";
  if (idLower.startsWith("alo-") || linkLower.includes("alondra.com.uy") || linkLower.includes("alondra-ecommerce")) return "alondra";
  if (linkLower.includes("nuvex.uy")) return "nuvex";
  return "unknown";
}

/**
 * Verificación de un producto Martina a través del endpoint interno
 * /api/martina/product-price. El navegador NUNCA consulta Martina directo:
 * el servidor resuelve la campaña vigente.
 */
export async function fetchMartinaLive(productId: string) {
  const result = await fetchMartinaProductPrice(productId);
  if (!result) {
    return {
      provider: "martina" as const,
      price: "",
      inStock: false,
      colors: [] as Array<{ id: number; hex: string; name: string; sizes: string[]; rawSizes: string[] }>,
      sizes: [] as string[],
    };
  }
  return {
    provider: "martina" as const,
    price: result.price,
    inStock: result.inStock,
    colors: result.colors,
    sizes: result.sizes,
  };
}

const formatKaiPrice = (raw: unknown) => {
  const value = Number(raw);
  if (Number.isNaN(value)) return "";
  const normalized = value >= 100 ? Math.trunc(value / 100) : Math.trunc(value);
  return normalized.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

const extractKaiRawSizes = (product: any): string[] => {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const options = Array.isArray(product?.options) ? product.options : [];
  const sizeOptionIndex = options.findIndex((option: any) => {
    const name = String(option?.name ?? "").toLowerCase();
    return name.includes("talle") || name.includes("size");
  });

  const candidateValues: string[] = [];

  variants.forEach((variant: any) => {
    if (!variant?.available) return;

    if (sizeOptionIndex >= 0) {
      const optionValue = variant?.[`option${sizeOptionIndex + 1}`];
      if (optionValue) candidateValues.push(String(optionValue));
    }

    if (variant?.title) {
      candidateValues.push(String(variant.title));
    }
  });

  return candidateValues;
};

export async function fetchKaiLive(providerUrl: string) {
  const productUrl = new URL(providerUrl);
  const segments = productUrl.pathname.split("/").filter(Boolean);
  const productsIndex = segments.findIndex((segment) => segment === "products");
  const handle = productsIndex >= 0 ? segments[productsIndex + 1] : "";

  if (!handle) {
    throw new Error("No se pudo detectar handle de Kai");
  }

  const endpoint = `https://kaideco.uy/products/${handle}.js`;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const product = await response.json();
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    const firstVariant = variants[0] ?? null;
    const rawSizes = extractKaiRawSizes(product);

    return {
      provider: "kaideco",
      price: formatKaiPrice(firstVariant?.price ?? product?.price),
      inStock: variants.length > 0 ? variants.some((variant: any) => Boolean(variant?.available)) : null,
      sizes: normalizeSizes(rawSizes),
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function fetchNuvexLive(providerUrl: string) {
  if (!providerUrl || !providerUrl.toLowerCase().includes("nuvex.uy")) {
    return {
      provider: "nuvex" as const,
      price: "",
      inStock: null,
      source: "nuvex-web",
    };
  }

  const endpointPath = withBasePath("/api/provider-nuvex");
  const endpoint = new URL(endpointPath, window.location.origin);

  const hasNuvexApi = await canUseNuvexApi(endpoint);
  if (!hasNuvexApi) {
    return {
      provider: "nuvex" as const,
      price: "",
      inStock: null,
      source: "nuvex-static-no-api",
    };
  }

  endpoint.searchParams.set("url", providerUrl);

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(endpoint.toString(), {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return {
        provider: "nuvex" as const,
        price: "",
        inStock: null,
        source: response.status === 404 ? "nuvex-static-no-api" : "nuvex-web",
      };
    }

    const payload = await response.json();
    return {
      provider: "nuvex" as const,
      // Politica runtime: para Nuvex solo se valida stock en vivo.
      price: "",
      inStock: typeof payload?.inStock === "boolean" ? payload.inStock : null,
      source: String(payload?.source ?? ""),
    };
  } catch {
    return {
      provider: "nuvex" as const,
      price: "",
      inStock: null,
      source: "nuvex-static-no-api",
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

const ALONDRA_API_BASE = "https://alondra-ecommerce-be.sitios.uy/api";

function parseAlondraInStock(product: any): boolean | null {
  if (typeof product?.listed === "boolean") return product.listed;
  if (typeof product?.in_stock === "boolean") return product.in_stock;
  if (typeof product?.stock === "number") return product.stock > 0;
  if (typeof product?.quantity === "number") return product.quantity > 0;
  return null;
}

export async function fetchAlondraLive(productId: string) {
  const alondraId = String(productId || "").replace(/^alo-/i, "").trim();
  if (!alondraId) {
    return {
      provider: "alondra" as const,
      price: "",
      inStock: null,
    };
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7000);

  try {
    const endpoint = `${ALONDRA_API_BASE}/products/${encodeURIComponent(alondraId)}`;
    const response = await fetch(endpoint, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return {
        provider: "alondra" as const,
        price: "",
        inStock: null,
      };
    }

    const payload = await response.json();
    const product = Array.isArray(payload) ? payload[0] : payload;
    const rawPrice = product?.new_price ?? product?.price ?? "";

    return {
      provider: "alondra" as const,
      price: String(rawPrice ?? "").trim(),
      inStock: parseAlondraInStock(product),
    };
  } catch {
    return {
      provider: "alondra" as const,
      price: "",
      inStock: null,
    };
  } finally {
    window.clearTimeout(timeout);
  }
}
