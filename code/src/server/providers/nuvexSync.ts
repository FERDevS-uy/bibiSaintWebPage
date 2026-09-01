// nuvexSync.ts
// Núcleo server-side del sync de Nuvex desde el panel admin:
//  - Recolección con NuvexClient (login server-side + catálogo).
//  - Planner: diff entrantes vs existentes -> create|update|unchanged|absent + price_reason.
//  - Identificación por ID (product_id numérico) con fallback por nombre (determinista).
//  - Preview firmado (HMAC) + TTL + jti (nonce one-shot) + actor + decision set.
//  - Apply: revalidación contra Nuvex + validación de decisiones + anti-replay + límites.
import { getSupabaseAdmin } from "../supabase";
import type { ProductRow } from "./utils";
import { parsePrice, normalizeCategoryName } from "./utils";
import { NuvexClient } from "./nuvex/client";
import type { NuvexProductDraft } from "./nuvex/parser";
import { NUVEX_LIMITS } from "./nuvex/security";
import { getServerEnv } from "./martinaSync";
import { invalidateAllProductCaches } from "../products";
import { bumpCatalogVersion } from "../catalog/edgeCache";
import {
  buildPlan,
  type NuvexActionType,
  type NuvexExistingProduct,
  type NuvexPlanItem,
  type NuvexPlanSummary,
  type NuvexPriceReason,
} from "./nuvex/planner";

// Re-export para compatibilidad con endpoints/UI.
export type {
  NuvexActionType,
  NuvexExistingProduct,
  NuvexPlanItem,
  NuvexPlanSummary,
  NuvexPriceReason,
};
export { matchByName, buildPlan } from "./nuvex/planner";

const NUVEX_MARKUP = 1.4;
const PREVIEW_TTL_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Crypto (HMAC/sign) — helpers locales (Web Crypto, Worker/Node >= 19)
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

function getSecret(): string {
  const secret = getServerEnv("SYNC_PREVIEW_SECRET");
  if (!secret) throw new Error("SYNC_PREVIEW_SECRET no configurado (server-only)");
  return secret;
}

export function isWriteEnabled(): boolean {
  return getServerEnv("NUVEX_SYNC_APPLY_ENABLED") === "true";
}

// ---------------------------------------------------------------------------
// Tipos del plan (NuvexPlanItem/NuvexPlanSummary/acciones vienen de ./nuvex/planner)

export interface ApplyDecisionSet {
  confirmedUpdates: string[]; // product_id Nuvex a actualizar
  confirmedNameMatches: Record<string, string>; // product_id Nuvex -> id Supabase
  temporaryPrices: Record<string, string>; // product_id Nuvex -> precio manual validado
  deactivateIds: string[]; // product_id Nuvex a desactivar
}

export interface NuvexPreviewTokenPayload {
  exp: number;
  jti: string;
  actor: string;
  planHash: string;
  decisionHash: string;
}

// ---------------------------------------------------------------------------
// Recolección y mapeo a ProductRow
// ---------------------------------------------------------------------------

function draftToProductRow(d: NuvexProductDraft): ProductRow {
  const originalPrice =
    d.hasOffer && d.originalPriceRaw ? parsePrice(d.originalPriceRaw, NUVEX_MARKUP) : null;
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    price: d.price,
    img: d.images,
    categories: {
      name: normalizeCategoryName(d.categoryName, "General"),
      count: 0,
      subcategories: [],
    },
    payment_link: [{ id: "0", url: d.linkPago }],
    relacionados: [],
    en_oferta: d.hasOffer,
    original_price: originalPrice,
    colors: d.colors,
    source: "scraper",
    active: true,
    auto_update_price: false,
    external_id: d.id,
  };
}

async function buildNuvexClient(): Promise<NuvexClient> {
  const email = getServerEnv("NUVEX_USER_EMAIL");
  const password = getServerEnv("NUVEX_USER_PASS");
  if (!email || !password) {
    throw new Error(
      "Faltan credenciales de Nuvex: NUVEX_USER_EMAIL / NUVEX_USER_PASS (server-only).",
    );
  }
  return new NuvexClient({ email, password });
}

