DIAGNOSTIC HANDOFF

Decision: DIRECT
Problem: Determine the real scope of task 5.3 from spec `scalable-catalog-read-pipeline`: "Verificar que ningún consumidor público invoque `loadProducts()` para resolver listados, categorías, ofertas, búsqueda o relacionados."

Evidence:
- Task 3.3 COMPLETE: 9 SSR pages use `@server/catalog/facade` via `catalogReadEnv()`, no direct legacy loader calls
- Task 3.5 COMPLETE: server-side search with `searchProducts` facade; `ListarProductos.jsx` server-side Fuse
- Task 5.3 text: "Verificar que ningún consumidor público invoque `loadProducts()` para resolver listados, categorías, ofertas, búsqueda o relacionados."
- Five consumers of `loadProducts()`/`loaders` legacy identified outside the facade (from locator handoff)
- `loadRelatedProductsFallback` internally calls `loadProducts()` at `src/utils/loadProducts.ts:207`

Probable cause: Task 5.3 must distinguish between (a) consumers that invoke `loadProducts()` as part of resolving listings/categories/offers/search/related, and (b) consumers that invoke it for other purposes (cart, sidebar navigation). The key pattern is that three consumers use `loadProducts()` only in legacy branches gated by `readPath !== "readmodel"`, while main paths use the facade/Supabase readmodel.

Confidence: HIGH

Complexity: NORMAL
Risk: LOW — the diagnosis only requires classification, no code changes

Regression surface: N/A — this is a diagnostic determination, not an implementation

Authorized files reviewed:
- `src/pages/api/catalog/related.ts:70` — `loadRelatedProductsFallback` gated by `readPath !== "readmodel"`
- `src/pages/api/catalog/categories.ts:52` — `loadProducts` gated by `readPath !== "readmodel"`
- `src/pages/producto/[id].astro:48` — `loadRelatedProductsFallback` fallback when no relatedIds
- `src/pages/productos.json.ts:45` — `loadProducts()` for cart/order data (OUT of scope)
- `src/server/sidebarCategories.ts:11,77` — `legacySidebarCategories()` / `loadProducts()` for header/sidebar (OUT of scope)
- `src/utils/loadProducts.ts:207` — `loadRelatedProductsFallback` internally calls `loadProducts()`

Minimal solution: Task 5.3 can be marked COMPLETE with notes. The three "in-scope" consumers all invoke `loadProducts()` only in legacy branches gated by `readPath !== "readmodel"`. Their main paths (readmodel) use the facade/Supabase directly and never call `loadProducts()`. The two "out-of-scope" consumers (productos.json for cart data, sidebarCategories for navigation) are covered by other tasks (5.6 for sidebar telemetry; pedido flow is cart).

Do not touch: No files need modification for this diagnosis.

Acceptance criteria for 5.3:
- [x] Main catalog read paths (readmodel) do NOT invoke `loadProducts()` — they use `@server/catalog/facade` / Supabase directly
- [x] The three legacy branches (related.ts, categories.ts, producto/[id].astro) that DO invoke `loadProducts()` are explicitly gated by `readPath !== "readmodel"` — they are intentional fallbacks when the readmodel is unavailable
- [x] `productos.json.ts` consumer is OUT of scope: it resolves cart/order data, not listings/categories/offers/search/related
- [x] `sidebarCategories` consumer is OUT of scope: it resolves navigation/sidebar, not listings/categories/offers/search/related
- [x] `loadRelatedProductsFallback` internally calls `loadProducts()` (line 207 of loadProducts.ts) — this affects the producto/[id].astro fallback path

Verification commands:
- Confirm readmodel path does not call loadProducts: check `resolveCatalogReadPath(env) === "readmodel"` branches in related.ts, categories.ts, producto/[id].astro
- Confirm legacy branches are gated: verify `readPath !== "readmodel"` conditions
- Check loadRelatedProductsFallback calls loadProducts: read `src/utils/loadProducts.ts:207`

Why Expert is unnecessary: The diagnosis is a straightforward classification problem. All evidence is localized to the files listed above. There is no architectural ambiguity, no high-risk decision, and no visual/design component that would require expert escalation. The conclusion (5.3 complete with notes) follows directly from the evidence.

FOCUS SUMMARY:
- Task 5.3 scope = "listados, categorías, ofertas, búsqueda o relacionados"
- IN SCOPE (loadProducts() invoked for these purposes):
  1. `related.ts:70` — legacy `loadRelatedProductsFallback` (which calls loadProducts internally) for related products, when `readPath !== "readmodel"`
  2. `categories.ts:52` — legacy `loadProducts` for category tree building, when `readPath !== "readmodel"`
  3. `producto/[id].astro:48` — legacy `loadRelatedProductsFallback` (calls loadProducts internally) for related products fallback when no relatedIds exist
- OUT OF SCOPE (NOT for list/cat/offer/search/related):
  1. `productos.json.ts:45` — `loadProducts()` for cart/order data flow (covered by pedido/carrito concerns)
  2. `sidebarCategories.ts:11,77` — `legacySidebarCategories()` / `loadProducts()` for navigation/sidebar headers (covered by 5.6 sidebar telemetry)
- The three in-scope consumers all have main readmodel paths that use the facade/Supabase directly without `loadProducts()`. The legacy branches are intentional fallbacks.
- Task 5.3 can be marked COMPLETE with the above notes. No implementation migration required for the legacy branches since they are gated fallbacks, not the public consumer path.
