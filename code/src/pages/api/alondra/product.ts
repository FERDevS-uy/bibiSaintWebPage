const ALONDRA_API_BASE = "https://alondra-ecommerce-be.sitios.uy/api";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

// Alondra only authorizes browser requests originating from alondra.com.uy.
// Keep that upstream request on the server: browsers cannot set Origin and
// Referer themselves, and the client calls this same-origin endpoint instead.
export async function GET({ request }: { request: Request }): Promise<Response> {
  const productId = new URL(request.url).searchParams.get("productId")?.trim() ?? "";
  const alondraId = productId.replace(/^alo-/i, "");

  if (!/^[a-f\d]{24}$/i.test(alondraId)) {
    return json({ error: "productId inválido" }, 400);
  }

  try {
    const response = await fetch(`${ALONDRA_API_BASE}/products/${encodeURIComponent(alondraId)}`, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "es-UY,es;q=0.9,en;q=0.8",
        Origin: "https://alondra.com.uy",
        Referer: "https://alondra.com.uy/",
        "User-Agent": "Mozilla/5.0 (compatible; BibiSaintLiveStock/1.0)",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return json({ error: "Alondra no respondió el producto" }, 502);
    }

    return json(await response.json());
  } catch (error) {
    console.error("alondra product live-stock error:", error);
    return json({ error: "No se pudo consultar Alondra" }, 502);
  }
}
