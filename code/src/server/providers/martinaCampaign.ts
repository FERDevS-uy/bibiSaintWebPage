// martinaCampaign.ts
// Parser y vigencia de la campaña vigente de Martina di Trento.
//
// Martina expone `ecommerce/config?countryId=598` con la campaña activa:
// { data: { code, validFrom, validTill, audit: { enabled } } }.
// validFrom/validTill son fechas NAIVE (sin zona horaria); se interpretan
// como hora local de America/Montevideo (UTC-3, sin DST).

export interface MartinaCampaign {
  code: string;
  countryId: string;
  validFrom: Date;
  validTill: Date;
  auditEnabled: boolean;
}

const EXPECTED_COUNTRY_ID = "598";
const CODE_RE = /^\d{6}$/;

// America/Montevideo es UTC-3 fijo todo el año (no hay DST).
const MONTEVIDEO_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Interpreta una fecha naive "YYYY-MM-DDTHH:mm:ss" como hora local de
 * America/Montevideo (UTC-3) y devuelve el instante UTC correspondiente.
 */
export function parseNaiveAsMontevideo(value: unknown): Date | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  const match = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (!match) return null;

  const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
  const asUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  if (Number.isNaN(asUtc)) return null;

  // Hora local Montevideo (UTC-3) T => instante UTC = T + 3h.
  return new Date(asUtc + MONTEVIDEO_UTC_OFFSET_MS);
}

function extractData(raw: any): any {
  if (!raw || typeof raw !== "object") return null;
  if (
    raw &&
    typeof raw === "object" &&
    raw.data &&
    typeof raw.data === "object" &&
    !Array.isArray(raw.data)
  ) {
    return raw.data;
  }
  return raw;
}

/**
 * Valida el payload de `ecommerce/config` y devuelve la campaña tipada.
 * Lanza error ante cualquier invariante rota:
 *  - code no coincide con ^\d{6}$
 *  - countryId presente y distinto de "598"
 *  - faltan validFrom/validTill o validFrom >= validTill
 *  - audit.enabled === false
 */
export function parseCampaign(raw: unknown): MartinaCampaign {
  const payload = extractData(raw) || {};

  const code = String(payload?.code ?? "").trim();
  if (!CODE_RE.test(code)) {
    throw new Error(`Campaña inválida: code "${code}" no coincide con ^\\d{6}$`);
  }

  const rawCountryId = String(payload?.countryId ?? payload?.country_id ?? "").trim();
  if (rawCountryId && rawCountryId !== EXPECTED_COUNTRY_ID) {
    throw new Error(
      `Campaña inválida: countryId "${rawCountryId}" distinto de "${EXPECTED_COUNTRY_ID}"`,
    );
  }

  const validFrom = parseNaiveAsMontevideo(payload?.validFrom ?? payload?.valid_from);
  const validTill = parseNaiveAsMontevideo(payload?.validTill ?? payload?.valid_till);
  if (!validFrom || !validTill) {
    throw new Error("Campaña inválida: faltan validFrom/validTill");
  }
  if (validFrom.getTime() >= validTill.getTime()) {
    throw new Error("Campaña inválida: validFrom >= validTill");
  }

  const auditEnabled = payload?.audit?.enabled !== false;
  if (!auditEnabled) {
    throw new Error("Campaña inválida: audit.enabled es false");
  }

  return {
    code,
    countryId: EXPECTED_COUNTRY_ID,
    validFrom,
    validTill,
    auditEnabled,
  };
}

/** Devuelve true si la campaña está vigente en el instante `now`. */
export function isVigente(campaign: MartinaCampaign, now: Date): boolean {
  return now.getTime() >= campaign.validFrom.getTime() && now.getTime() < campaign.validTill.getTime();
}