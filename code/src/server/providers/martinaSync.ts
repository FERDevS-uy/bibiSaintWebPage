// martinaSync.ts
// Núcleo server-side del sync administrativo de Martina di Trento:
//  - SyncPlanner (puro): diff entrantes vs existentes → create|update|unchanged + hash.
//  - PreviewSigner (HMAC): firma el plan con SYNC_PREVIEW_SECRET + expiración.
//  - ProductRepository (port) + implementaciones Supabase (service role) y DryRun (solo lectura).
//  - Orquestación: collectMartinaData / generatePreview / applyMartinaSync.

import { getSupabase, getSupabaseAdmin } from "../supabase";
import { fetchMartinaConfig, syncMartina } from "./martina";
import { parseCampaign, isVigente, type MartinaCampaign } from "./martinaCampaign";
import type { ProductRow } from "./utils";

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
  return crypto.subtle.verify("HMAC", key, signature, new TextEncoder().encode(data));
}

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return toBase64Url(new Uint8Array(digest));
}

// ---------------------------------------------------------------------------
// SyncPlanner (función pura)
// ---------------------------------------------------------------------------

export type SyncActionType = "create" | "update" | "unchanged";

export interface SyncPlanItem {
  id: string;
  name: string;
  price: string;
  originalPrice: string | null;
  enOferta: boolean;
  action: SyncActionType;
}

export interface SyncPlanSummary {
  create: number;
  update: number;
  unchanged: number;
}

export interface SyncPlan {
  campaignCode: string;
  items: SyncPlanItem[];
  summary: SyncPlanSummary;
  hash: string;
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

export async function buildPlan(
  products: ProductRow[],
  existing: Map<string, SyncExistingProduct>,
  campaignCode: string,
): Promise<SyncPlan> {
  const items: SyncPlanItem[] = products.map((p) => {
    const prev = existing.get(p.id);
    const originalPrice = p.original_price ?? null;
    const enOferta = Boolean(p.en_oferta);

    let action: SyncActionType = "create";
    if (prev) {
      const changed =
        prev.price !== p.price ||
        prev.original_price !== originalPrice ||
        prev.en_oferta !== enOferta;
      action = changed ? "update" : "unchanged";
    }

    return { id: p.id, name: p.name, price: p.price, originalPrice, enOferta, action };
  });

  const summary: SyncPlanSummary = { create: 0, update: 0, unchanged: 0 };
  for (const item of items) summary[item.action]++;

  return { campaignCode, items, summary, hash: await planHash(products, campaignCode) };
}

// ---------------------------------------------------------------------------
// PreviewSigner (HMAC)
// ---------------------------------------------------------------------------

export interface PreviewTokenPayload {
  exp: number;
  campaignCode: string;
  planHash: string;
}

export async function signPreview(
  payload: PreviewTokenPayload,
  secret: string,
): Promise<string> {
  const body = JSON.stringify({
    exp: payload.exp,
    campaignCode: payload.campaignCode,
    planHash: payload.planHash,
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
      typeof parsed.planHash !== "string"
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
      .select("id, price, en_oferta, original_price")
      .in("id", chunk);
    if (error) throw new Error(`readByIds: ${error.message}`);
    for (const row of data ?? []) {
      map.set(row.id, {
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
  async readByIds(ids: string[]): Promise<Map<string, SyncExistingProduct>> {
    return readProductsByIds(getSupabaseAdmin(), ids);
  }

  async upsert(products: ProductRow[]): Promise<{ upserted: number; errors: number }> {
    if (products.length === 0) return { upserted: 0, errors: 0 };

    const supabase = getSupabaseAdmin();
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
        console.error(`Martina: error en batch ${i / BATCH_SIZE + 1}:`, error.message);
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
}

/** Consulta la campaña vigente (ecommerce/config) y el catálogo de Martina. */
export async function collectMartinaData(countryId = "598"): Promise<MartinaSyncData> {
  const configRaw = await fetchMartinaConfig(countryId);
  const campaign = parseCampaign(configRaw);
  const { products } = await syncMartina(campaign.code);
  return { campaign, products };
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

/** Genera un preview read-only: NO escribe y NO usa service role. */
export async function generatePreview(): Promise<PreviewResult> {
  const data = await collectMartinaData();
  const repository = new DryRunProductRepository();
  const existing = await repository.readByIds(data.products.map((p) => p.id));
  const plan = await buildPlan(data.products, existing, data.campaign.code);

  const now = new Date();
  const expiresAt = now.getTime() + PREVIEW_TTL_MS;
  const token = await signPreview(
    { exp: expiresAt, campaignCode: data.campaign.code, planHash: plan.hash },
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
export async function applyMartinaSync(token: string): Promise<ApplyResult> {
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

  const data = await collectMartinaData();
  const rehash = await planHash(data.products, data.campaign.code);
  if (rehash !== payload.planHash) {
    return {
      ok: false,
      status: 409,
      error: "Los datos de Martina cambiaron desde el preview. Generá un preview nuevo.",
    };
  }

  const repository = new SupabaseProductRepository();
  const existing = await repository.readByIds(data.products.map((p) => p.id));
  const plan = await buildPlan(data.products, existing, data.campaign.code);
  const result = await repository.upsert(data.products);

  return {
    ok: true,
    upserted: result.upserted,
    errors: result.errors,
    summary: plan.summary,
    campaignCode: data.campaign.code,
  };
}