export async function collectNuvexData(): Promise<{ products: ProductRow[]; drafts: NuvexProductDraft[] }> {
  const client = await buildNuvexClient();
  const loggedIn = await client.login();
  if (!loggedIn) {
    throw new Error("No se pudo iniciar sesión en Nuvex con las credenciales server-only.");
  }
  const links = await client.discoverProductUrls();
  const drafts: NuvexProductDraft[] = [];
  // concurrencia fija
  const concurrency = NUVEX_LIMITS.concurrency;
  for (let i = 0; i < links.length; i += concurrency) {
    const batch = links.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((l) =>
        client.fetchProduct(l.url, l.catName).catch((e) => {
          console.error(`Nuvex: error en producto ${l.url}:`, e?.message || e);
          return null;
        }),
      ),
    );
    for (const r of results) if (r) drafts.push(r);
  }
  const products = drafts.map(draftToProductRow);
  // Dedupe por id: el mismo producto puede aparecer en varias categorías del
  // catálogo y un upsert con ids duplicados en un batch falla ("cannot affect
  // row a second time").
  const seen = new Set<string>();
  const uniqueProducts: ProductRow[] = [];
  for (const p of products) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    uniqueProducts.push(p);
  }
  return { products: uniqueProducts, drafts };
}

// ---------------------------------------------------------------------------
// Identificación y planner viven en ./nuvex/planner.ts (imports arriba).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Firma de preview (HMAC) + nonce
// ---------------------------------------------------------------------------

