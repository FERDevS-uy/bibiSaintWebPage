import { normalizeText, cleanDescription, parsePrice, getUniqueColors, appendColorsToName, inferSubcategory, type ProductRow } from "./utils";
import { getProviderMarkup } from "./markupSettings";
import { fetchKaiDecoCatalog } from "./kaidecoPagination";

export async function syncKaiDeco(): Promise<{ products: ProductRow[]; count: number }> {
  console.log("Kai Deco: iniciando sync...");
  const products = await fetchKaiDecoCatalog();
  console.log(`Kai Deco: ${products.length} productos encontrados`);

  // Markup configurable (default 1.2); nunca tumba el sync si la DB falla.
  const kaidecoMarkup = await getProviderMarkup("kaideco");

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
    const price = parsePrice(primaryVariant.price ?? "", kaidecoMarkup);
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
