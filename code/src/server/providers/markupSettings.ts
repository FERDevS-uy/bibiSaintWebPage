// markupSettings.ts
// Server-only provider markup settings backed by provider_catalog_settings.
// Effective markup = DB row (provider_key, markup) when present and valid,
// otherwise DEFAULT_PROVIDER_MARKUP. Network/DB failures NEVER throw: the
// site must keep working with defaults.
import { getSupabaseAdmin } from "../supabase";
import {
  DEFAULT_PROVIDER_MARKUP,
  type Provider,
} from "../../config/providerMargins";
import { resolveProviderMarkups } from "./markupPolicy";

const CACHE_TTL = 300_000;

let markupCache: Record<Provider, number> | null = null;
let markupCacheTime = 0;

/** Invalidates the module-level markup cache (call after an admin POST). */
export function invalidateProviderMarkupCache(): void {
  markupCache = null;
  markupCacheTime = 0;
}

async function loadProviderMarkups(): Promise<Record<Provider, number>> {
  if (markupCache && Date.now() - markupCacheTime < CACHE_TTL) {
    return markupCache;
  }

  let effective: Record<Provider, number> = {
    ...DEFAULT_PROVIDER_MARKUP,
    unknown: 1,
  };
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("provider_catalog_settings")
      .select("provider_key, markup");

    if (!error && Array.isArray(data)) {
      effective = resolveProviderMarkups(data);
    }

    // Only successful reads populate the cache, so a transient DB failure
    // falls back to defaults now and retries on the next call.
    markupCache = effective;
    markupCacheTime = Date.now();
  } catch {
    // Defaults — never take the site down.
  }

  return effective;
}

export async function getProviderMarkup(provider: Provider): Promise<number> {
  if (provider === "unknown") return 1;
  if (provider === "alondra") return 1;
  const map = await loadProviderMarkups();
  return map[provider] ?? DEFAULT_PROVIDER_MARKUP[provider];
}

export async function getAllProviderMarkups(): Promise<
  Record<Provider, number>
> {
  return loadProviderMarkups();
}
