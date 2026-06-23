import { normalizeText, cleanDescription, parsePrice, getUniqueColors, appendColorsToName, inferSubcategory, fetchJson, type ProductRow } from "./utils";

const KAI_JSON_URL = "https://kaideco.uy/products.json?limit=250";

export async function syncKaiDeco(): Promise<{ products: ProductRow[]; count: number }> {
  console.log("Kai Deco: iniciando sync...");

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    Accept: "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "es-ES,es;q=0.9",
    Referer: "https://kaideco.uy/",
    "X-Requested-With": "XMLHttpRequest",
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  let data: any;
  try {
    const resp = await fetch(KAI_JSON_URL, { headers, signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    data = await resp.json();
  } finally {
    clearTimeout(timeout);
  }

  const products: any[] = data?.products ?? [];
  console.log(`Kai Deco: ${products.length} productos encontrados`);

  const result: ProductRow[] = products.map((product: any) => {
    const baseName = normalizeText(product.title || "");
    const colorCandidates = [
      product.title,
      ...(product.variants?.map((v: any) => v.option1 || v.title || "") ?? []),
    ].join(" ");
    const colors = getUniqueColors(colorCandidates);
    const name = appendColorsToName(baseName, colors);
    const description = cleanDescription(product.body_html || "");
    const primaryVariant = product.variants?.[0] ?? {};
    const price = parsePrice(primaryVariant.price ?? "", 1.2);
    const enOferta = !!primaryVariant.compare_at_price;
    const images = [
      product.image?.src,
      ...(product.images?.map((i: any) => i.src || i).filter(Boolean) ?? []),
    ].filter(Boolean).map((s: string) => s.replace(/\s+/g, ""));
    const subcategorias = inferSubcategory(name, "Hogar");
    const productId = String(product.id);

    return {
      id: `kai-${productId}`,
      name,
      description,
      price,
      img: images,
      categories: {
        name: "Hogar",
        count: 0,
        subcategories: subcategorias ? [{ name: subcategorias, count: 0 }] : [],
      },
      payment_link: [
        {
          id: "0",
          url: product.handle
            ? `https://kaideco.uy/products/${product.handle}`
            : "",
        },
      ],
      relacionados: [],
      en_oferta: enOferta,
      source: "scraper",
      active: true,
      auto_update_price: false,
      external_id: productId,
    };
  });

  console.log(`Kai Deco: ${result.length} productos listos para upsert`);
  return { products: result, count: result.length };
}
