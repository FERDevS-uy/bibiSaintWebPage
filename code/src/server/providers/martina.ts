import { delay, normalizeText, cleanDescription, parsePrice, martinaFetch, type ProductRow } from "./utils";

const MARTINA_STORE_PRODUCT_BASE = "https://pol21.martinaditrento.com/mdt-services/resources/store/product";
const MARTINA_CONFIG_URL = "https://pol21.martinaditrento.com/mdt-services/resources/ecommerce/config";
const MARTINA_IMAGE_BASE = "https://pol21.martinaditrento.com/images/products/md/";

const FETCH_HEADERS = {
  accept: "application/json, text/plain, */*",
  Referer: "https://tienda.martinaditrento.com/",
};

function normalizeMartinaPayloadToArray(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.products)) return data.products;
  if (Array.isArray(data.result)) return data.result;

  const walkFindArray = (o: any): any[] | null => {
    if (!o || typeof o !== "object") return null;
    if (Array.isArray(o) && o.length > 0 && typeof o[0] === "object") return o;
    for (const k of Object.keys(o)) {
      const res = walkFindArray(o[k]);
      if (res) return res;
    }
    return null;
  };
  return walkFindArray(data) || [];
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

async function fetchMartinaCodes(country: string): Promise<string[]> {
  try {
    const data = await martinaFetch(`${MARTINA_CONFIG_URL}?countryId=${country}`, 20000);
    const payload = data && data.data ? data.data : data || {};
    const found: Set<string> = new Set();
    const walk = (obj: any) => {
      if (!obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) {
        const sample = obj.find((it: any) => it && (it.code || it.codigo));
        if (sample && (sample.code || sample.codigo)) {
          obj.forEach((it: any) => {
            const c = it.code || it.codigo || (it.id && String(it.id));
            if (c) found.add(String(c));
          });
          return;
        }
        for (const item of obj) walk(item);
        return;
      }
      for (const k of Object.keys(obj)) {
        const val = obj[k];
        if (k.toLowerCase().includes("campaign") && Array.isArray(val)) {
          val.forEach((it: any) => {
            const c = it.code || it.codigo || (it.id && String(it.id));
            if (c) found.add(String(c));
          });
        }
        walk(val);
      }
    };
    walk(payload);
    return Array.from(found);
  } catch (e: any) {
    console.warn("Martina: no se pudo obtener config:", e?.message || e);
    return [];
  }
}

