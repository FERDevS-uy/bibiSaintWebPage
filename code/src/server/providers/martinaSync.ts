// martinaSync.ts
// Núcleo server-side del sync administrativo de Martina di Trento:
//  - SyncPlanner (puro): diff entrantes vs existentes → create|update|unchanged + hash.
//  - PreviewSigner (HMAC): firma el plan con SYNC_PREVIEW_SECRET + expiración.
//  - ProductRepository (port) + implementaciones Supabase (service role) y DryRun (solo lectura).
//  - Orquestación: collectMartinaData / generatePreview / applyMartinaSync.

import { getSupabase, getSupabaseAdmin } from "../supabase";
import { syncMartina, fetchMartinaProductById } from "./martina";
import { isVigente, type MartinaCampaign } from "./martinaCampaign";
import type { ProductRow } from "./utils";
import { isMartinaManaged, martinaChanges, readActiveMartinaProducts, verifyAbsentMartinaProducts, type MartinaObservation } from "./martinaReconciliation";
import type { MartinaAvailability } from "./martinaAvailability";
import { getDisplayCategoryName, getDisplaySubcategories } from "../../utils/categoryNormalization";

// ---------------------------------------------------------------------------
// Env server-only (fail-closed)
// ---------------------------------------------------------------------------

export function getServerEnv(name: string): string | undefined {
  const viaImport = (import.meta as any).env?.[name];
  if (typeof viaImport === "string" && viaImport !== "") return viaImport;
  if (typeof process !== "undefined") {
    const viaProcess = process.env?.[name];
    if (typeof viaProcess === "string" && viaProcess !== "") return viaProcess;
  }
  return undefined;
}

/** Escritura habilitada solo si MARTINA_SYNC_APPLY_ENABLED === "true". */
export function isWriteEnabled(): boolean {
  return getServerEnv("MARTINA_SYNC_APPLY_ENABLED") === "true";
}

export function getPreviewSecret(): string {
  const secret = getServerEnv("SYNC_PREVIEW_SECRET");
  if (!secret) {
    throw new Error("SYNC_PREVIEW_SECRET no configurado (server-only)");
  }
  return secret;
}

export const PREVIEW_TTL_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers criptográficos (Web Crypto: Workers + Node >= 19)
// ---------------------------------------------------------------------------

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return toBase64Url(new Uint8Array(signature));
}

async function hmacVerify(data: string, signature: Uint8Array, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, signature as BufferSource, new TextEncoder().encode(data));
}

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return toBase64Url(new Uint8Array(digest));
}

// ---------------------------------------------------------------------------
// SyncPlanner (función pura)
// ---------------------------------------------------------------------------

export type SyncActionType = "create" | "update" | "unchanged" | "deactivate" | "unknown";

export interface SyncPlanItem {
  id: string;
  name: string;
  price: string;
  originalPrice: string | null;
  enOferta: boolean;
  action: SyncActionType;
  availability: MartinaAvailability;
  reason: string;
  priceChanged: boolean;
  availabilityChanged: boolean;
  /** First supplier image (display only, never persisted as blob). Null when the supplier exposes no photo. */
  image?: string | null;
  /** True when the row category differs from the existing taxonomy and needs a per-item decision. */
  needsCategoryDecision?: boolean;
}

export interface SyncPlanSummary {
  create: number;
  update: number;
  unchanged: number;
  deactivate: number;
  unknown: number;
  priceChanges: number;
  availabilityChanges: number;
}

export interface SyncPlan {
  campaignCode: string;
  items: SyncPlanItem[];
  summary: SyncPlanSummary;
  hash: string;
  mutations: Array<{ id: string; previous?: SyncExistingProduct; changes: Record<string, unknown> }>;
}

/**
 * Hash determinista del conjunto entrante normalizado + campaña.
 * Se usa para revalidar en apply que Martina no cambió entre preview y apply.
 */
