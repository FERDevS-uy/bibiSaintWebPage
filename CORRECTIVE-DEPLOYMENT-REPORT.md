# Corrective production deployment report — 2026-09-09

## Candidate

- Source: reconciled candidate preserving the current root UI and `about.astro`, plus Release A catalog changes.
- Production Worker: `bibisaintwebpage`.
- Production URL: `https://bibisaintwebpage.franccesco-giordano11.workers.dev`.

## Validation and deployment

- `pnpm install --frozen-lockfile`: passed (clean candidate install; no secrets copied).
- `pnpm build`: passed.
- `pnpm deploy`: passed after loading the original root `code/.env` only into the deployment subprocess.
- Deployed version at 100%: `8fc8ea46-ec66-4308-ae15-3e9aa4c4beaa`.
- Confirmed production binding: `CATALOG_KV=2aff9e8fa0dd402f93efce436f11124b`.

## Production smoke

- `/`, `/categories/Cama`, `/categories/Tecno`, `/ofertas`, `/api/search-products`: HTTP 200 (one sample each).
- `/about/`: HTTP 200 and contains the current-source markers `Bibi’s Tienda & Bienestar` and `Quiénes somos`.
- `/api/catalog/products?category=Tecno&pageSize=12`: HTTP 200 with canonical payload and catalog version header.

## Telemetry

- No telemetry event baseline was captured in this attempt. The tail command was invoked with unsupported CLI arguments/rate values, so it exited before observing events.
- One cache-busting probe returned a transient 502; immediate retries for the catalog API and category route returned HTTP 200. This report does not classify the transient response as a verified production regression.

## Rollback boundary

- Previous deployed version: `bb64827c-05c2-40c5-bd78-b337675f87c5`.
- It contains the older UI/About that prompted the correction, so it is an emergency technical rollback only, not a desired visual rollback.

## Scope

- No commit, push, PR, source change in the root checkout, Phase B work, or Cloudflare configuration mutation was performed.