async function fetchStoreProductForCode(
  country: string,
  code: string,
): Promise<any[]> {
  const url = `${MARTINA_STORE_PRODUCT_BASE}?countryId=${country}&code=${encodeURIComponent(code)}`;
  try {
    const data = await fetchJson(url, 30000);
    return normalizeMartinaPayloadToArray(data);
  } catch (e: any) {
    console.warn(`Martina: error code=${code}:`, e?.message || e);
    return [];
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
  )}&productLineId=${encodeURIComponent(String(productLineId))}&category=${encodeURIComponent(
    String(category || ""),
  )}`;
  try {
    const data = await fetchJson(url, 30000);
    return normalizeMartinaPayloadToArray(data);
  } catch (e: any) {
    console.warn(`Martina: error productLine=${productLineId}:`, e?.message || e);
    return [];
  }
}

async function fetchStoreProductByProductId(
  country: string,
  code: string,
  productId: string | number,
): Promise<any[]> {
  const url = `${MARTINA_STORE_PRODUCT_BASE}?productId=${encodeURIComponent(
    String(productId),
  )}&code=${encodeURIComponent(String(code))}&countryId=${encodeURIComponent(String(country))}`;
  try {
    const data = await fetchJson(url, 30000);
    return normalizeMartinaPayloadToArray(data);
  } catch (e: any) {
    console.warn(`Martina: error productId=${productId}:`, e?.message || e);
    return [];
  }
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

export async function syncMartina(): Promise<{ products: ProductRow[]; count: number }> {
  console.log("Martina: iniciando sync...");

  const countryId = "598";
  let codes: string[] = [];

  try {
    codes = await fetchMartinaCodes(countryId);
  } catch {
    codes = [];
  }

  const allFetchedItems: any[] = [];

  if (codes.length > 0) {
    console.log(`Martina: ${codes.length} codes detectados: ${codes.join(", ")}`);
    const concurrency = 3;
    const batches: string[][] = [];
    for (let i = 0; i < codes.length; i += concurrency) {
      batches.push(codes.slice(i, i + concurrency));
    }
    for (const batch of batches) {
      const results = await Promise.all(batch.map((code) => fetchStoreProductForCode(countryId, code)));
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
    const codeToUse = "202605";
    const productLines = [
      { productLineId: "3325", category: "HOMBRE" },
      { productLineId: "3324", category: "MUJER" },
    ];

    const detailByProductId = new Map<string, any | null>();

    for (const pl of productLines) {
      try {
        const arr = await fetchStoreProductByProductLine(countryId, codeToUse, pl.productLineId, pl.category);
        if (!Array.isArray(arr)) continue;
        for (const it of arr) {
          if (it && typeof it === "object") {
            const providerId = String(it.id ?? it.productId ?? "").trim();
            const hasImages = Array.isArray(it.images) && it.images.length > 0;
            if (!hasImages && providerId) {
              let detail = detailByProductId.get(providerId);
              if (detail === undefined) {
                const detailArr = await fetchStoreProductByProductId(countryId, codeToUse, providerId);
                detail =
                  detailArr.find((d: any) => String(d?.id ?? d?.productId ?? "") === providerId) ||
                  detailArr[0] ||
                  null;
                detailByProductId.set(providerId, detail);
              }
              if (detail && Array.isArray(detail.images) && detail.images.length > 0) {
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
      }
      await delay(150 + Math.floor(Math.random() * 200));
    }
  }

  console.log(`Martina: ${allFetchedItems.length} items recuperados`);

  const byCode = new Map<string, any[]>();
  allFetchedItems.forEach((p: any) => {
    const code = String(p?.code ?? p?.id ?? "").trim();
    if (!code) return;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code)!.push(p);
  });

  console.log(`Martina: ${byCode.size} productos únicos (agrupados por code)`);

  const products: ProductRow[] = [];

  byCode.forEach((entries, code) => {
    const first = entries[0];
    const name = normalizeText(first?.name || "");
    const description = cleanDescription(
      [first?.description, first?.description2, first?.description3].filter(Boolean).join(" "),
    );
    const price = parsePrice(first?.price ?? "", 1);
    const enOferta = first?.price1 && parseFloat(String(first.price1)) > parseFloat(String(first.price ?? 0));

    const categoryName = String(
      first?.productLine?.parent?.name || first?.productLine?.name || "Ropa",
    );
    const subcategoria = String(first?.productLine?.name || "");

    const colorById = new Map<number, { id: number; hex: string; name: string; sizes: string[]; images: string[] }>();
    entries.forEach((entry) => {
      const colorNodes = extractMartinaColorNodes(entry?.variation);
      const imagesByColor = groupMartinaImagesByColor(
        Array.isArray(entry?.images) ? entry.images : [],
        code,
      );
      colorNodes.forEach((c) => {
        if (!Number.isFinite(c.id)) return;
        if (!colorById.has(c.id)) {
          colorById.set(c.id, { ...c, images: imagesByColor[String(c.id)] || [] });
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

    if (colors.length === 0) {
      console.log(`Martina: omitiendo producto sin colores (posible descontinuado): code=${code}, id=${first?.id}`);
      return;
    }

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
      colors: colorsData,
      source: "scraper",
      active: true,
      auto_update_price: false,
      external_id: providerId,
    });
  });

  console.log(`Martina: ${products.length} productos listos para upsert`);
  return { products, count: products.length };
}
