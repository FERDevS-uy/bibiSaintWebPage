const MARTINA_STORE_BASE = "https://pol21.martinaditrento.com/mdt-services/resources/store/product";
const MARTINA_IMAGE_BASE = "https://pol21.martinaditrento.com/images/products/md/";

function extractProductId(input: string): string | null {
  const cleaned = input.trim();
  if (/^\d+$/.test(cleaned)) return cleaned;
  const m = cleaned.match(/[?&]productId[=](\d+)/i);
  if (m) return m[1];
  const m2 = cleaned.match(/-p(\d+)(?:\?|$|\/)/);
  if (m2) return m2[1];
  const m3 = cleaned.match(/(\d{4,})/);
  if (m3) return m3[1];
  return null;
}

function extractColorNodes(variation: any): Array<{ id: number; hex: string; name: string; sizes: string[] }> {
  if (!variation) return [];
  if (variation.id === "color" && Array.isArray(variation.variationValues)) {
    return variation.variationValues.map((c: any) => {
      const sizes: string[] = Array.isArray(c?.variation?.variationValues)
        ? c.variation.variationValues.map((sz: any) => String(sz?.description ?? "").trim()).filter(Boolean)
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
    return variation.variationValues.flatMap((item: any) => extractColorNodes(item.variation));
  }
  return [];
}

function groupImagesByColor(images: string[], code: string): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  images.forEach((filename) => {
    const m = filename.match(new RegExp(`^${code}_(\\d+)_`));
    if (!m) return;
    const colorId = m[1];
    if (!grouped[colorId]) grouped[colorId] = [];
    grouped[colorId].push(`${MARTINA_IMAGE_BASE}${filename}`);
  });
  return grouped;
}

function parsePrice(value: any): string {
  if (!value) return "";
  const str = String(value).replace(/[^\d.,]/g, "").replace(",", ".");
  const num = parseFloat(str);
  return Number.isFinite(num) && num > 0 ? Math.round(num).toLocaleString("es-UY") : "";
}

export async function GET({ request }: { request: Request }) {
  try {
    const url = new URL(request.url);
    const input = url.searchParams.get("url") || "";
    const productId = extractProductId(input);

    if (!productId) {
      return new Response(JSON.stringify({ error: "No se pudo extraer un ID de producto de esa URL" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const code = process.env.PUBLIC_MARTINA_CODE || "202605";
    const countryId = process.env.PUBLIC_MARTINA_COUNTRY_ID || "598";
    const apiUrl = `${MARTINA_STORE_BASE}?productId=${encodeURIComponent(productId)}&code=${encodeURIComponent(code)}&countryId=${encodeURIComponent(countryId)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const resp = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/plain, */*",
        Referer: "https://tienda.martinaditrento.com/",
        "User-Agent": "Mozilla/5.0 (compatible; BibiImport/1.0)",
      },
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: "Error al consultar Martina: HTTP " + resp.status }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }

    const raw = await resp.json();
    const entries: any[] = Array.isArray(raw?.data) ? raw.data : [];
    if (entries.length === 0) {
      return new Response(JSON.stringify({ error: "No se encontraron datos para ese producto" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    const first = entries[0];
    const entryCode = String(first?.code || code);

    const name = String(first?.name || "").trim();
    const description = [first?.description, first?.description2, first?.description3]
      .filter(Boolean)
      .join(" ")
      .replace(/<[^>]*>/g, "")
      .replace(/&[^;]+;/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const price = parsePrice(first?.price);

    const colorNodes = extractColorNodes(first?.variation);
    const imagesByColor = groupImagesByColor(Array.isArray(first?.images) ? first.images : [], entryCode);

    const colors = colorNodes.map((c) => ({
      id: c.id,
      hex: c.hex,
      name: c.name,
      images: imagesByColor[String(c.id)] || [],
      sizes: c.sizes,
    }));

    const allImages: string[] = [];
    const seen = new Set<string>();
    colors.forEach((c) => {
      c.images.forEach((img) => {
        if (!seen.has(img)) {
          allImages.push(img);
          seen.add(img);
        }
      });
    });

    if (allImages.length === 0 && first?.mainImage) {
      allImages.push(`${MARTINA_IMAGE_BASE}${first.mainImage}`);
    }

    const category = String(first?.productLine?.parent?.name || first?.productLine?.name || "").trim();
    const subcategory = String(first?.productLine?.name || "").trim();

    return new Response(
      JSON.stringify({
        name,
        description,
        price,
        images: allImages,
        colors,
        category: category || undefined,
        subcategory: subcategory !== category ? subcategory : undefined,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (err: any) {
    console.error("importar-martina error:", err?.message || err);
    return new Response(
      JSON.stringify({ error: "Error interno: " + (err?.message || "desconocido") }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}
