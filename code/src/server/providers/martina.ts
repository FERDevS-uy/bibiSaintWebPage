import {
  delay,
  normalizeText,
  cleanDescription,
  martinaFetch,
  normalizeCategoryName,
  type ProductRow,
} from "./utils.ts";
import { normalizeProductPrice } from "./martinaNormalizer.ts";
import { normalizeSizes } from "../../utils/sizes.ts";
import { parseCampaign, isVigente, type MartinaCampaign } from "./martinaCampaign.ts";
import { evaluateMartinaAvailability, parseMartinaProducts } from "./martinaAvailability.ts";

const MARTINA_STORE_PRODUCT_BASE =
  "https://pol21.martinaditrento.com/mdt-services/resources/store/product";
const MARTINA_CONFIG_URL =
  "https://pol21.martinaditrento.com/mdt-services/resources/ecommerce/config";
const MARTINA_IMAGE_BASE =
  "https://pol21.martinaditrento.com/images/products/md/";
const MARTINA_SELLER_CODE = "U20371400";

const FETCH_HEADERS = {
  accept: "application/json, text/plain, */*",
  Referer: "https://tienda.martinaditrento.com/",
};

function normalizeMartinaPayloadToArray(data: any): any[] {
  return parseMartinaProducts(data);
}

function normalizeMartinaCatalogPayloadToArray(data: unknown): any[] {
  const products = parseMartinaProducts(data);
  if (products.some((product) => {
    const entry = product as Record<string, unknown> | null;
    return entry?.error || entry?.success === false;
  })) {
    throw new Error("Catálogo Martina incompleto o inválido; no se puede reconciliar stock.");
  }
  if (!Array.isArray(data)) {
    const envelope = data as Record<string, unknown>;
    const collectionKeys = ["data", "products", "result"].filter((key) => key in envelope);
    if (
      collectionKeys.length !== 1 ||
      Object.keys(envelope).some((key) => ![...collectionKeys, "success", "error", "status", "errors"].includes(key)) ||
      ("success" in envelope && envelope.success !== true) ||
      ("error" in envelope && envelope.error !== null && envelope.error !== false) ||
      ("status" in envelope && envelope.status !== "ok") ||
      ("errors" in envelope && (
        envelope.errors === null ||
        typeof envelope.errors !== "object" ||
        Object.getPrototypeOf(envelope.errors) !== Object.prototype ||
        Object.keys(envelope.errors).length !== 0
      ))
    ) {
      throw new Error("Catálogo Martina incompleto o inválido; no se puede reconciliar stock.");
    }
  }
  return products;
}

function extractMartinaColorNodes(
  variation: any,
): Array<{ id: number; hex: string; name: string; sizes: string[] }> {
  if (!variation) return [];
  if (variation.id === "color" && Array.isArray(variation.variationValues)) {
    return variation.variationValues.map((c: any) => {
      const sizes: string[] = Array.isArray(c?.variation?.variationValues)
        ? c.variation.variationValues
            .map((sz: any) => String(sz?.description ?? "").trim())
            .filter(Boolean)
        : [];
      return {
        id: Number(c?.id),
        hex: String(c?.colorHex ?? "").trim() || "#cccccc",
        name: String(c?.description ?? "").trim(),
        sizes,
      };
    });
  }
  if (Array.isArray(variation.variationValues)) {
    return variation.variationValues.flatMap((item: any) =>
      extractMartinaColorNodes(item.variation),
    );
  }
  return [];
}

function groupMartinaImagesByColor(
  images: string[],
  code: string,
): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  images.forEach((filename: string) => {
    const m = filename.match(new RegExp(`^${code}_(\\d+)_`));
    if (!m) return;
    const colorId = m[1];
    if (!grouped[colorId]) grouped[colorId] = [];
    grouped[colorId].push(`${MARTINA_IMAGE_BASE}${filename}`);
  });
  return grouped;
}

export async function fetchMartinaConfig(
  country: string = "598",
): Promise<any> {
  return martinaFetch(
    `${MARTINA_CONFIG_URL}?countryId=${encodeURIComponent(country)}&sellerCode=${encodeURIComponent(MARTINA_SELLER_CODE)}`,
    20000,
    FETCH_HEADERS,
  );
}

