# Martina Manual Price Preview — ODD Tasks

## Goal
Show supplier price/offer differences in the Martina admin preview even when `auto_update_price` is false, so an administrator can review and apply them deliberately. Keep automated provider sync behavior unchanged and continue protecting products with `temporary_price`.

## Scope and safeguards
- Manual `generate preview` + signed `apply` path only; do not change general/automated provider sync semantics.
- Explicit Apply remains the authorization to write the signed preview plan.
- A non-empty `temporary_price` remains a hard block for supplier-price/offer changes.
- Preserve the product's `auto_update_price` preference; manual Apply does not toggle it.
- No data changes or external provider requests during implementation/tests.
- Preserve unrelated worktree changes; no commit without explicit user request.

## Tasks
1. [x] Added a deterministic regression test and observed RED: manual preview initially reported zero price updates when `auto_update_price=false`.
2. [x] Threaded a default-false manual price-review option through planning; `generatePreview` and its signed apply revalidation opt in, while shared/general sync uses the protected default. Non-empty `temporary_price` remains blocked and the user setting is preserved.
3. [x] Focused Martina tests pass (83/83), `git diff --check` passes, and `astro check` reports no diagnostics in the changed reconciliation file; the existing preview UI already renders `update` plan items and price-change summaries. `astro check` still reports 206 repository-wide errors, including pre-existing `never`/test typing diagnostics outside this feature's changed lines.

## Evidence
- Screenshots show listing price `$430` with `$620` crossed out and product detail `ADRIANO BOXER` (`mdt-37666`) updating to `$590`; the admin preview showed 0 updates and 180 unchanged.
- Prior live debug established the root mechanism: `martinaChanges()` suppresses differences unless `auto_update_price === true`; the manual preview and general sync share planner code, so the manual route opts in explicitly rather than changing the shared default.
- Added regression: manual preview shows update and signed Apply persists it while preserving `auto_update_price=false`; general preview/apply remains gated; `temporary_price` remains protected. RED was observed before implementation; GREEN is 83/83.

## Verification and rollback
- Focused command: `node --experimental-strip-types --test tests/martina-sync.test.ts` — 83/83 passed.
- `git diff --check` — passed.
- `pnpm exec astro check` — repository-wide failure (206 diagnostics); reported errors were in unchanged existing code/test locations, not the manual-preview option changes.
- Runtime exercise: N/A after the behavior change; the deterministic provider fixtures cover preview, signed apply, general sync, and temporary-price protection. No live provider request or DB write was run for this behavior change.
- Rollback boundary: revert only `src/server/providers/martinaReconciliation.ts`, `src/server/providers/martinaSync.ts`, and the corresponding test in `tests/martina-sync.test.ts`; no migration or product-data change is part of this feature.

## Commit evidence
- Pending explicit user-authorized commit.
