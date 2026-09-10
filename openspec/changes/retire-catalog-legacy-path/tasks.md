# Tasks: Retire the Catalog Legacy Runtime Path

Strict TDD applies to every behavior: **RED → GREEN → REFACTOR**. Release B is blocked until Release A's seven-day gate passes.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 500–700 authored lines across runtime, tests, fixtures, and scans |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: Release A; PR 2: Release B after evidence gate |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No — maintainer selected feature-branch-chain targeting impladmin
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
Integration target: impladmin (main is stale and is not the target)
400-line budget risk: High

The exact decision before apply is **stacked-to-main**, **feature-branch-chain**, or **size-exception**; do not assume one.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Canonical-only runtime, telemetry, and fixtures | PR 1 | `cd code && pnpm test:unit && pnpm exec playwright test tests/catalog-regressions.spec.ts` | Release-A Worker smoke matrix | Redeploy recorded pre-Release-A Worker; revert runtime/test files only |
| 2 | Evidence-gated deletion and scans | PR 2 | `cd code && pnpm test:unit && pnpm build` | Release-B smoke matrix plus import/artifact scan | Redeploy recorded known-good Worker; no flag toggle rollback |

## Phase A: Canonical Runtime and Telemetry (Release A)

- [x] 1.1 @bibi-implementer **RED**: add failing tests in `code/tests/catalog-read-path.test.ts`, `code/tests/catalog-api.test.ts`, and `code/tests/catalog-query-telemetry.test.ts` for canonical-only reads, bounded temporary errors, ignored `ENABLE_CSV_FALLBACK`, structured event correlation, and zero CSV calls.
- [x] 1.2 @bibi-implementer **RED**: add failing detail/navigation tests in `code/tests/integration/catalog-integration.test.ts` and `code/tests/catalog-regressions.spec.ts` for full `Product` fields, stable degraded header/sidebar, unchanged routes/payloads, and canonical fixtures.
- [x] 1.3 @bibi-implementer **GREEN**: update `code/src/server/catalog/facade.ts`, `code/src/server/catalog/queries.ts`, `code/src/pages/api/catalog/products.ts`, `code/src/pages/api/catalog/categories.ts`, `code/src/pages/api/catalog/related.ts`, `code/src/pages/api/search-products.ts`, `code/src/pages/productos.json.ts`, `code/src/server/products.ts`, and `code/src/server/product/pageState.ts` to use canonical bounded reads and full detail mapping (depends on 1.1–1.2).
- [x] 1.4 @bibi-implementer **GREEN**: update `code/src/server/sidebarCategories.ts`, `code/src/server/catalog/queryTelemetry.ts`, and `code/src/server/catalog/legacyTelemetry.ts` for correlated degraded/retired-config events; migrate `code/playwright.config.ts` and `code/tests/producto-purchase-flow.spec.ts`, `code/tests/producto-swatch-mobile.spec.ts`, and `code/tests/producto-talle-color-stock.spec.ts` off CSV fallback (depends on 1.3).
- [x] 1.5 @bibi-implementer **REFACTOR**: remove duplicate fallback execution while retaining Release-A probes (depends on 1.3–1.4); run unit, targeted Playwright, build, and Release-A smoke checks. Record deployment ID, bindings, telemetry coverage, and rollback evidence.

## Observation Gate: Seven Consecutive Production Days

- [ ] 2.1 Verify seven consecutive days with zero `catalog_legacy_decision`, zero `catalog_csv_load_attempt`, no telemetry gaps, passing suites, and passing listing/search/detail/header/sidebar/degraded-read acceptance matrix (depends on 1.5); otherwise block Release B and redeploy the recorded known-good Worker.

## Phase B: Irreversible Deletion and Proof (Release B)

- [ ] 3.1 @bibi-implementer **RED**: extend `code/tests/catalog-runtime-scan.test.ts` to fail on request-reachable `loadCSV`, `loadCSVRaw`, `cargarProductos`, legacy selectors, fallback flags, or Worker-bundle CSV imports (depends on 2.1).
- [ ] 3.2 @bibi-implementer **GREEN**: delete `code/src/server/catalog/readPath.ts`, fallback branches/flags/imports in catalog consumers and `code/src/utils/loadProducts.ts`, and fallback-only tests/fixtures; retain canonical/degraded telemetry (depends on 3.1).
- [ ] 3.3 @bibi-implementer **REFACTOR**: run scan, full unit/E2E, build artifact inspection, and Release-B smoke matrix; prove unchanged public routes/payloads and unchanged `webScrappingTool/`, migration, sync, Pages CSV, schema, KV, and `code/src/data/*.csv` boundaries (read-only; depends on 3.2).