async function fetchStoreProductForCode(
  country: string,
  code: string,
): Promise<any[]> {
  const url = `${MARTINA_STORE_PRODUCT_BASE}?countryId=${encodeURIComponent(country)}&code=${encodeURIComponent(code)}&sellerCode=${encodeURIComponent(MARTINA_SELLER_CODE)}`;
  try {
    const data = await martinaFetch(url, 30000, FETCH_HEADERS);
    return normalizeMartinaCatalogPayloadToArray(data);
  } catch (e: any) {
    console.warn(`Martina: error code=${code}:`, e?.message || e);
    throw e;
  }
}

async function fetchStoreProductByProductLine(
  country: string,
  code: string,
  productLineId: string | number,
  category: string,
): Promise<any[]> {
  const url = `${MARTINA_STORE_PRODUCT_BASE}?countryId=${country}&code=${encodeURIComponent(
    String(code),
  )}&productLineId=${encodeURIComponent(String(productLineId))}&sellerCode=${encodeURIComponent(MARTINA_SELLER_CODE)}&category=${encodeURIComponent(
    String(category || ""),
  )}`;
  try {
    const data = await martinaFetch(url, 30000, FETCH_HEADERS);
    return normalizeMartinaCatalogPayloadToArray(data);
  } catch (e: any) {
    console.warn(
      `Martina: error productLine=${productLineId}:`,
      e?.message || e,
    );
    throw e;
  }
}

async function fetchStoreProductByProductId(
  country: string,
  code: string,
  productId: string | number,
): Promise<any[]> {
  const url = `${MARTINA_STORE_PRODUCT_BASE}?productId=${encodeURIComponent(
    String(productId),
  )}&code=${encodeURIComponent(String(code))}&countryId=${encodeURIComponent(String(country))}&sellerCode=${encodeURIComponent(MARTINA_SELLER_CODE)}`;
  try {
    const data = await martinaFetch(url, 30000, FETCH_HEADERS);
    const entries = normalizeMartinaPayloadToArray(data);
    if (entries.some((entry) => String(entry?.id ?? entry?.productId) !== String(productId)) || evaluateMartinaAvailability(entries) === "unknown") {
      throw new Error("Respuesta de producto Martina inválida");
    }
    return entries;
  } catch (e: any) {
    console.warn(`Martina: error productId=${productId}:`, e?.message || e);
    throw e;
  }
}

/** Consulta un producto puntual de Martina con la campaña/código indicados. */
export async function fetchMartinaProductById(
  productId: string,
  code: string,
  countryId = "598",
): Promise<any[]> {
  return fetchStoreProductByProductId(countryId, code, productId);
}

export interface MartinaColorDetail {
  id: number;
  hex: string;
  name: string;
  rawSizes: string[];
  sizes: string[];
}

