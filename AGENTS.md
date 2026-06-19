# Bibi Saint — AGENTS.md

## Project structure

- `code/` — Astro 5 app (SSR on Cloudflare Workers)
- `webScrappingTool/` — separate TS package for provider scraping
- Root is NOT the Astro project; always work inside `code/`

## Key architecture

- **SSR (not static)**: `output: "server"`, adapter `@astrojs/cloudflare`. Pages opt-in to prerender with `export const prerender = true`. Most dynamic pages (product, categories, search, offers, pagination) are SSR — no `getStaticPaths`.
- **Supabase + CSV dual-read**: `loadProducts()`/`loadProductById()`/`loadRelatedProducts()` in `src/utils/loadProducts.ts` try Supabase first (`PUBLIC_USE_SUPABASE === "true"`), fall back to CSV on failure. Admin panel requires Supabase.
- **Admin**: React SPA (AuthContext, LoginForm, ProductForm, ProductList) inside Astro pages at `src/pages/admin/`. Uses Supabase Auth with `supabaseClient.ts` (anon key, client-side). Server-side writes use `getSupabaseAdmin()` (service role key).
- **Live prices**: Server Islands in `src/server/livePrice.ts` — fetches from provider APIs (Martina di Trento, Kai, Alondra, Nuvex) with 6s timeout, applies markup, falls back silently.
- **Search**: Fuse.js client-side, URL-synced via debounced `searchurlchange` custom event.
- **Rate limiter**: in-memory Map in `src/middleware.ts` — 120 req/min per IP, exempts `/admin`, `/_astro`, `/assets`.
- **Cart**: client-side only (`addToCart.ts`, `removeToCart.ts`, `renderCart.ts`).

## Path aliases (tsconfig.json)

`@components/*`, `@layouts/*`, `@utils/*`, `@assets/*`, `@server/*` — all resolve from `code/src/`.

## Commands

```sh
pnpm dev          # astro dev on port 4321
pnpm build        # astro build → dist/
pnpm deploy       # build → dist-deploy/ → wrangler deploy (Cloudflare Workers)
pnpm cf:preview   # build → dist-deploy/ → wrangler dev (local Cloudflare preview)
pnpm run providers:sync  # run scraper from webScrappingTool/
pnpm run db:migrate      # CSV → Supabase migration script
pnpm run scrap           # legacy node scraper
```

## Env vars (code/.env)

All public. Never commit secrets. Template at `code/.env.template`.

| Var | Scope | Notes |
|-----|-------|-------|
| `PUBLIC_USE_SUPABASE` | build (inlined) | `"true"` to enable Supabase data source |
| `PUBLIC_SUPABASE_URL` | build (inlined) | Public, needed by Vite |
| `PUBLIC_SUPABASE_ANON_KEY` | build (inlined) | Public anon key |
| `SUPABASE_URL` | Cloudflare runtime | Server-only `getSupabase()` |
| `SUPABASE_ANON_KEY` | Cloudflare runtime | Server-only |
| `SUPABASE_SERVICE_ROLE_KEY` | Cloudflare runtime | Server-only, for admin writes |
| `CONTACT_TO_EMAIL`, `SMTP_*` | runtime | Email contact form via nodemailer |

`wrangler.jsonc` has NO `vars` section — all Cloudflare env vars set via `wrangler secret put`.

## Deploy

- **GitHub Actions** (`.github/workflows/cloudflare-deploy.yml`): on push to `impladmin` or `main`, builds and deploys to Workers.
- Build creates a copy at `dist-deploy/` with `.assetsignore` (prevents Pages from tripping on `_worker.js/`).
- Requires GitHub secrets: `CLOUDFLARE_API_TOKEN`, `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`.
- Old `deploy.yml` (GitHub Pages, CSV-based) is obsolete but preserved.

## Cloudflare Workers

- Worker name: `bibisaintwebpage`
- Site: `https://bibisaintwebpage.franccesco-giordano11.workers.dev`
- Env vars set via `wrangler secret put` or Cloudflare Dashboard → Worker → Settings → Variables and Secrets.
- `wrangler.jsonc` uses `assets.binding` for static assets from `dist/`.

## Supabase

- Project: `deilsclvheqcrqswiafa`
- Auth: admin user `bibisventasyserviciosonline@gmail.com`
- RLS: public can only SELECT `active=true` products; all writes require `auth.role()='authenticated'`
- Tables: `products`, `product_images`, `product_related`, `scraper_diffs`, `admin_profiles`
- Migration: `code/supabase/migrations/001_initial_schema.sql`

## Credentials policy

Repo is public. **Never commit credentials, secrets, tokens, or passwords.** Use GitHub Actions secrets, `wrangler secret put`, or Cloudflare Dashboard. The `.env` file is gitignored.
