const KAI_JSON_URL = "https://kaideco.uy/products.json?limit=250";

const KAI_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "es-ES,es;q=0.9",
  Referer: "https://kaideco.uy/",
  "X-Requested-With": "XMLHttpRequest",
};

function nextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;

  for (const link of linkHeader.split(",")) {
    const match = link.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (match?.[1]) return match[1];
  }

  return null;
}

/** Fetches every cursor-paginated Shopify catalog page exposed by Kai Deco. */
export async function fetchKaiDecoCatalog(
  fetchImpl: typeof fetch = fetch,
): Promise<any[]> {
  const products: any[] = [];
  const visited = new Set<string>();
  let pageUrl: string | null = KAI_JSON_URL;

  while (pageUrl && !visited.has(pageUrl)) {
    visited.add(pageUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const response = await fetchImpl(pageUrl, {
        headers: KAI_HEADERS,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (Array.isArray(data?.products)) products.push(...data.products);
      pageUrl = nextPageUrl(response.headers.get("link"));
    } finally {
      clearTimeout(timeout);
    }
  }

  return products;
}
