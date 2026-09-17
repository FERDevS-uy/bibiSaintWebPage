---
name: bibi-database
description: Project-specific Supabase data rules for Bibi Saint. Load when changing schema, RLS, migrations, catalog integrity, product tables, or database-side behavior.
---

# Bibi Database

Use this skill for Bibi-specific database work. It complements `supabase-postgres-best-practices` with project invariants and paths.

## Load This Skill When

- You modify files under `code/supabase/migrations/`.
- You change RLS policies or role boundaries.
- You alter product catalog tables (`products`, `product_images`, `product_related`, `scraper_diffs`, `admin_profiles`).
- You touch server behavior that depends on `active=true` visibility rules.
- You need data-integrity checks for catalog relations.

## Project Paths

- `code/supabase/migrations/`
- `code/supabase/config.toml`
- `code/src/server/adminWhitelist.ts`
- `code/src/utils/loadProducts.ts`

## Bibi Data Invariants

- Public catalog visibility must stay constrained to active products (`active=true`).
- Writes must remain protected by authenticated role boundaries.
- Migration history is append-only: add incremental migrations, do not rewrite old ones.
- Product relations and image references must preserve catalog integrity.

## RLS and Access Rules

- Keep RLS enabled for writable business tables.
- Preserve the separation between client anon access and server-side elevated operations.
- Validate that policy changes do not widen public read scope beyond intended catalog data.

## Schema and Migration Rules

- Prefer additive, backward-compatible schema changes.
- Include indexes or constraints when required by new access/query paths.
- If adding triggers or computed paths, document purpose and rollback expectations in migration SQL comments.
- Validate migration order and dependency safety before rollout.

## Verification Checklist

- Confirm public reads still obey `active=true` behavior.
- Confirm authenticated write paths still succeed with current policies.
- Confirm catalog joins (product images and related products) remain consistent.
- Run project DB migration workflow after changes (`pnpm run db:migrate` when applicable to the task).

## Performance Diagnostics (Project-Specific)

- Investigate slow catalog/admin queries by checking real query shapes and access paths used by this project.
- When write contention appears, inspect possible lock hotspots around admin update flows before proposing schema changes.
- When table/index bloat is suspected, confirm with measurable evidence and scope remediation to affected objects only.
- Keep this section focused on Bibi query behavior; rely on `supabase-postgres-best-practices` for generic tuning guidance.

## Out of Scope

- Generic Postgres tuning rules already covered by `supabase-postgres-best-practices`.
