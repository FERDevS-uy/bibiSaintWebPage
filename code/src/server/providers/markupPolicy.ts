import {
  DEFAULT_PROVIDER_MARKUP,
  type Provider,
} from "../../config/providerMargins.ts";

type MarkupProvider = Exclude<Provider, "unknown">;

type StoredMarkup = {
  provider_key?: unknown;
  markup?: unknown;
};

export const EDITABLE_MARKUP_PROVIDERS: MarkupProvider[] = [
  "martina",
  "nuvex",
  "kaideco",
];

export function isEditableMarkupProvider(provider: unknown): provider is MarkupProvider {
  return (
    typeof provider === "string" &&
    EDITABLE_MARKUP_PROVIDERS.includes(provider as MarkupProvider)
  );
}

export function resolveProviderMarkups(
  rows: readonly StoredMarkup[],
): Record<Provider, number> {
  const effective: Record<Provider, number> = {
    ...DEFAULT_PROVIDER_MARKUP,
    unknown: 1,
  };

  for (const row of rows) {
    const provider = row?.provider_key;
    if (!isEditableMarkupProvider(provider)) continue;

    const markup = Number(row?.markup);
    if (Number.isFinite(markup) && markup > 0 && markup <= 5) {
      effective[provider] = markup;
    }
  }

  // Alondra's API already returns the sale price. Never layer another markup
  // over it, including when a legacy database row contains an override.
  effective.alondra = 1;
  return effective;
}

export function buildEditableMarkupRows(
  rawMarkup: Record<string, unknown>,
  maxMarkup = 5,
):
  | { rows: Array<{ provider_key: MarkupProvider; markup: number }> }
  | { error: string } {
  if (Object.hasOwn(rawMarkup, "alondra")) {
    return {
      error: "Alondra no admite markup: su API ya devuelve precios aumentados",
    };
  }

  const rows: Array<{ provider_key: MarkupProvider; markup: number }> = [];
  for (const provider of EDITABLE_MARKUP_PROVIDERS) {
    const value = rawMarkup[provider];
    if (value === undefined || value === null) continue;

    const markup = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(markup) || markup <= 0 || markup > maxMarkup) {
      return {
        error: `Markup inválido para ${provider}: debe ser > 0 y <= ${maxMarkup}`,
      };
    }
    rows.push({ provider_key: provider, markup });
  }

  return { rows };
}
