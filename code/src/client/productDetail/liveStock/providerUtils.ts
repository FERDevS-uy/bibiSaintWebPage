// Utilidades compartidas para proveedores

import { DEFAULT_PROVIDER_MARKUP, type Provider } from "../../../config/providerMargins.js";
import { withBasePath } from "../../../utils/basePath.js";

export { providerFrom } from "../../../config/providerMargins.js";

export function extractKaiRawSizes(product: any): string[] {
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
}

/** Default markup per provider (single source of truth: config/providerMargins). */
export const providerMultiplier = {
  ...DEFAULT_PROVIDER_MARKUP,
  unknown: 1,
} as const;

export function parseLoosePrice(rawPrice: unknown): number {
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

/** SYNC: applies the default markup for the provider (used where no runtime fetch is needed). */
export function applyProviderMarkup(
  rawPrice: unknown,
  provider: keyof typeof providerMultiplier,
): string {
  const base = parseLoosePrice(rawPrice);
  if (!Number.isFinite(base) || base <= 0) return "";

  const multiplier = providerMultiplier[provider] ?? 1;
  const adjusted = Math.round(base * multiplier);
  return adjusted.toLocaleString("es-UY");
}

/** Applies an explicit markup multiplier and formats as es-UY (handlers use the runtime value). */
export function applyMarkupToPrice(rawPrice: unknown, multiplier: number): string {
  const base = parseLoosePrice(rawPrice);
  if (!Number.isFinite(base) || base <= 0) return "";

  const adjusted = Math.round(base * multiplier);
  return adjusted.toLocaleString("es-UY");
}

// ---------------------------------------------------------------------------
// Runtime markup loader (memoized, one fetch per page load).
// The public endpoint /api/config/provider-margins returns the effective
// values (DB overrides or defaults); any failure resolves to the defaults.
// ---------------------------------------------------------------------------

let runtimeMarkupPromise: Promise<Record<Provider, number>> | null = null;

export function getRuntimeMarkup(): Promise<Record<Provider, number>> {
  if (!runtimeMarkupPromise) {
    runtimeMarkupPromise = (async () => {
      const effective: Record<Provider, number> = { ...DEFAULT_PROVIDER_MARKUP, unknown: 1 };
      try {
        const endpoint = withBasePath("/api/config/provider-margins");
        const response = await fetch(endpoint, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!response.ok) return effective;

        const payload: unknown = await response.json();
        if (payload && typeof payload === "object") {
          for (const key of Object.keys(DEFAULT_PROVIDER_MARKUP)) {
            const value = Number((payload as Record<string, unknown>)[key]);
            if (Number.isFinite(value) && value > 0 && value <= 5) {
              effective[key as Exclude<Provider, "unknown">] = value;
            }
          }
        }
      } catch {
        // Fallback silencioso a defaults: el markup dinámico nunca rompe la UI.
      }
      return effective;
    })();
  }
  return runtimeMarkupPromise;
}

export function formatKaiPrice(raw: unknown): string {
  const value = Number(raw);
  if (Number.isNaN(value)) return "";
  const normalized = value >= 100 ? Math.trunc(value / 100) : Math.trunc(value);
  return normalized.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}