export async function planHash(
  products: ProductRow[],
  campaignCode: string,
): Promise<string> {
  const normalized = products
    .map((p) => ({
      id: p.id,
      price: p.price,
      originalPrice: p.original_price ?? null,
      enOferta: Boolean(p.en_oferta),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return sha256Hex(JSON.stringify({ campaignCode, items: normalized }));
}

/** First supplier image for display: products[].img[0], else colors[0].images[0], else null. */
function planThumbnailFromColors(colors: ProductRow["colors"]): string | null {
  const first = Array.isArray(colors) ? colors[0] : undefined;
  const image = first && Array.isArray(first.images) ? first.images[0] : undefined;
  return typeof image === "string" && image ? image : null;
}

function planThumbnail(product: ProductRow): string | null {
  const direct = Array.isArray(product.img) ? product.img[0] : undefined;
  if (typeof direct === "string" && direct) return direct;
  return planThumbnailFromColors(product.colors);
}

const MAX_OVERRIDE_VALUE_LENGTH = 120;
const MAX_OVERRIDES = 200;
export const MARTINA_ALLOWED_SOURCE_CATEGORIES = ["Mujer", "Hombre"] as const;
export interface MartinaCategoryOverride { category: string; subcategory: string; }

/**
 * Fail-closed validation of the per-item category map (id -> existing
 * category name). Always enforces shape (non-empty ids and names); when the
 * caller resolves the taxonomy, values must exist in it.
 */
export function validateCategoryOverrides(
  categoryOverrides: Record<string, MartinaCategoryOverride>,
  assignableSubcategories?: string[],
): Record<string, MartinaCategoryOverride> {
  if (!categoryOverrides || typeof categoryOverrides !== "object" || Array.isArray(categoryOverrides)) {
    throw new Error("Mapa de categorías por ítem inválido.");
  }
  const entries = Object.entries(categoryOverrides);
  if (entries.length > MAX_OVERRIDES) throw new Error("Demasiadas categorías por ítem.");
  const validated: Record<string, MartinaCategoryOverride> = {};
  for (const [id, destination] of entries) {
    if (typeof id !== "string" || !id.trim() || !destination || typeof destination !== "object" || Array.isArray(destination)) {
      throw new Error("Cada categoría por ítem debe incluir categoría y subcategoría.");
    }
    const category = String((destination as MartinaCategoryOverride).category ?? "").trim();
    const subcategory = String((destination as MartinaCategoryOverride).subcategory ?? "").trim();
    if (!category || !subcategory || category.length > MAX_OVERRIDE_VALUE_LENGTH || subcategory.length > MAX_OVERRIDE_VALUE_LENGTH) {
      throw new Error("Cada categoría por ítem debe incluir categoría y subcategoría válidas.");
    }
    if (category !== "Ropa" || !/^(Mujer|Hombre)(?:\s*-\s*.+)?$/i.test(subcategory)) {
      throw new Error("Martina solo permite subcategorías existentes de Mujer u Hombre.");
    }
    if (assignableSubcategories !== undefined && !assignableSubcategories.includes(subcategory)) {
      throw new Error(`La subcategoría "${subcategory}" no existe en la taxonomía de Martina.`);
    }
    validated[id.trim()] = { category, subcategory };
  }
  return validated;
}

export async function buildPlan(
  products: ProductRow[],
  existing: Map<string, SyncExistingProduct>,
  campaignCode: string,
  observations = new Map<string, MartinaObservation>(),
  campaignEvidence: unknown = campaignCode,
  categoryOverrides: Record<string, MartinaCategoryOverride> = {},
  knownSourceCategories?: string[],
  assignableSubcategories?: string[],
): Promise<SyncPlan> {
  // Per-item category overrides (signed in the preview token, revalidated in
  // apply). Shape-validated here so preview and apply share one fail-closed
  // path. Taxonomy membership is enforced only when the caller resolves the
  // taxonomy; otherwise the admin UI restricts choices to getCategories
  // options and the signature binding prevents tampering.
  const overrides = validateCategoryOverrides(categoryOverrides, assignableSubcategories);
  const mutations: SyncPlan["mutations"] = [];
  const items: SyncPlanItem[] = products.map((p) => {
    const prev = existing.get(p.id);
    const originalPrice = p.original_price ?? null;
    const enOferta = Boolean(p.en_oferta);
    const availability = p.active ? "available" : "unavailable";
    let action: SyncActionType = p.active && p.price ? "create" : "unchanged";
    let reason = p.active ? "Disponible en catálogo" : "Sin variaciones seleccionables";
    const baseChanges = prev ? martinaChanges(p, prev) : { ...p };
    // Only a new item outside the permitted Martina clothing taxonomy needs
    // a decision. Existing products always retain the internal category.
    const needsCategoryDecision = Boolean(prev
      ? "categories" in baseChanges
      : p.active && p.price && knownSourceCategories !== undefined && !knownSourceCategories.includes(p.categories?.name ?? ""));
    const override = overrides[p.id];
    if (override !== undefined && !needsCategoryDecision) {
      throw new Error(`La categoría de ${p.id} no admite decisión por ítem: no es una fila discrepante.`);
    }
    // The effective product carries the chosen destination category (name
    // replaced, supplier subcategories preserved); without an override the
    // supplier value flows through unchanged.
    const effective: ProductRow = override !== undefined
      ? { ...p, categories: { name: override.category, count: 0, subcategories: [{ name: override.subcategory, count: 0 }] } }
      : p;
    const changes = prev ? martinaChanges(effective, prev) : { ...effective };
    if (prev && !isMartinaManaged(prev)) {
      action = "unknown";
      reason = "Producto no gestionado por Martina: se conserva";
    } else if (prev) {
      action = Object.keys(changes).length ? (changes.active === false ? "deactivate" : "update") : "unchanged";
      if (!prev.active) reason = "Inactivo: se conserva sin reactivar";
    }
    const priceChanged = action === "update" && ["price", "original_price", "en_oferta"].some((field) => field in changes);
    const availabilityChanged = action === "deactivate";
    if (action === "update") {
      reason = "Cambiar precio";
      if ("categories" in changes) {
        reason = priceChanged ? "Cambiar precio y reclasificar categoría" : "Reclasificar categoría";
      }
    }
    if (action === "create" || action === "update" || action === "deactivate") mutations.push({ id: p.id, previous: prev, changes });
    return { id: p.id, name: prev?.name ?? p.name, price: String(changes.price ?? prev?.price ?? p.price),
      originalPrice: prev && !("original_price" in changes) ? prev.original_price : originalPrice,
      enOferta: prev && !("en_oferta" in changes) ? prev.en_oferta : enOferta,
      action, availability, reason, priceChanged, availabilityChanged,
      image: planThumbnail(p), needsCategoryDecision };
  });
  for (const [id, observation] of observations) {
    const prev = existing.get(id);
    if (!prev || products.some((product) => product.id === id) || !isMartinaManaged(prev) || prev.active !== true) continue;
    const action = observation.availability === "unavailable" ? "deactivate" : observation.availability === "unknown" ? "unknown" : "unchanged";
    items.push({ id, name: prev.name ?? id, price: prev.price, originalPrice: prev.original_price, enOferta: prev.en_oferta, action, availability: observation.availability, reason: observation.reason, priceChanged: false, availabilityChanged: action === "deactivate", image: planThumbnailFromColors(prev.colors), needsCategoryDecision: false });
    if (action === "deactivate") mutations.push({ id, previous: prev, changes: { active: false } });
  }
  items.sort((left, right) => left.id.localeCompare(right.id));
  mutations.sort((left, right) => left.id.localeCompare(right.id));
  const summary: SyncPlanSummary = { create: 0, update: 0, unchanged: 0, deactivate: 0, unknown: 0, priceChanges: 0, availabilityChanges: 0 };
  for (const item of items) {
    summary[item.action]++;
    if (item.priceChanged) summary.priceChanges++;
    if (item.availabilityChanged) summary.availabilityChanges++;
  }
  const hash = await sha256Hex(JSON.stringify({ campaign: campaignEvidence, items,
    // The overrides map is hashed explicitly so any unsigned/tampered
    // per-item destination invalidates the plan in apply (409 fail-closed).
    categoryOverrides: Object.fromEntries(Object.entries(overrides).sort(([left], [right]) => left.localeCompare(right))),
    products: [...products].sort((left, right) => left.id.localeCompare(right.id))
      .map((product) => existing.has(product.id) ? { ...product, colors: undefined } : product),
    existing: [...existing.entries()].sort(([left], [right]) => left.localeCompare(right))
      .map(([id, previous]) => [id, { ...previous, colors: undefined }]),
    observations: [...observations.entries()].sort(([left], [right]) => left.localeCompare(right))
      .map(([id, observation]) => [id, { availability: observation.availability, reason: observation.reason }]),
    mutations: mutations.map((mutation) => ({ ...mutation,
      previous: mutation.previous ? { ...mutation.previous, colors: undefined } : undefined,
    })),
  }));
  return { campaignCode, items, summary, hash, mutations };
}

// ---------------------------------------------------------------------------
// PreviewSigner (HMAC)
// ---------------------------------------------------------------------------

export interface PreviewTokenPayload {
  exp: number;
  campaignCode: string;
  planHash: string;
  categoryOverrides?: Record<string, MartinaCategoryOverride>;
}

export async function signPreview(
  payload: PreviewTokenPayload,
  secret: string,
): Promise<string> {
  const body = JSON.stringify({
    exp: payload.exp,
    campaignCode: payload.campaignCode,
    planHash: payload.planHash,
    categoryOverrides: payload.categoryOverrides
      ? Object.fromEntries(Object.entries(payload.categoryOverrides).sort(([left], [right]) => left.localeCompare(right)))
      : undefined,
  });
  const payloadB64 = toBase64Url(new TextEncoder().encode(body));
  const signature = await hmacSign(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

export async function verifyPreview(
  token: string,
  secret: string,
  now: Date,
): Promise<PreviewTokenPayload | null> {
  const [payloadB64, signatureB64] = String(token ?? "").split(".");
  if (!payloadB64 || !signatureB64) return null;

  const valid = await hmacVerify(payloadB64, fromBase64Url(signatureB64), secret);
  if (!valid) return null;

  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
    if (
      !parsed ||
      typeof parsed.exp !== "number" ||
      typeof parsed.campaignCode !== "string" ||
      typeof parsed.planHash !== "string" ||
      (parsed.categoryOverrides !== undefined &&
        (typeof parsed.categoryOverrides !== "object" ||
          Array.isArray(parsed.categoryOverrides) ||
          Object.entries(parsed.categoryOverrides).some(
          ([id, value]) => typeof id !== "string" || !id.trim() || !value || typeof value !== "object" || Array.isArray(value),
          )))
    ) {
      return null;
    }
    if (now.getTime() >= parsed.exp) return null;
    return parsed as PreviewTokenPayload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// ProductRepository (port) + implementaciones
// ---------------------------------------------------------------------------

export interface SyncExistingProduct {
  id: string;
  price: string;
  en_oferta: boolean;
  original_price: string | null;
  name?: string;
  colors?: ProductRow["colors"];
  active?: boolean;
  source?: string;
  external_id?: string;
  auto_update_price?: boolean;
  temporary_price?: string | null;
  categories?: ProductRow["categories"];
}

export interface ProductRepository {
  readByIds(ids: string[]): Promise<Map<string, SyncExistingProduct>>;
  upsert(products: ProductRow[]): Promise<{ upserted: number; errors: number }>;
}

type SupabaseLike = { from: (table: string) => any };

async function readProductsByIds(
  client: SupabaseLike,
  ids: string[],
): Promise<Map<string, SyncExistingProduct>> {
  const map = new Map<string, SyncExistingProduct>();
  const CHUNK = 50;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await client
      .from("products")
      .select("id,name,price,en_oferta,original_price,colors,active,source,external_id,auto_update_price,temporary_price,categories")
      .in("id", chunk);
    if (error) throw new Error(`readByIds: ${error.message}`);
    for (const row of data ?? []) {
      map.set(row.id, {
        ...row,
        id: row.id,
        price: String(row.price ?? ""),
        en_oferta: Boolean(row.en_oferta),
        original_price: row.original_price == null ? null : String(row.original_price),
      });
    }
  }
  return map;
}

/** Persiste con service role (solo server). */
export class SupabaseProductRepository implements ProductRepository {
  constructor(private readonly context = "catalog") {}

  async readByIds(ids: string[]): Promise<Map<string, SyncExistingProduct>> {
    return readProductsByIds(getSupabaseAdmin(), ids);
  }

  async readActiveMartina(): Promise<Map<string, SyncExistingProduct>> {
    return readActiveMartinaProducts(getSupabaseAdmin());
  }

  async applyMartinaPlan(plan: SyncPlan): Promise<{ upserted: number; errors: number }> {
    const client: SupabaseLike = getSupabaseAdmin();
    let upserted = 0;
    for (const mutation of plan.mutations) {
      let query;
      if (!mutation.previous) {
        query = client.from("products").insert(mutation.changes);
      } else {
        const previous = mutation.previous;
        query = client.from("products").update(mutation.changes).eq("id", mutation.id);
        for (const field of ["active", "source", "external_id", "price", "original_price", "en_oferta", "auto_update_price", "temporary_price", "categories"] as const) {
          const value = previous[field];
          query = value == null ? query.is(field, null) : query.eq(field, typeof value === "object" ? JSON.stringify(value) : value);
        }
      }
      const { data, error } = await query.select("id");
      if (error || data?.length !== 1) {
        return { upserted, errors: plan.mutations.length - upserted };
      }
      upserted++;
    }
    return { upserted, errors: 0 };
  }

  async upsert(products: ProductRow[]): Promise<{ upserted: number; errors: number }> {
    if (products.length === 0) return { upserted: 0, errors: 0 };

    const supabase: SupabaseLike = getSupabaseAdmin();
    let upserted = 0;
    let errors = 0;

    const BATCH_SIZE = 50;
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);
      const existing = await this.readByIds(batch.map((p) => p.id));

      const toUpsert: Array<Record<string, unknown>> = [];
      for (const p of batch) {
        const prev = existing.get(p.id);
        const enOferta = Boolean(p.en_oferta);
        const originalPrice = p.original_price ?? null;
        if (
          prev &&
          prev.price === p.price &&
          prev.en_oferta === enOferta &&
          prev.original_price === originalPrice
        ) {
          continue;
        }
        toUpsert.push({
          id: p.id,
          name: p.name,
          description: p.description,
          price: p.price,
          img: p.img,
          categories: p.categories,
          payment_link: p.payment_link,
          relacionados: p.relacionados,
          en_oferta: enOferta,
          original_price: originalPrice,
          temporary_price: p.temporary_price ?? null,
          colors: p.colors || [],
          source: p.source,
          active: p.active,
          auto_update_price: p.auto_update_price,
          external_id: p.external_id,
        });
      }

      if (toUpsert.length === 0) continue;

      const { error } = await supabase
        .from("products")
        .upsert(toUpsert, { onConflict: "id", ignoreDuplicates: false });

      if (error) {
        console.error(
          `[providers-sync] provider=${this.context} upsert_batch=${i / BATCH_SIZE + 1} ` +
            `size=${toUpsert.length} error=${error.message}`,
          error,
        );
        errors += toUpsert.length;
      } else {
        upserted += toUpsert.length;
      }
    }

    return { upserted, errors };
  }
}

/**
 * Solo lectura: lee con la clave anónima (pública) y NUNCA escribe.
 * Es la implementación que usa el preview (no requiere service role).
 */
export class DryRunProductRepository implements ProductRepository {
  async readByIds(ids: string[]): Promise<Map<string, SyncExistingProduct>> {
    return readProductsByIds(getSupabase(), ids);
  }

  async upsert(): Promise<{ upserted: number; errors: number }> {
    return { upserted: 0, errors: 0 };
  }
}

// ---------------------------------------------------------------------------
// Orquestación
// ---------------------------------------------------------------------------

export interface MartinaSyncData {
  campaign: MartinaCampaign;
  products: ProductRow[];
  takeDetailLookup: () => boolean;
}

/** Returns only the existing display subcategories that belong to Ropa > Mujer/Hombre. */
export async function getMartinaAssignableSubcategories(): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin().from("products").select("id,name,categories,img");
  if (error) throw new Error(`No se pudo leer la taxonomía: ${error.message}`);
  const subcategories = new Set<string>();
  for (const row of data ?? []) {
    const product = {
      id: row.id ?? "",
      name: row.name ?? "",
      categories: row.categories ?? {},
      img: Array.isArray(row.img) ? row.img : [],
    } as any;
    if (getDisplayCategoryName(product) !== "Ropa") continue;
    for (const subcategory of getDisplaySubcategories(product)) {
      if (/^(Mujer|Hombre)(?:\s*-\s*.+)?$/i.test(subcategory)) subcategories.add(subcategory);
    }
  }
  return [...subcategories].sort((left, right) => left.localeCompare(right));
}

/** Consulta la campaña y el catálogo de Martina. Apply exige que siga vigente; preview es solo lectura. */
export async function collectMartinaData(
  countryId = "598",
  requireVigente = true,
): Promise<MartinaSyncData> {
  if (countryId !== "598") throw new Error("País Martina inválido");
  return syncMartina(undefined, new Date(), "Ropa", requireVigente);
}

export async function prepareMartinaPlan(data: MartinaSyncData, repository = new SupabaseProductRepository("Martina"), categoryOverrides: Record<string, MartinaCategoryOverride> = {}, knownSourceCategories?: string[], assignableSubcategories?: string[]): Promise<SyncPlan> {
  const existing = await repository.readActiveMartina();
  const incoming = await repository.readByIds(data.products.map((product) => product.id));
  for (const [id, product] of incoming) existing.set(id, product);
  const observations = await verifyAbsentMartinaProducts(data.products, existing, data.campaign.code, fetchMartinaProductById, data.takeDetailLookup);
  return buildPlan(data.products, existing, data.campaign.code, observations, data.campaign, categoryOverrides, knownSourceCategories, assignableSubcategories);
}

export interface PreviewResult {
  campaign: {
    code: string;
    countryId: string;
    validFrom: string;
    validTill: string;
    vigente: boolean;
  };
  summary: SyncPlanSummary;
  plan: SyncPlanItem[];
  hash: string;
  token: string;
  writeEnabled: boolean;
  expiresAt: number;
}

/** Genera un preview read-only con el estado administrativo completo. */
export async function generatePreview(categoryOverrides: Record<string, MartinaCategoryOverride> = {}, knownSourceCategories?: string[], assignableSubcategories?: string[]): Promise<PreviewResult> {
  const data = await collectMartinaData("598", false);
  const plan = await prepareMartinaPlan(data, new SupabaseProductRepository("Martina"), categoryOverrides, knownSourceCategories, assignableSubcategories);

  const now = new Date();
  const expiresAt = now.getTime() + PREVIEW_TTL_MS;
  const token = await signPreview(
    { exp: expiresAt, campaignCode: data.campaign.code, planHash: plan.hash, categoryOverrides },
    getPreviewSecret(),
  );

  return {
    campaign: {
      code: data.campaign.code,
      countryId: data.campaign.countryId,
      validFrom: data.campaign.validFrom.toISOString(),
      validTill: data.campaign.validTill.toISOString(),
      vigente: isVigente(data.campaign, now),
    },
    summary: plan.summary,
    plan: plan.items,
    hash: plan.hash,
    token,
    writeEnabled: isWriteEnabled(),
    expiresAt,
  };
}

export type ApplyResult =
  | { ok: true; upserted: number; errors: number; summary: SyncPlanSummary; campaignCode: string }
  | { ok: false; status: number; error: string };

/** Aplica un preview válido: revalida contra Martina antes de persistir. */
export async function applyMartinaSync(token: string, knownSourceCategories?: string[], assignableSubcategories?: string[]): Promise<ApplyResult> {
  if (!isWriteEnabled()) {
    return {
      ok: false,
      status: 403,
      error: "Escritura deshabilitada: MARTINA_SYNC_APPLY_ENABLED no es \"true\".",
    };
  }

  const payload = await verifyPreview(token, getPreviewSecret(), new Date());
  if (!payload) {
    return {
      ok: false,
      status: 403,
      error: "Preview inválido o vencido. Generá un preview nuevo.",
    };
  }

  const data = await collectMartinaData("598");
  const repository = new SupabaseProductRepository("Martina");
  // The plan is rebuilt WITH the signed overrides: unknown ids, shape
  // violations, non-discrepant targets or taxonomy mismatches throw here and
  // fail closed with 409 below.
  let plan: SyncPlan;
  try {
    plan = await prepareMartinaPlan(data, repository, payload.categoryOverrides ?? {}, knownSourceCategories, assignableSubcategories);
  } catch {
    return {
      ok: false,
      status: 409,
      error: "Las categorías por ítem del preview son inválidas. Generá un preview nuevo.",
    };
  }
  if (plan.hash !== payload.planHash || data.campaign.code !== payload.campaignCode || Date.now() >= payload.exp) {
    return {
      ok: false,
      status: 409,
      error: "Los datos de Martina cambiaron desde el preview. Generá un preview nuevo.",
    };
  }

  const result = await repository.applyMartinaPlan(plan);

  return {
    ok: true,
    upserted: result.upserted,
    errors: result.errors,
    summary: plan.summary,
    campaignCode: data.campaign.code,
  };
}
