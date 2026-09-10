# Release A Candidate Reconciliation — 2026-09-09

## Candidate Boundary

- Candidate: `/private/tmp/bibisaint-release-a-candidate-20260909`
- UI/source authority: current dirty root checkout on `catalog-dev` (`3805d5d`), copied without modifying that checkout.
- Release A behavior authority: V2 worktree `retire-catalog-legacy-path-v2` (`e0abf84`), reconciled file-by-file rather than copied wholesale.
- Excluded: Git metadata, `.env*`, dependency directories, generated build/Cloudflare artifacts, caches, archives, and test reports. The temporary `node_modules` link was used only for local unit execution and is not source material.

## Preserved Root Surfaces

- `code/src/pages/about.astro` is byte-identical to the current root UI source.
- `code/src/pages/producto/[id].astro` and `code/src/server/product/pageState.ts` remain the current component/page-state implementation; its full product read and canonical related-products path already meet Release A behavior.
- `code/wrangler.jsonc` remains the current root production configuration, including the real production `CATALOG_KV` binding and root flags.

## Reconciled Release A Changes

The candidate incorporates canonical-only read behavior into the V2 Release A surfaces:

- `catalog/facade.ts`: removes legacy CSV/runtime fallback execution for list, category, search, featured, and related reads; a configured CSV fallback is ignored and emits retired-config telemetry.
- `catalog/queries.ts`: removes the functional `CATALOG_READ_MODEL` execution gate while retaining the root keyset bootstrap protection and no-total optimization.
- Catalog/search APIs, product JSON, category UI components, and tests: use bounded canonical reads and retain the current root response/SSR assertions where compatible.
- Sidebar/header: preserves the root's canonical RPC-only, non-cached degraded behavior and route-correlated runtime telemetry; it does not restore any CSV fallback.

The remaining `search/index.astro` `CATALOG_READ_MODEL` conditional is the proven V2 Release A shape. Both outcomes are canonical-only (`runCatalogQuery` or the now-canonical facade search); it does not reach CSV. Release B is responsible for deleting residual selector plumbing and CSV modules after the observation gate.

## Verification

Passed:

```sh
cd code && node --experimental-strip-types --test \
  tests/catalog-queries.test.ts \
  tests/catalog-query-telemetry.test.ts \
  tests/catalog-read-path.test.ts \
  tests/catalog-api.test.ts
```

Result: 56 passed, 0 failed.

Build attempt:

```sh
cd code && /Users/franccesco.giordano/Documents/proyectos\ personales/bibiSaintWebPage/code/node_modules/.bin/astro build
```

Blocked by the isolated candidate's test-only linked dependency harness, not a TypeScript/application failure: Astro/Vite resolves the linked package path back to the root path and fails to locate cached compile metadata for `ClientRouter.astro`. `pnpm exec` also refuses to operate on the linked modules directory without attempting an install/purge. No dependencies were copied into the candidate and no root files were changed. A clean independent install is required for final build proof.

## No-Deploy Status

No commit, push, PR, Cloudflare mutation, or deployment was performed. Release B and its seven-day observation gate remain untouched.
