# Tasks: Stable Candidate Hardening

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 600–800 authored lines |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 catalog/fallback; PR 2 order/resilience; PR 3 UI |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No — resolved as PR 1 catalog/fallback slice
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Bidirectional catalog navigation, error classification, gated CSV fallback | PR 1 | `cd code && node --experimental-strip-types --test tests/catalog-queries.test.ts tests/catalog-api.test.ts tests/catalog-read-path.test.ts tests/legacy-telemetry.test.ts` | N/A: unit/API contracts; no deployment | Revert catalog/fallback modules and tests |
| 2 | Bounded order enrichment and resilience | PR 2 | `cd code && pnpm exec vitest run tests/provider-markup-policy.test.ts tests/order-product-enrichment.test.ts` | N/A: mocked composition | Revert endpoint, order/product pages, and provider |
| 3 | Focus, labels, and breakpoint regressions | PR 3 | `cd code && pnpm exec playwright test tests/stable-candidate-hardening.spec.ts` | Playwright at 390px and 1000px+ | Revert UI markup, styles, and spec |

Dependencies: Phase 1 → 2 → 3; work units are independently revertible.

### Completion Criteria

- Catalog navigation, error, and fallback pass without unbounded scans.
- Order/resilience pass with bounded IDs and retry-safe errors.
- UI passes at 390px/1000px+; optional polish requires evidence; scope stays bounded.

## Phase 1: Catalog Contracts and Bounded Fallback (@bibi-implementer)

- [x] 1.1 Add RED tests in `code/tests/catalog-queries.test.ts` and `code/tests/catalog-api.test.ts` for `after`/`before`, reload-safe URL/cursor/products, invalid cursors, 404 `NOT_FOUND`, and retryable upstream errors.
- [x] 1.2 Add RED tests in `code/tests/catalog-read-path.test.ts` and `code/tests/legacy-telemetry.test.ts` proving CSV fallback is default-off, opt-in, capped at 512 (row 513 aborts), with attempt/success/limit/error events.
- [x] 1.3 Implement direction-aware keyset queries/contracts in `code/src/server/catalog/{contracts,queries,facade,http}.ts`; preserve compatibility, return both cursors, and keep bounded projections.
- [x] 1.4 Classify product errors in `code/src/server/products.ts` and bounded operator-gated parser/telemetry in `code/src/server/catalog/{readPath,csvFallback,legacyTelemetry}.ts`.
- [x] 1.5 Update `code/src/components/NavPag.astro`, `code/src/pages/categories/[id]/page/[pag].astro`, `code/src/pages/categories/[id]/[subcat]/page/[pag].astro`, `code/src/pages/ofertas/page/[pag].astro`, and `code/src/pages/search/page/[pag].astro` so links replace the active cursor; acceptance: forward/back/reload sequences match products.

## Phase 2: Order and Resilience (@bibi-implementer)

- [ ] 2.1 Add RED tests in `code/tests/order-product-enrichment.test.ts` and `code/tests/provider-markup-policy.test.ts` for ID bounds, empty IDs, duplicate sequence, partial misses, success-only cache, and provider retry.
- [ ] 2.2 Create validated projection endpoint `code/src/pages/api/catalog/products/by-ids.ts` (400 malformed/over-limit input; unique IDs; missing IDs omitted) and wire `code/src/pages/pedido.astro` to remap matches in declared order without full-catalog reads.
- [ ] 2.3 Make `code/src/server/providers/markupSettings.ts` cache only successful responses; separate related failure handling in `code/src/pages/producto/[id].astro` and `code/src/server/product/pageState.ts` so related errors degrade; absence is 404; upstream is retryable non-404.

## Phase 3: Accessibility and Regression Proof (@bibi-designer, @bibi-qa)

- [ ] 3.1 Add visible two-pixel `:focus-visible`/`:focus-within` behavior in `code/src/components/{AddToCartButton,ItemProductoBox}.astro` and `code/src/styles/components/ItemProductBoxReact.css` matching `code/.opencode/autosave/resu.md` (read-only); add stable `for`/`id` labels in `code/src/pages/about.astro`.
- [ ] 3.2 Create `code/tests/stable-candidate-hardening.spec.ts` covering backward pagination, cart focus, hydrated About labels, and 390px versus 1000px+ layouts.
- [ ] 3.3 Run Node/Playwright suites and `astro check` after `.vite` unblocks; record optional polish only with equivalence evidence.