async function planHash(products: ProductRow[]): Promise<string> {
  const normalized = products
    .map((p) => ({ id: p.id, price: p.price, originalPrice: p.original_price ?? null, enOferta: Boolean(p.en_oferta) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return sha256Hex(JSON.stringify(normalized));
}

async function decisionHash(d: ApplyDecisionSet): Promise<string> {
  return sha256Hex(JSON.stringify(d));
}

function randomJti(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function signPreview(
  payload: NuvexPreviewTokenPayload,
  secret: string,
): Promise<string> {
  const body = JSON.stringify(payload);
  const payloadB64 = toBase64Url(new TextEncoder().encode(body));
  const signature = await hmacSign(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

export async function verifyPreview(
  token: string,
  secret: string,
  now: Date,
): Promise<NuvexPreviewTokenPayload | null> {
  const [payloadB64, signatureB64] = String(token ?? "").split(".");
  if (!payloadB64 || !signatureB64) return null;
  let parsed: NuvexPreviewTokenPayload | null = null;
  try {
    const valid = await hmacVerify(payloadB64, fromBase64Url(signatureB64), secret);
    if (!valid) return null;
    parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed.exp !== "number" ||
    typeof parsed.jti !== "string" ||
    typeof parsed.actor !== "string" ||
    typeof parsed.planHash !== "string" ||
    typeof parsed.decisionHash !== "string"
  ) {
    return null;
  }
  if (now.getTime() >= parsed.exp) return null;
  return parsed as NuvexPreviewTokenPayload;
}

// ---------------------------------------------------------------------------
// Repositorios (lectura autorizada server-side; apply con service role)
// ---------------------------------------------------------------------------

export class NuvexRepository {
  /** Lee el catálogo existente (incluye inactivos) usando service role (lectura autorizada). */
  async readExisting(): Promise<Map<string, NuvexExistingProduct>> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("products")
      .select("id, name, price, en_oferta, original_price, payment_link, img")
      .limit(5000);
    if (error) throw new Error(`readExisting: ${error.message}`);
    const map = new Map<string, NuvexExistingProduct>();
    for (const row of data ?? []) {
      const isNuvex = this.isNuvexProduct(row);
      if (!isNuvex) continue;
      map.set(row.id, {
        id: row.id,
        name: row.name ?? "",
        price: String(row.price ?? ""),
        en_oferta: Boolean(row.en_oferta),
        original_price: row.original_price == null ? null : String(row.original_price),
        img: Array.isArray(row.img) ? row.img.map((s: any) => String(s)) : [],
      });
    }
    return map;
  }

  private isNuvexProduct(row: any): boolean {
    if (typeof row.id === "string" && /^\d+$/.test(row.id)) return true;
    const links = Array.isArray(row.payment_link) ? row.payment_link : [];
    return links.some((l: any) => String(l?.url ?? "").includes("nuvex.uy"));
  }

  /** Registra el nonce jti como consumido. Devuelve true si se marcó (no estaba usado). */
  async consumeToken(jti: string, actor: string, planHash: string, expiresAt: number): Promise<boolean> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("preview_tokens")
      .select("jti")
      .eq("jti", jti)
      .maybeSingle();
    if (error) throw new Error(`consumeToken select: ${error.message}`);
    if (data) return false; // ya usado
    const { error: insError } = await supabase.from("preview_tokens").insert({
      jti,
      actor_id: actor,
      plan_hash: planHash,
      expires_at: new Date(expiresAt).toISOString(),
      consumed: true,
    });
    if (insError) throw new Error(`consumeToken insert: ${insError.message}`);
    return true;
  }

  /**
   * Lee las categorías (JSONB) existentes de los productos afectados para
   * preservar subcategorías en el upsert (onConflict: "id" sobrescribe el
   * JSONB completo). Solo lectura de id + categories.
   */
  private async readExistingCategories(
    ids: string[],
  ): Promise<Map<string, { name?: string; count?: number; subcategories?: Array<{ name: string; count: number }> }>> {
    const supabase = getSupabaseAdmin();
    const map = new Map<string, { name?: string; count?: number; subcategories?: Array<{ name: string; count: number }> }>();
    if (ids.length === 0) return map;
    const BATCH = 50;
    for (let i = 0; i < ids.length; i += BATCH) {
      const batchIds = ids.slice(i, i + BATCH);
      const { data, error } = await supabase
        .from("products")
        .select("id, categories")
        .in("id", batchIds);
      if (error) throw new Error(`readExistingCategories: ${error.message}`);
      for (const row of data ?? []) {
        const cats = row?.categories;
        if (!cats || typeof cats !== "object") continue;
        map.set(String(row.id), cats as { name?: string; count?: number; subcategories?: Array<{ name: string; count: number }> });
      }
    }
    return map;
  }

  /** Aplica el plan (upsert) y desactivaciones. Devuelve resumen. */
  async applyProducts(
    toUpsert: ProductRow[],
    deactivateIds: string[],
  ): Promise<{ upserted: number; deactivated: number; errors: number }> {
    const supabase = getSupabaseAdmin();
    let upserted = 0;
    let deactivated = 0;
    let errors = 0;

    // Merge de subcategorías: el upsert con onConflict: "id" sobrescribe el
    // JSONB categories completo. Si el draft trae subcategorías NO vacías se
    // usan las del draft (el sync actualiza); si trae vacías se preservan las
    // existentes de la fila (si no hay fila previa, quedan [] como hoy).
    const existingCategories = await this.readExistingCategories(toUpsert.map((r) => r.id));
    const rows = toUpsert.map((r) => {
      if (r.categories.subcategories.length > 0) return r;
      const prev = existingCategories.get(r.id);
      const prevSubs = prev?.subcategories;
      if (!prevSubs || prevSubs.length === 0) return r;
      return { ...r, categories: { ...r.categories, subcategories: prevSubs } };
    });

    const BATCH = 50;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const seenIds = new Set<string>();
      const deduped = batch.filter((r) => {
        if (seenIds.has(r.id)) return false;
        seenIds.add(r.id);
        return true;
      });
      if (deduped.length === 0) continue;
      const { error } = await supabase
        .from("products")
        .upsert(deduped, { onConflict: "id", ignoreDuplicates: false });
      if (error) {
        console.error(
          `nuvex upsert batch error (${deduped.length} filas, ids [${deduped
            .slice(0, 5)
            .map((r) => r.id)
            .join(",")}...]): ${error.message}`,
        );
        errors += deduped.length;
      } else {
        upserted += deduped.length;
      }
    }

    if (deactivateIds.length > 0) {
      for (let i = 0; i < deactivateIds.length; i += BATCH) {
        const ids = deactivateIds.slice(i, i + BATCH);
        const { error } = await supabase
          .from("products")
          .update({ active: false })
          .in("id", ids);
        if (error) errors++;
        else deactivated += ids.length;
      }
    }

    return { upserted, deactivated, errors };
  }
}

// ---------------------------------------------------------------------------
// Orquestación: preview / apply
// ---------------------------------------------------------------------------

export interface NuvexPreviewResult {
  summary: NuvexPlanSummary;
  plan: NuvexPlanItem[];
  hash: string;
  token: string;
  writeEnabled: boolean;
  expiresAt: number;
  totalIncoming: number;
}

/** Genera un preview read-only (NO escribe y NO usa service role de escritura). */
export async function generateNuvexPreview(actor: string): Promise<NuvexPreviewResult> {
  const { products } = await collectNuvexData();
  if (products.length === 0) {
    throw new Error("Nuvez devolvió 0 productos. Revisa credenciales o conectividad.");
  }

  const repo = new NuvexRepository();
  const existing = await repo.readExisting();
  const existingList = Array.from(existing.values());
  const { items, summary } = await buildPlan(products, existing, existingList);

  const now = new Date();
  const expiresAt = now.getTime() + PREVIEW_TTL_MS;
  const hash = await planHash(products);
  const emptyDecision: ApplyDecisionSet = {
    confirmedUpdates: [],
    confirmedNameMatches: {},
    temporaryPrices: {},
    deactivateIds: [],
  };
  const dh = await decisionHash(emptyDecision);
  const token = await signPreview(
    { exp: expiresAt, jti: randomJti(), actor, planHash: hash, decisionHash: dh },
    getSecret(),
  );

  const plan = items.slice(0, NUVEX_LIMITS.maxPreviewItems);

  return {
    summary,
    plan,
    hash,
    token,
    writeEnabled: isWriteEnabled(),
    expiresAt,
    totalIncoming: products.length,
  };
}

export type NuvexApplyResult =
  | { ok: true; upserted: number; deactivated: number; errors: number; summary: NuvexPlanSummary }
  | { ok: false; status: number; error: string };

// Lock en memoria por proveedor (mismo Worker); el nonce one-shot cubre cross-instancia.
let applyLock: Promise<void> | null = null;
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = applyLock ?? Promise.resolve();
  const run = prev.then(fn, fn);
  applyLock = run.then(() => undefined, () => undefined);
  return run;
}

function validatePrice(value: string): string {
  const cleaned = String(value ?? "").replace(/[^\d]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Precio manual inválido: debe ser un entero monetario positivo.");
  }
  if (n > 100_000_000) {
    throw new Error("Precio manual excede el límite permitido.");
  }
  return String(n);
}

/** Aplica un preview firmado y vigente con un decisionSet validado. */
export function applyNuvexSync(
  token: string,
  decisionSet: ApplyDecisionSet,
  actor: string,
): Promise<NuvexApplyResult> {
  return withLock(() => applyNuvexSyncLocked(token, decisionSet, actor));
}

async function applyNuvexSyncLocked(
  token: string,
  decisionSet: ApplyDecisionSet,
  actor: string,
): Promise<NuvexApplyResult> {
  if (!isWriteEnabled()) {
    return { ok: false, status: 403, error: "Escritura deshabilitada: NUVEX_SYNC_APPLY_ENABLED no es \"true\"." };
  }
  if (!decisionSet || typeof decisionSet !== "object") {
    return { ok: false, status: 400, error: "Falta decisionSet válido." };
  }

  const payload = await verifyPreview(token, getSecret(), new Date());
  if (!payload) {
    return { ok: false, status: 403, error: "Preview inválido o vencido. Generá un preview nuevo." };
  }
  if (payload.actor !== actor) {
    return { ok: false, status: 403, error: "El preview pertenece a otro administrador." };
  }

  const repo = new NuvexRepository();

  // Anti-replay: marcar jti como consumido (one-shot).
  const canConsume = await repo.consumeToken(payload.jti, actor, payload.planHash, payload.exp);
  if (!canConsume) {
    return { ok: false, status: 409, error: "Este preview ya fue usado." };
  }

  // Revalidar contra Nuvex (catálogo no cambió entre preview y apply).
  const { products } = await collectNuvexData();
  const rehash = await planHash(products);
  if (rehash !== payload.planHash) {
    return { ok: false, status: 409, error: "El catálogo de Nuvex cambió desde el preview. Generá un preview nuevo." };
  }

  // Recalcular plan y validar decisionSet.
  const existing = await repo.readExisting();
  const existingList = Array.from(existing.values());
  const { items, summary } = await buildPlan(products, existing, existingList);

  const confirmedSet = new Set(decisionSet.confirmedUpdates ?? []);
  const temporaryPrices = decisionSet.temporaryPrices ?? {};
  const deactivateIds = decisionSet.deactivateIds ?? [];
  const nameMatches = decisionSet.confirmedNameMatches ?? {};

  const toUpsert: ProductRow[] = [];
  const toDeactivate: string[] = [];

  for (const item of items) {
    const draft = products.find((p) => p.id === item.id);
    if (!draft) continue;

    const isConfirmed =
      item.action === "create" ||
      (item.action === "update" && (item.matchedBy === "id" ? confirmedSet.has(item.id) : true));

    // Coincidencia por nombre: exige confirmación explícita y match válido.
    if (item.matchedBy === "name") {
      const targetId = nameMatches[item.id];
      if (!targetId || targetId !== item.inferredMatchId) {
        continue; // no confirmada -> no se aplica
      }
    }

    // Precio faltante: si no hay precio y no se cargó manual, no sobrescribir.
    if (!draft.price) {
      if (existing.has(item.id)) {
        // conservar precio existente: aplicar otros campos pero sin precio vacío
        const prev = existing.get(item.id)!;
        draft.price = prev.price;
      } else if (temporaryPrices[item.id]) {
        draft.price = validatePrice(temporaryPrices[item.id]);
        draft["temporary_price"] = draft.price; // marca de origen manual
      } else {
        continue; // nuevo sin precio y sin manual -> no publicar
      }
    } else if (temporaryPrices[item.id]) {
      // precio manual sobre un precio existente: respetar el manual
      draft.price = validatePrice(temporaryPrices[item.id]);
      draft["temporary_price"] = draft.price;
    }

    if (!isConfirmed && item.action !== "create") continue;
    toUpsert.push(draft);
  }

  // Desactivaciones: solo IDs que estén ausentes en el catálogo actual.
  if (deactivateIds.length > 0) {
    if (deactivateIds.length > NUVEX_LIMITS.maxDeactivations) {
      return { ok: false, status: 400, error: `Demasiadas desactivaciones (máx ${NUVEX_LIMITS.maxDeactivations}).` };
    }
    const absentIds = new Set(items.filter((i) => i.action === "absent").map((i) => i.id));
    for (const id of deactivateIds) {
      if (absentIds.has(id)) toDeactivate.push(id);
    }
  }

  const result = await repo.applyProducts(toUpsert, toDeactivate);

  if (result.upserted > 0 || result.deactivated > 0) {
    invalidateAllProductCaches();
    try {
      await bumpCatalogVersion();
    } catch (e: any) {
      console.error("Error bumping catalog version after nuvex apply:", e?.message || e);
    }
  }

  // Auditoría server-side (sin credenciales ni datos sensibles).
  console.info(
    JSON.stringify({
      audit: "nuvex_apply",
      actor,
      planHash: payload.planHash,
      jti: payload.jti,
      decisionCounts: {
        confirmedUpdates: confirmedSet.size,
        nameMatches: Object.keys(nameMatches).length,
        temporaryPrices: Object.keys(temporaryPrices).length,
        deactivations: deactivateIds.length,
      },
      result: {
        upserted: result.upserted,
        deactivated: result.deactivated,
        errors: result.errors,
      },
    }),
  );

  return {
    ok: true,
    upserted: result.upserted,
    deactivated: result.deactivated,
    errors: result.errors,
    summary,
  };
}
