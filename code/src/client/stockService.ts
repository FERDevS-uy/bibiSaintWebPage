import { normalizeSizes } from "../utils/sizes";

export type Provider = "martina" | "nuvex" | "kaideco" | "alondra" | "unknown";

const PROVIDER_MULTIPLIER: Record<Exclude<Provider, "unknown">, number> = {
  martina: 1,
  nuvex: 1.4,
  kaideco: 1.2,
  alondra: 1.22,
};

function parseLoosePrice(rawPrice: unknown): number {
  const value = String(rawPrice ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\d,.-]/g, "");

  if (!value) return 0;

  const hasComma = value.includes(",");
  const hasDot = value.includes(".");

  if (hasComma && hasDot) {
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

export async function fetchMartinaLive(productId: string, martinaCodeValue: string, martinaCountryIdValue: string) {
  const productIdNumber = productId.replace(/^mdt-/i, "");
  const endpoint = new URL("https://pol21.martinaditrento.com/mdt-services/resources/store/product");
  endpoint.searchParams.set("productId", productIdNumber);
  endpoint.searchParams.set("code", martinaCodeValue);
  endpoint.searchParams.set("countryId", martinaCountryIdValue);

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(endpoint.toString(), {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/plain, */*",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const dataArray: any[] = Array.isArray(payload?.data) ? payload.data : [];

    if (dataArray.length === 0) {
      return {
        provider: "martina" as const,
        price: "",
        inStock: false,
        colors: [] as Array<{ id: number; hex: string; name: string; sizes: string[]; rawSizes: string[] }>,
        sizes: [] as string[],
      };
    }

    const colorMap = new Map<
      number,
      { id: number; hex: string; name: string; rawSizes: Set<string> }
    >();

    dataArray.forEach((entry) => {
      const tipoVentas = entry?.variation?.variationValues ?? [];
      tipoVentas.forEach((tv: any) => {
        const colorVariations = tv?.variation?.variationValues ?? [];
        colorVariations.forEach((color: any) => {
          const colorId = Number(color?.id);
          if (!Number.isFinite(colorId)) return;
          if (!colorMap.has(colorId)) {
            colorMap.set(colorId, {
              id: colorId,
              hex: String(color?.colorHex ?? "#cccccc"),
              name: String(color?.description ?? "").trim(),
              rawSizes: new Set<string>(),
            });
          }
          const sizeVariations = color?.variation?.variationValues ?? [];
          sizeVariations.forEach((sz: any) => {
            const desc = String(sz?.description ?? "").trim();
            if (desc) colorMap.get(colorId)!.rawSizes.add(desc);
          });
        });
      });
    });

    const colors = Array.from(colorMap.values()).map((c) => ({
      id: c.id,
      hex: c.hex,
      name: c.name,
      rawSizes: Array.from(c.rawSizes),
      sizes: normalizeSizes(Array.from(c.rawSizes)),
    }));

    const allSizes = normalizeSizes(
      colors.flatMap((c) => c.rawSizes),
    );

    const firstEntry = dataArray[0] ?? {};

    return {
      provider: "martina" as const,
      price: String(firstEntry?.price ?? "").trim(),
      inStock: colors.some((c) => c.sizes.length > 0),
      colors,
      sizes: allSizes,
    };
  } finally {
    window.clearTimeout(timeout);
  }
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

  const endpoint = new URL(`${import.meta.env.BASE_URL || "/"}api/provider-nuvex`, window.location.origin);
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
        source: "nuvex-web",
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
      source: "nuvex-web",
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
