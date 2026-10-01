# Supabase authorization remediation (ODD)

## Objective
Close the confirmed database authorization gaps on catalog source tables and the catalog rebuild RPC without changing public catalog reads, server-side `service_role` write flows, or admin storage behavior.

## Problem / Why
The confirmed audit found the SQL authorization boundary permits unintended source-table writes and exposes a privileged rebuild RPC beyond its intended server caller.

## Scope and constraints
- Add an incremental migration for `products`, `product_images`, `product_related`, and `scraper_diffs`; preserve public SELECT access only for the three catalog tables, and prohibit direct writes by anon/authenticated (including admins).
- Revoke source-table mutation privileges through both direct and PUBLIC ACL paths; explicitly grant `service_role` SELECT/INSERT/UPDATE/DELETE on all four tables.
- Remove contradictory FOR ALL admin policies; retain any necessary admin read policies only if source read-path inspection demonstrates a need.
- Restrict `public.catalog_rebuild()` execution to `service_role` only.
- Make `code/scripts/migrateToSupabase.mjs` fail closed unless `SUPABASE_SERVICE_ROLE_KEY` is configured; never use anon-key fallback.
- Local source/migration/test work only. No production access, credentials, MCP writes, Docker, database reset, commit, or push.
- Strict TDD; focused runner: `node --experimental-strip-types --test tests/supabase-source-write-authorization.test.ts` from `code/`, then `pnpm test:unit`.

## Tasks
- [x] SA-1 Revise focused regression tests to enforce server-only source writes, exact read grants, policy removal, and fail-closed migration-script credentials (RED observed before implementation).
- [x] SA-2 Update the existing forward-only migration and migration script; focused suite GREEN; full unit suite has one unrelated storefront-layout failure.

## Authorized scope
This file, `code/supabase/migrations/20260929170347_secure_catalog_source_writes.sql`, `code/tests/supabase-source-write-authorization.test.ts`, and `code/scripts/migrateToSupabase.mjs` only.

## Acceptance criteria
- All four source tables retain RLS; anon/authenticated have no direct INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER privileges, regardless of admin membership, and PUBLIC cannot preserve those privileges.
- Public SELECT grants/policies remain for `products`, `product_images`, and `product_related`; `scraper_diffs` SELECT is revoked from PUBLIC/anon/authenticated.
- `service_role` has explicit SELECT/INSERT/UPDATE/DELETE privileges on all four tables.
- There are no contradictory FOR ALL admin write policies; read-only admin policies are added only if required by inspected read paths.
- `catalog_rebuild()` has no PUBLIC/anon/authenticated EXECUTE and is executable by `service_role`.
- Migration script exits without `SUPABASE_SERVICE_ROLE_KEY`, with no anon-key fallback.
- No unrelated SECURITY DEFINER or trigger function changes.

## Applicable checks
- `node --experimental-strip-types --test tests/supabase-source-write-authorization.test.ts` (from `code/`)
- `pnpm test:unit` (from `code/`)
- `git diff --check`
- Static readback of migration against current function signature, table policies/grants, and migration conventions.

## Progress
- Exploration confirmed base migration 001 defines four admin-all RLS policies and public read policies; migrations do not establish explicit table grants. The current catalog rebuild signature is no-argument, with prior `REVOKE ALL ... FROM public` in 2026 migration. Additional role-specific revokes/grant remain necessary.
- Existing task `odd/tasks/security-remediation.md` concerns separate completed/deferred findings and is preserved unchanged.
- Historical initial-candidate run: `pnpm test:unit` completed with 268 passing and two unrelated existing storefront-layout failures (`desktop navigation distributes category and main links across its row`; `desktop footer moves only the brand block while keeping the other columns at their original positions`). That candidate's original migration/policy semantics were replaced by the local revision below.
- Database integration execution was intentionally skipped because its package script runs `supabase db reset --local`, which is explicitly prohibited; runtime role-behavior testing remains pending in a non-reset local test environment.
- Prior candidate had staged migration/test/task files and broader unrelated worktree changes. Preserve all unrelated files and do not touch the index.
- Read-path inspection (`code/src/pages/api/admin/products.ts`, `code/src/server/products.ts`, and `rg scraper_diffs`) found admin product reads/writes use `getSupabaseAdmin`, public product reads use `getSupabase`, and there are no `scraper_diffs` source read callsites. No admin-only read policies are needed; public catalog policies remain, and migration drops only legacy admin `FOR ALL` policies.
- No Engram session identity is available to this worker; mirror is pending and no memory mutation is authorized here.
- Revised focused checks produced RED before source implementation: 5/6 failing against the prior candidate. After migration/script changes, focused runner passed 6/6.
- `pnpm test:unit` now reports 272 pass / 1 fail (273 total); the only observed failure is the pre-existing unrelated `desktop footer moves only the brand block while keeping the other columns at their original positions` storefront-layout assertion. This differs from an earlier run's two unrelated storefront-layout failures; do not attribute either to this change.
- No database migration execution was run; the local integration/reset path remains prohibited. No production, credentials, Docker, local database reset, MCP write, Git index, commit, or push actions were performed.

## Next step
Parent review/verification remains. Report functionality impact: direct authenticated admin source-table writes are intentionally denied and must use server-side `service_role`; public catalog SELECT is preserved, scraper_diffs client visibility is removed. Do not deploy, reset a database, or commit/push.
