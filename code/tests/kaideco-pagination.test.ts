import assert from "node:assert/strict";
import { test } from "node:test";

const { fetchKaiDecoCatalog } = await import("../src/server/providers/kaidecoPagination.ts");

test("fetchKaiDecoCatalog follows Shopify next-page cursors and stops at the final page", async () => {
  const requested: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    requested.push(url);
    const secondPage = url.includes("page_info=cursor-2");
    return new Response(JSON.stringify({
      products: secondPage ? [{ id: 2 }] : [{ id: 1 }],
    }), {
      status: 200,
      headers: secondPage
        ? {}
        : {
            Link: '<https://kaideco.uy/products.json?limit=250&page_info=cursor-2>; rel="next"',
          },
    });
  };

  const products = await fetchKaiDecoCatalog(fetchImpl);

  assert.deepEqual(products, [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(requested, [
    "https://kaideco.uy/products.json?limit=250",
    "https://kaideco.uy/products.json?limit=250&page_info=cursor-2",
  ]);
});
