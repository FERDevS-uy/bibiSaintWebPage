// providerMargins.ts
// Shared provider markup configuration. Dependency-free module: no server or
// client imports, only types and constants. Used by server live prices/syncs,
// client live stock checks and the admin panel as the single source of truth
// for default margins.

export type Provider = "martina" | "nuvex" | "kaideco" | "alondra" | "unknown";

/**
 * Default profit markup per provider: final price = provider base price × markup.
 * DB overrides (provider_catalog_settings.markup) take precedence at runtime;
 * NULL/absent rows fall back to these values.
 */
export const DEFAULT_PROVIDER_MARKUP: Record<
  Exclude<Provider, "unknown">,
  number
> = {
  martina: 1,
  nuvex: 1.4,
  // Kai Deco is editable from the admin panel. Alondra's API already returns
  // increased prices, so its factor is permanently enforced as 1 at runtime.
  kaideco: 1.2,
  alondra: 1,
};

/**
 * Resolves the provider from a product id/link. Mirrors the legacy detection
 * used across client and server code (ids: mdt-* martina, kai-* / kaideco.uy
 * kaideco, alo-* / alondra.com.uy / alondra-ecommerce alondra, nuvex.uy nuvex).
 */
export function providerFrom(id: string, link: string): Provider {
  const idLower = id.toLowerCase();
  const linkLower = link.toLowerCase();

  if (idLower.startsWith("mdt-")) return "martina";
  if (idLower.startsWith("kai-") || linkLower.includes("kaideco.uy"))
    return "kaideco";
  if (
    idLower.startsWith("alo-") ||
    linkLower.includes("alondra.com.uy") ||
    linkLower.includes("alondra-ecommerce")
  ) {
    return "alondra";
  }
  if (linkLower.includes("nuvex.uy")) return "nuvex";
  return "unknown";
}
