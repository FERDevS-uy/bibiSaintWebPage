# Proposal: Retire the Catalog Legacy Runtime Path

## Intent

Remove the legacy CSV/read-path fallback from the Astro Cloudflare Worker runtime. Configuration is insufficient evidence because header categories bypass the flag; measured zero-use proof is required.

## Goals

- Make Supabase/read-model reads the only Worker catalog path.
- Preserve public behavior for listings, search, product detail, sidebar, and header.
- Replace CSV-dependent tests before deleting legacy branches.

## Scope

### In Scope
- Remove runtime selectors, fallback branches, environment plumbing, and request-reachable CSV loading.
- Use a full transactional product read for detail pages, not the reduced card projection.
- Move sidebar/header reads and unit/E2E fixtures to canonical sources.
- Retain structured legacy-use telemetry through rollout.

### Out of Scope / Not Included
- CSV used by scrapers, migration, catalog-sync, or GitHub Pages.
- Schema, visual, or public route/payload changes.
- Any modification to `openspec/changes/archive/2026-09-08-scalable-catalog-read-pipeline/` or `openspec/changes/retire-legacy-catalog-fallback/`.

## Capabilities

### New Capabilities
- `catalog-runtime-consumers`: Defines canonical product-detail, sidebar, header, and fixture behavior.

### Modified Capabilities
- `catalog-read-api`: Replaces explicit CSV fallback with bounded canonical reads or observable temporary errors.

## Approach

First remove bypasses and migrate consumers while telemetry remains. Delete selectors, branches, imports, flags, and fixtures only after zero-use gates pass. Route to `@bibi-implementer`; no frontend or database specialist is needed. `code/.opencode/autosave/resu.md` is migration history, not target architecture.

**Implementation must not start until specs define behavior for product detail, sidebar, header, and test fixtures.**

## Affected Surfaces

| Area | Impact |
|---|---|
| Catalog facade, APIs, search | Remove legacy selection/branches |
| `loadProducts.ts`, `sidebarCategories.ts` | Remove request-time CSV reachability |
| Product-detail loaders | Preserve full transactional fields |
| Tests, Playwright, environment | Replace CSV fixtures/flags |

## Rollout and Observability Gates

- Before irreversible deletion, production telemetry for an agreed window reports zero legacy selector decisions and zero runtime CSV load attempts.
- Smoke checks cover listings, search, product detail, sidebar, header, and observable failures.
- Unit/E2E suites pass without CSV fallback; dependency scanning finds no runtime CSV-loader imports.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Hidden bypass | High | Instrument selectors/load sites |
| Missing detail fields | Medium | Specify/test the full contract |
| Misleading fixtures | High | Remove Playwright fallback enablement |

## Rollback Plan

Restore a known-good prior Worker deployment, then validate bindings and smoke checks. Toggling the retired flag is not rollback.

## Success Criteria

- [ ] All rollout gates prove zero Worker-runtime legacy use before deletion.
- [ ] Canonical behavior is specified and verified for every named consumer.
- [ ] Operational CSV infrastructure outside the Worker remains unchanged.