/** Extrae colores + talles de las entries de store/product (formato cliente). */
export function extractMartinaColorDetails(
  entries: any[],
): MartinaColorDetail[] {
  const colorMap = new Map<
    number,
    { id: number; hex: string; name: string; rawSizes: Set<string> }
  >();

  entries.forEach((entry) => {
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

  return Array.from(colorMap.values()).map((c) => ({
    id: c.id,
    hex: c.hex,
    name: c.name,
    rawSizes: Array.from(c.rawSizes),
    sizes: normalizeSizes(Array.from(c.rawSizes)),
  }));
}

function detectCodeFromEntry(entry: any): string | null {
  if (!entry || typeof entry !== "object") return null;
  if (entry.code) return String(entry.code);
  if (entry.codigo) return String(entry.codigo);
  if (entry.productCode) return String(entry.productCode);
  if (Array.isArray(entry.images)) {
    for (const im of entry.images) {
      const fname = String(im || "");
      const m = fname.match(/^(\d+)_/);
      if (m) return m[1];
      const m2 = fname.match(/(?:\/)?(\d+)_\d+_\d+/);
      if (m2) return m2[1];
    }
  }
  return null;
}

/** Elige la entry más informativa para precio: prefiere la que trae descuento (price1 > price). */
function pickPricingEntry(entries: any[]): any {
  const withPrice = entries.filter(
    (e) => e && e.price != null && String(e.price) !== "",
  );
  if (withPrice.length === 0) return entries[0] || null;
  const discounted = withPrice.find((e) => {
    const p = parseFloat(String(e?.price ?? ""));
    const p1 = parseFloat(String(e?.price1 ?? ""));
    return Number.isFinite(p) && Number.isFinite(p1) && p1 > p;
  });
  return discounted || withPrice[0];
}

export async function syncMartina(
  campaignInput?: string | MartinaCampaign,
  now = new Date(),
  categoryOverride = "Ropa",
  requireVigente = true,
): Promise<{ products: ProductRow[]; count: number; campaign: MartinaCampaign; takeDetailLookup: () => boolean }> {
  console.log("Martina: iniciando sync...");
  let detailLookups = 0;
  const takeDetailLookup = () => {
    if (detailLookups >= 20) return false;
    detailLookups++;
    return true;
  };

  const countryId = "598";
  const campaign = typeof campaignInput === "object"
    ? campaignInput
    : parseCampaign(await fetchMartinaConfig(countryId));
  if (
    (requireVigente && !isVigente(campaign, now)) ||
    (typeof campaignInput === "string" && campaignInput !== campaign.code)
  ) {
    throw new Error("Campaña Martina no vigente. Genere una nueva vista previa.");
  }
  const resolvedCampaignCode = campaign.code;
  const codes = [resolvedCampaignCode];

  const allFetchedItems: any[] = [];

  if (codes.length > 0) {
    console.log(
      `Martina: ${codes.length} codes detectados: ${codes.join(", ")}`,
    );
    const concurrency = 3;
    const batches: string[][] = [];
    for (let i = 0; i < codes.length; i += concurrency) {
      batches.push(codes.slice(i, i + concurrency));
    }
    for (const batch of batches) {
      const results = await Promise.all(
        batch.map((code) => fetchStoreProductForCode(countryId, code)),
      );
      results.forEach((arr, idx) => {
        if (!Array.isArray(arr)) return;
        const code = batch[idx];
        arr.forEach((it) => {
          if (it && typeof it === "object") it.code = it.code || code;
          allFetchedItems.push(it);
        });
      });
      await delay(150 + Math.floor(Math.random() * 200));
    }
  }

  if (allFetchedItems.length === 0) {
    console.log("Martina: sin codes, usando catálogo por productLine");
    const codeToUse = resolvedCampaignCode;
    const productLines = [
      { productLineId: "3325", category: "HOMBRE" },
      { productLineId: "3324", category: "MUJER" },
    ];

    const detailByProductId = new Map<string, any | null>();

    for (const pl of productLines) {
      try {
        const arr = await fetchStoreProductByProductLine(
          countryId,
          codeToUse,
          pl.productLineId,
          pl.category,
        );
        if (arr.some((entry) => !/^\d+$/.test(String(entry?.id ?? entry?.productId ?? "")) || evaluateMartinaAvailability([entry]) === "unknown")) {
          throw new Error("Línea de catálogo Martina incompleta o inválida");
        }
        for (const it of [...arr].sort((left, right) => String(left.id ?? left.productId).localeCompare(String(right.id ?? right.productId)))) {
          if (it && typeof it === "object") {
            const providerId = String(it.id ?? it.productId ?? "").trim();
            const hasImages = Array.isArray(it.images) && it.images.length > 0;
            if (!hasImages && providerId && (detailByProductId.has(providerId) || takeDetailLookup())) {
              let detail = detailByProductId.get(providerId);
              if (detail === undefined) {
                const detailArr = await fetchStoreProductByProductId(
                  countryId,
                  codeToUse,
                  providerId,
                ).catch(() => []);
                detail =
                  detailArr.find(
                    (d: any) =>
                      String(d?.id ?? d?.productId ?? "") === providerId,
                  ) ||
                  detailArr[0] ||
                  null;
                detailByProductId.set(providerId, detail);
              }
              if (
                detail &&
                Array.isArray(detail.images) &&
                detail.images.length > 0
              ) {
                it.images = detail.images;
              }
              if (detail && detail.mainImage) {
                it.mainImage = detail.mainImage;
              }
            }
            const detected = detectCodeFromEntry(it);
            if (!it.code && detected) it.code = detected;
            it.code = it.code || codeToUse;
            it.productLineId = pl.productLineId;
            allFetchedItems.push(it);
          }
        }
      } catch (err: any) {
        console.warn("Martina: error en productLine", pl, err?.message || err);
        throw err;
      }
      await delay(150 + Math.floor(Math.random() * 200));
    }
  }

  if (allFetchedItems.length === 0) {
    throw new Error("Catálogo Martina vacío sin evidencia de exhaustividad; no se puede reconciliar stock.");
  }

  console.log(`Martina: ${allFetchedItems.length} items recuperados`);

  const byCode = new Map<string, any[]>();
  allFetchedItems.forEach((p: any) => {
    const code = String(p?.id ?? p?.productId ?? "").trim();
    if (!/^\d+$/.test(code) || evaluateMartinaAvailability([p]) === "unknown") {
      throw new Error("Catálogo Martina incompleto o inválido; no se puede reconciliar stock.");
    }
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code)!.push(p);
  });

  console.log(`Martina: ${byCode.size} productos únicos (agrupados por code)`);

  const products: ProductRow[] = [];

  byCode.forEach((entries, code) => {
    const first = entries[0];
    const name = normalizeText(first?.name || "");
    const description = cleanDescription(
      [first?.description, first?.description2, first?.description3]
        .filter(Boolean)
        .join(" "),
    );
    const pricing = pickPricingEntry(entries);
    const { price, originalPrice, enOferta } = normalizeProductPrice(
      pricing?.price ?? "",
      pricing?.price1 ?? "",
    );

    const supplierParentCategory = normalizeCategoryName(
      String(first?.productLine?.parent?.name || ""),
      "",
    );
    // Keep an external parent for new products outside Martina's clothing
    // taxonomy so the preview can require a human placement. Existing rows
    // keep their curated internal category during reconciliation.
    const categoryName = supplierParentCategory || normalizeCategoryName(categoryOverride, "Ropa");
    const subcategoria = normalizeCategoryName(
      String(first?.productLine?.name || ""),
      "",
    );

    const colorById = new Map<
      number,
      {
        id: number;
        hex: string;
        name: string;
        sizes: string[];
        images: string[];
      }
    >();
    entries.forEach((entry) => {
      const colorNodes = extractMartinaColorNodes(entry?.variation);
      const imagesByColor = groupMartinaImagesByColor(
        Array.isArray(entry?.images) ? entry.images : [],
        detectCodeFromEntry(entry) || code,
      );
      colorNodes.forEach((c) => {
        if (!Number.isFinite(c.id)) return;
        if (!colorById.has(c.id)) {
          colorById.set(c.id, {
            ...c,
            images: imagesByColor[String(c.id)] || [],
          });
        } else {
          const existing = colorById.get(c.id)!;
          const merged = new Set([...existing.sizes, ...c.sizes]);
          existing.sizes = Array.from(merged);
          const extra = imagesByColor[String(c.id)] || [];
          const seen = new Set(existing.images);
          extra.forEach((img) => {
            if (!seen.has(img)) {
              existing.images.push(img);
              seen.add(img);
            }
          });
        }
      });
    });

    const colors = Array.from(colorById.values());

    const allImages: string[] = [];
    const seenImg = new Set<string>();
    colors.forEach((c) => {
      c.images.forEach((img) => {
        if (!seenImg.has(img)) {
          allImages.push(img);
          seenImg.add(img);
        }
      });
    });

    if (allImages.length === 0 && first?.mainImage) {
      allImages.push(`${MARTINA_IMAGE_BASE}${first.mainImage}`);
    }

    const colorsData = colors.map((c) => ({
      id: c.id,
      hex: c.hex,
      name: c.name,
      images: c.images,
      sizes: c.sizes,
    }));

    const subcategorias =
      subcategoria && subcategoria !== categoryName ? subcategoria : "";

    const providerId = String(first?.id ?? code).trim();

    products.push({
      id: `mdt-${providerId}`,
      name,
      description,
      price,
      img: allImages,
      categories: {
        name: categoryName,
        count: 0,
        subcategories: subcategorias ? [{ name: subcategorias, count: 0 }] : [],
      },
      payment_link: [{ id: "0", url: "" }],
      relacionados: [],
      en_oferta: enOferta,
      original_price: originalPrice,
      colors: colorsData,
      source: "scraper",
      active: evaluateMartinaAvailability(entries) === "available",
      auto_update_price: false,
      external_id: providerId,
    });
  });

  console.log(`Martina: ${products.length} productos listos para upsert`);
  return { products, count: products.length, campaign, takeDetailLookup };
}
