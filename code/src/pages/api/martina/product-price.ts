// GET /api/martina/product-price?productId=...
// Verificación oficial del precio de un producto Martina (público).
//  - Solo usa `productId`; ignora cualquier `code`/`countryId` del visitante.
//  - Resuelve la campaña vigente desde ecommerce/config en el servidor.
//  - No toca Supabase: únicamente consulta a Martina.
import { fetchMartinaConfig, fetchMartinaProductById, extractMartinaColorDetails } from "@server/providers/martina";
import { parseCampaign } from "@server/providers/martinaCampaign";
import { normalizeProductPrice } from "@server/providers/martinaNormalizer";
import { normalizeSizes } from "@utils/sizes";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const rawId = (url.searchParams.get("productId") || "").trim();
  const numeric = rawId.replace(/^mdt-/i, "").trim();

  if (!rawId || !/^\d+$/.test(numeric)) {
    return json({ error: "productId inválido" }, 400);
  }

  try {
    const configRaw = await fetchMartinaConfig("598");
    const campaign = parseCampaign(configRaw);

    const entries = await fetchMartinaProductById(numeric, campaign.code, "598");

    if (entries.length === 0) {
      return json({
        price: "",
        originalPrice: null,
        isDiscount: false,
        inStock: false,
        colors: [],
        sizes: [],
        campaignCode: campaign.code,
      });
    }

    const first = entries[0];
    const { price, originalPrice, enOferta } = normalizeProductPrice(
      first?.price ?? "",
      first?.price1 ?? "",
    );

    const colors = extractMartinaColorDetails(entries);
    const allSizes = normalizeSizes(colors.flatMap((c) => c.rawSizes));
    const inStock = colors.some((c) => c.sizes.length > 0);

    return json({
      price,
      originalPrice,
      isDiscount: enOferta,
      inStock,
      colors,
      sizes: allSizes,
      campaignCode: campaign.code,
    });
  } catch (e: any) {
    console.error("martina product-price error:", e?.message || e);
    return json({ error: e?.message || "Error al consultar Martina" }, 502);
  }
}