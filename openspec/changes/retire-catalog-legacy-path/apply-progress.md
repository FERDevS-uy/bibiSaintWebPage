# Apply Progress: Retire the Catalog Legacy Runtime Path

## Completed Release A Work Units

- **Canonical runtime and telemetry:** canonical-only read-path, ignored CSV runtime configuration, structured retirement/degraded telemetry, full transactional detail reader, and safe uncached header/sidebar degradation.
- **Canonical Tecno contract:** Nuvex/Tecno products are intentionally inactive. `/categories/Tecno` is therefore verified as a stable HTTP 200 empty canonical state (`Sin Productos`), without product cards or pagination. Active offers and Ropa Hombre retain positive pagination coverage.
- **Delivery boundary:** feature-branch-chain remains future-only with `impladmin` as its target. The implementation is now partitioned into small commits on `catalog-dev`; no PR, push, or deploy was made. Future commits must remain small, detailed, and reviewable.

## Completed Tasks

- [x] 1.1 RED — Added canonical-read-path, ignored fallback configuration, bounded error, and structured telemetry coverage.
- [x] 1.2 RED — Replaced the stale CSV-backed Tecno E2E expectation with a canonical empty-state contract while retaining active offers and Ropa Hombre coverage.
- [x] 1.3 GREEN — Canonicalized request-time catalog/search/detail reads and retained bounded public payload behavior.
- [x] 1.4 GREEN — Added correlated structured runtime events, safe navigation degradation, and Playwright execution without CSV fallback enablement.
- [x] 1.5 REFACTOR — Reconciled stale fixture assumptions and completed focused unit, targeted Playwright, and build verification.

## Work Unit Evidence

| Evidence | Exact result |
| --- | --- |
| Earlier RED | `cd code && pnpm test:unit -- tests/catalog-read-path.test.ts tests/catalog-query-telemetry.test.ts tests/catalog-api.test.ts` failed before implementation because the path still returned `legacy`, the fallback remained enabled, and the runtime event export was absent. |
| Targeted Playwright | `cd code && pnpm exec playwright test tests/catalog-regressions.spec.ts` — passed: 3 tests. Tecno empty state, offers pagination, and Ropa Hombre positive coverage all passed. |
| Unit suite | `cd code && pnpm test:unit` — passed: 138 tests, 0 failures. |
| Build | `cd code && pnpm build` — passed. Warnings remain for static `loadCSV.ts` Node built-ins, provider HTTPS externalization, dynamic-import chunking, and prerendered request headers; none is deployment evidence. |
| Runtime/deployment evidence | No Worker deployment, binding inspection, production telemetry, or smoke matrix was run. The seven-day observation gate remains required before Release B. |
| Rollback boundary | Revert only Release-A runtime/test/config files; production rollback is redeployment of the recorded known-good Worker, never an `ENABLE_CSV_FALLBACK` toggle. |

## Changed Paths

- `code/tests/catalog-regressions.spec.ts`
- `code/src/server/catalog/readPath.ts`
- `code/src/server/catalog/queryTelemetry.ts`
- `code/src/server/sidebarCategories.ts`
- `code/src/server/product/pageState.ts`
- `code/src/pages/api/search-products.ts`
- `code/playwright.config.ts`
- `code/tests/catalog-read-path.test.ts`
- `code/tests/catalog-api.test.ts`
- `code/tests/catalog-query-telemetry.test.ts`
- `code/tests/catalog-queries.test.ts`
- `openspec/changes/retire-catalog-legacy-path/tasks.md`

## Remaining Tasks

- [ ] 2.1 Seven consecutive production days with zero legacy decisions/load attempts and complete acceptance evidence.
- [ ] 3.1–3.3 Release B deletion, scan, and proof tasks after the observation gate.
