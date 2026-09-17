# Apply Progress: Stable Candidate Hardening

**Mode:** Standard (strict_tdd: false)
**Delivery:** `ask-on-risk` resolved as feature-branch-chain PR 1. This slice targets the feature/tracker branch; PR 2 and PR 3 remain pending.

## Completed Tasks

- [x] 1.1 Added catalog contract tests for cursor direction, invalid-cursor status, missing-product status, and retryable upstream errors.
- [x] 1.2 Added default-off/exact-opt-in CSV tests, a 512-row Worker-safe parser limit, and fallback lifecycle telemetry tests.
- [x] 1.3 Added optional cursor direction, reverse keyset predicates/order, response previous cursors, and endpoint serialization while retaining directionless forward cursors.
- [x] 1.4 Added `NOT_FOUND` HTTP classification, typed product lookup result separation, an operator-gated bounded CSV primitive, and structured fallback event reasons.
- [x] 1.5 Wired returned previous cursors into paginated category/offer routes and prevented `NavPag` from reattaching the active cursor to destination URLs.

## Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused validation command | `cd code && node --experimental-strip-types --test tests/catalog-queries.test.ts tests/catalog-api.test.ts tests/catalog-read-path.test.ts tests/legacy-telemetry.test.ts` — passed: 66/66. |
| Primary test command | `cd code && pnpm test:unit` — passed: 144/144. |
| Runtime harness | N/A: this work unit is pure unit/API-contract coverage; no deployment or live-provider boundary was exercised. |
| Rollback boundary | Revert Phase 1 catalog contracts/query/parser/telemetry, API response, paged-route cursor wiring, and the four focused test files. |

## Remaining Tasks

- [ ] 2.1–2.3 Order enrichment and resilience (PR 2).
- [ ] 3.1–3.3 Accessibility and regression proof (PR 3).

## Notes

- Corrected candidate validation (`sha256:51b105fbdf6695c630d299b46324ba2a1469938dc8c35708631793c27b095d62`) removed the incompatible temporary Vitest dependency, updated the tasks-focused command to the repository-native Node runner, and passed focused 66/66 plus full unit 144/144. Tasks 1.1–1.5 remain verified complete.
- `pnpm exec prettier --check` reports formatting drift across pre-existing modified files. No bulk formatting was applied to avoid overwriting unrelated worktree changes.
- `pnpm exec tsc --noEmit --pretty false` is blocked before project checking by TypeScript 6's `baseUrl` deprecation diagnostic in `tsconfig.json`.
