// planner.ts
// Planner puro del sync de Nuvex: diff entrantes vs existentes + identificación.
// NO importa capa de datos (Supabase) para poder testearse de forma aislada.
import type { ProductRow } from "../utils.ts";

export type NuvexActionType = "create" | "update" | "unchanged" | "absent";
export type NuvexPriceReason =
  | "nuevo"
  | "aumento_proveedor"
  | "inicio_oferta"
  | "fin_oferta"
  | "cambio_oferta"
  | "precio_faltante"
  | "manual_temporal"
  | "unchanged";

export interface NuvexPlanItem {
  id: string;
  externalId: string;
  name: string;
  price: string;
  originalPrice: string | null;
  enOferta: boolean;
  action: NuvexActionType;
  priceReason: NuvexPriceReason;
  matchedBy: "id" | "name" | null;
  inferredMatchId?: string;
  imageChanged: boolean;
  descriptionChanged: boolean;
  categoryChanged: boolean;
  newImages: string[];
  oldImages: string[];
}

export interface NuvexPlanSummary {
  create: number;
  update: number;
  unchanged: number;
  absent: number;
  warnings: number;
}

export interface NuvexExistingProduct {
  id: string;
  name: string;
  price: string;
  en_oferta: boolean;
  original_price: string | null;
  img: string[];
}

const NAME_THRESHOLD = 0.85;

function normalizeKey(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  const na = normalizeKey(a);
  const nb = normalizeKey(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const long = na.length >= nb.length ? na : nb;
  const short = na.length >= nb.length ? nb : na;
  if (short.length === 0) return 0;
  let match = 0;
  for (let i = 0; i <= long.length - short.length; i++) {
    let s = 0;
    for (let j = 0; j < short.length; j++) {
      if (long[i + j] === short[j]) s++;
    }
    match = Math.max(match, s / short.length);
  }
  return match;
}

/** Busca un candidato por nombre entre los existentes; null si no hay o hay empate. */
export function matchByName(
  name: string,
  existingList: Array<{ id: string; name: string }>,
): { id: string; score: number } | null {
  let best: { id: string; score: number } | null = null;
  for (const e of existingList) {
    const s = similarity(name, e.name);
    if (s >= NAME_THRESHOLD) {
      if (!best || s > best.score) {
        best = { id: e.id, score: s };
      } else if (s === best.score) {
        return null; // empate -> rechazar
      }
    }
  }
  return best;
}

function sameImages(a: string[], b: string[]): boolean {
  const sa = Array.from(new Set(a ?? []));
  const sb = Array.from(new Set(b ?? []));
  return sa.length === sb.length && sa.every((x, i) => x === sb[i]);
}

export async function buildPlan(
  products: ProductRow[],
  existing: Map<string, NuvexExistingProduct>,
  existingList: Array<NuvexExistingProduct>,
): Promise<{ items: NuvexPlanItem[]; summary: NuvexPlanSummary }> {
  const items: NuvexPlanItem[] = [];
  const summary: NuvexPlanSummary = { create: 0, update: 0, unchanged: 0, absent: 0, warnings: 0 };

  for (const p of products) {
    const prev = existing.get(p.id);
    const originalPrice = p.original_price ?? null;
    const enOferta = Boolean(p.en_oferta);
    const priceEmpty = !p.price;

    let action: NuvexActionType;
    let reason: NuvexPriceReason;
    let matchedBy: "id" | "name" | null = null;
    let inferredMatchId: string | undefined;

    if (prev) {
      matchedBy = "id";
      const priceChanged = prev.price !== p.price;
      const offerChanged = prev.en_oferta !== enOferta;
      const originalChanged = prev.original_price !== originalPrice;

      if (priceEmpty) {
        action = "unchanged";
        reason = "precio_faltante";
        summary.warnings++;
} else if (!priceChanged && !offerChanged && !originalChanged) {
        action = "unchanged";
        reason = "unchanged";
      } else {
        action = "update";
        if (offerChanged && enOferta) reason = "inicio_oferta";
        else if (offerChanged && !enOferta) reason = "fin_oferta";
        else if (originalChanged && enOferta) reason = "cambio_oferta";
        else reason = "aumento_proveedor";
      }
    } else {
      const nameMatch = matchByName(p.name, existingList);
      if (nameMatch) {
        matchedBy = "name";
        inferredMatchId = nameMatch.id;
        action = "update"; // requiere confirmación explícita
        reason = priceEmpty ? "precio_faltante" : "aumento_proveedor";
        if (priceEmpty) summary.warnings++;
      } else {
        action = "create";
        reason = priceEmpty ? "precio_faltante" : "nuevo";
        if (priceEmpty) summary.warnings++;
      }
    }

    items.push({
      id: p.id,
      externalId: p.external_id,
      name: p.name,
      price: p.price,
      originalPrice,
      enOferta,
      action,
      priceReason: reason,
      matchedBy,
      inferredMatchId,
      imageChanged: prev ? !sameImages(prev.img, p.img) : true,
      descriptionChanged: prev ? prev.name !== p.name : true,
      categoryChanged: prev ? prev.name !== p.name : true,
      newImages: p.img,
      oldImages: prev ? prev.img : [],
    });

    if (action === "create") summary.create++;
    else if (action === "update") summary.update++;
    else summary.unchanged++;
  }

  const incomingIds = new Set(products.map((p) => p.id));
  for (const e of existingList) {
    if (incomingIds.has(e.id)) continue;
    items.push({
      id: e.id,
      externalId: e.id,
      name: e.name,
      price: e.price,
      originalPrice: e.original_price,
      enOferta: e.en_oferta,
      action: "absent",
      priceReason: "unchanged",
      matchedBy: null,
      newImages: e.img,
      oldImages: e.img,
      imageChanged: false,
      descriptionChanged: false,
      categoryChanged: false,
    });
    summary.absent++;
  }

  return { items, summary };
}