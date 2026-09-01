# Bibi Saint — AGENTS.md

## Project structure

- `code/` — Astro 5 app (SSR on Cloudflare Workers)
- `webScrappingTool/` — separate TS package for provider scraping
- Root is NOT the Astro project; always work inside `code/`

## Key architecture

- **SSR (not static)**: `output: "server"`, adapter `@astrojs/cloudflare`. Pages opt-in to prerender with `export const prerender = true`. Most dynamic pages (product, categories, search, offers, pagination) are SSR — no `getStaticPaths`.
- **Supabase + CSV dual-read**: `loadProducts()`/`loadProductById()`/`loadRelatedProducts()` in `src/utils/loadProducts.ts` try Supabase first (`PUBLIC_USE_SUPABASE === "true"`), fall back to CSV on failure. Admin panel requires Supabase.
- **Admin**: React SPA (AuthContext, LoginForm, ProductForm, ProductList, ProvidersPanel, ColorVariants, FilterBar, Modal, etc.) inside Astro pages at `src/pages/admin/`. Uses Supabase Auth with `supabaseClient.ts` (anon key, client-side). Server-side writes use `getSupabaseAdmin()` (service role key). Login protegido con Cloudflare Turnstile CAPTCHA (`LoginForm.tsx`).
- **Admin security hardening**: mass-assignment protection via `pickWritable()` (`src/server/adminWhitelist.ts`) — solo columnas permitidas llegan a Supabase en writes de productos. `hasTrustedOrigin()` (`src/server/security/origin.ts`) valida Origin/Referer en API admin. RLS + storage hardening en `002_security_hardening.sql`.
- **Nuvex sync (panel admin)**: flujo independiente del CSV. `src/server/providers/nuvexSync.ts` hace login server-side contra Nuvex (credenciales `NUVEX_USER_EMAIL`/`NUVEX_USER_PASS`, nunca al frontend), genera un preview firmado (HMAC + TTL + `jti` one-shot + actor + decision set) y aplica con revalidación. Endpoints `POST /api/admin/providers/nuvex/{preview,apply}` (rate limit 10/h en apply). Parser/transporte en `src/server/providers/nuvex/` (`client.ts`, `parser.ts`, `security.ts`) — Worker-friendly, sin cheerio, con anti-SSRF y límites. Migraciones `004_nuvex_sync.sql` (`preview_tokens`, `products.temporary_price`). El GitHub Action `catalog-sync` sigue generando solo `productos.csv` (fallback).
- **Live prices**: Server Islands in `src/server/livePrice.ts` — fetches from provider APIs (Martina di Trento, Kai, Alondra, Nuvex) with 6s timeout, applies markup, falls back silently.
- **Search**: Fuse.js client-side, URL-synced via debounced `searchurlchange` custom event.
- **Category pages**: `loadCategoryProducts()` en `src/utils/loadProducts.ts` — server-side filter + pagination (10/page). Module-level TTL cache (60s) evita re-fetch de 1000+ productos en cada request.
- **Subcategorías Tecno**: `inferTecnoSubcategory()` + `isTecnoProduct()` en `categoryNormalization.ts` — fallback runtime para productos de Supabase sin subcategorías inferidas. Se llama desde `getDisplaySubcategories()` cuando stored subcategories están vacías y el producto es Tecno.
- **Carousels**: `HeroBannerCarousel.astro` (hero, 5 slides con fade), `ProductCarousel.astro` (home), `RelatedProductCarousel.astro` (producto, scroll-snap + smooth scroll propio). `InstruccionesBar.astro` para barras promocionales.
- **Rate limiter + security headers**: in-memory Map in `src/middleware.ts` — default 180 req/min per IP; `/_astro` y `/assets` exempts. Políticas por path: `/api/admin/providers/sync` 10/h, `/api/contact` 8/min, `/admin` y `/api/admin` 60/min. El middleware también inyecta CSP, HSTS, X-Frame-Options, Referrer-Policy, etc.
- **Cart**: client-side only (`addToCart.ts`, `removeToCart.ts`, `renderCart.ts`).
- **Client cache**: Nano Stores (`@nanostores/persistent`) en `src/stores/` — `product-store.ts` cachea `name, price, img, enOferta` en localStorage. `ProductHydrator.tsx` (island React `client:load`) hidrata al montar. `useProduct.tsx` hook con fallback a Supabase.
- **View Transitions**: `<ViewTransitions />` en `Layout.astro`. Prefetch `viewport` config en `astro.config.mjs`.
- **Script pattern**: Todo script cliente debe escuchar `astro:page-load`, NO `DOMContentLoaded` — este último no se dispara con View Transitions. Componentes migrados: `ListarProductos`, `NavPag`, `SideBardCategories`, `AddToCartButton`, `Header`, `SearchInput`, `pedido`.

## Path aliases (tsconfig.json)

`@components/*`, `@layouts/*`, `@utils/*`, `@assets/*`, `@server/*`, `@stores/*` — all resolve from `code/src/`.

## Commands

```sh
pnpm dev          # astro dev on port 4321
pnpm build        # astro build → dist/
pnpm deploy       # build → dist-deploy/ → wrangler deploy (Cloudflare Workers)
pnpm cf:preview   # build → dist-deploy/ → wrangler dev (local Cloudflare preview)
pnpm run providers:sync  # run scraper from webScrappingTool/
pnpm run build:with-sync # providers:sync + astro build
pnpm run db:migrate      # CSV → Supabase migration script
pnpm run scrap           # legacy node scraper
pnpm run images:remove-bg:boots # remove background from boots images
```

## Env vars (code/.env)

All public. Never commit secrets. Template at `code/.env.template`.

| Var | Scope | Notes |
|-----|-------|-------|
| `PUBLIC_USE_SUPABASE` | build (inlined) | `"true"` to enable Supabase data source |
| `PUBLIC_SUPABASE_URL` | build (inlined) | Public, needed by Vite |
| `PUBLIC_SUPABASE_ANON_KEY` | build (inlined) | Public anon key |
| `PUBLIC_TURNSTILE_SITE_KEY` | build (inlined) | Cloudflare Turnstile site key (admin login CAPTCHA) |
| `SUPABASE_URL` | Cloudflare runtime | Server-only `getSupabase()` |
| `SUPABASE_ANON_KEY` | Cloudflare runtime | Server-only |
| `SUPABASE_SERVICE_ROLE_KEY` | Cloudflare runtime | Server-only, for admin writes |
| `CONTACT_TO_EMAIL`, `SMTP_*` | runtime | Email contact form via nodemailer |

`wrangler.jsonc` has NO `vars` section — all Cloudflare env vars set via `wrangler secret put`.

## pnpm v11

- Build scripts bloqueados por defecto. Aprobados via `allowBuilds` en `pnpm-workspace.yaml`: `esbuild`, `sharp`, `workerd`, `wrangler`. Formato mapa (`package: true/false`), no lista.
- `pnpm approve-builds --all` para aprobar builds pendientes no interactivamente (v10.32+).
- Si CI falla con `ERR_PNPM_IGNORED_BUILDS`, correr `pnpm approve-builds --all` local y commitear lockfile.
- `PNPM_CONFIG_ALLOW_BUILDS` env var **pisa** la config del workspace — no usarla en CI.

## Deploy

- **GitHub Actions** (`.github/workflows/cloudflare-deploy.yml`): on push to `impladmin` or `main`, builds and deploys to Workers.
- Build creates a copy at `dist-deploy/` with `.assetsignore` (prevents Pages from tripping on `_worker.js/`).
- Secrets (`CLOUDFLARE_API_TOKEN`, `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`) deben estar en un **GitHub Environment** llamado `production` — el job lo requiere con `environment: production`.
- También se puede necesitar `CLOUDFLARE_ACCOUNT_ID` en algunos contextos.
- Old `deploy.yml` (GitHub Pages, CSV-based) is obsolete but preserved.

## Cloudflare Workers

- Worker name: `bibisaintwebpage`
- Site: `https://bibisaintwebpage.franccesco-giordano11.workers.dev`
- Env vars set via `wrangler secret put` or Cloudflare Dashboard → Worker → Settings → Variables and Secrets.
- `wrangler.jsonc` uses `assets.binding` for static assets from `dist/`, `observability` enabled (Wrangler logs).

## Supabase

- Project: `deilsclvheqcrqswiafa`
- Auth: admin user `bibisventasyserviciosonline@gmail.com`
- RLS: public can only SELECT `active=true` products; all writes require `auth.role()='authenticated'`
- Tables: `products`, `product_images`, `product_related`, `scraper_diffs`, `admin_profiles`
- Migrations: `code/supabase/migrations/001_initial_schema.sql`, `002_security_hardening.sql`

## Credentials policy

Repo is public. **Never commit credentials, secrets, tokens, or passwords.** Use GitHub Actions secrets, `wrangler secret put`, or Cloudflare Dashboard. The `.env` file is gitignored.

---

# Multi-Agent Orchestration System

## Pipeline

**DISCOVER → DIAGNOSE → PLAN → IMPLEMENT → VERIFY**

```
┌────────────────────────────────────────────────────────────────┐
│  User Request → @bibi-coordinator (router ligero)              │
└────────────────────────┬───────────────────────────────────────┘
                         ▼
   ┌──────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐    ┌─────┐
   │  locator │───▶│ diagnostic │───▶│   expert   │───▶│ implementer│───▶│ qa  │
   │  (ubica) │    │  (decide)  │    │ (escala)   │    │ (ejecuta)  │    │(valida│
   │  barato  │    │ intermedio │    │  caro      │    │ intermedio │    │intermedio│
   └──────────┘    └────────────┘    └────────────┘    └────────────┘    └─────┘
     solo read        solo read         solo read         único editor       solo tests
```

- **Tarea simple**: `coordinator → locator → diagnostic → implementer → qa` (sin Expert).
- **Tarea compleja/incierta/alto riesgo**: `coordinator → locator → diagnostic → expert → implementer → qa`.
- **Ramas excepcionales**: `security` (auditoría read-only), `dba` (schema/RLS), `provider-scraper` (scrapers) — solo cuando el diagnóstico lo indique.

## Agentes

| Agente | Rol | Presupuesto (steps) | Permisos |
|---|---|---|---|
| `coordinator` | Router ligero: clasifica, delega, integra, controla ciclos | 10 | edit/bash/web deny; solo delega |
| `locator` | DISCOVER: ubica archivos/líneas/símbolos y alcance read-only del worktree | 6 | read-only + preflight git |
| `diagnostic` | DIAGNOSE: causa probable + decisión `DIRECT`/`ESCALATE_TO_EXPERT` | 10 | read-only |
| `expert` | PLAN: planner de escalación, produce contrato | 12 | read-only |
| `implementer` | IMPLEMENT: aplica el contrato | 20 | único editor de producción |
| `qa` | VERIFY: evidencia obligatoria, matriz de runtime (screenshot+interacción) | 25 | solo tests/evidencia (`edit: ask`) |
| `dba` | Rama excepcional: schema/RLS/migraciones | 15 | read-only, produce contrato |
| `security` | Rama excepcional: auditoría read-only | 15 | read-only |
| `provider-scraper` | Rama excepcional: scrapers/transporte | 15 | read-only, produce contrato |

`designer` está **desactivado** (`disable: true`). Las decisiones de diseño pasan por `expert`; las visuales acotadas se resuelven en `diagnostic`.

## Modelos

Los modelos viven **solo** en `code/.opencode/opencode.json` (campo `agent.<name>.model`), desacoplados de los roles. Asignación inicial:

| Rol | Modelo | Lógica de costo |
|---|---|---|
| coordinator | `openai/gpt-5.4-mini-fast` | barato: solo rutea |
| locator | `openai/gpt-5.4-mini-fast` | barato: solo ubica |
| diagnostic | `openai/gpt-5.5-fast` | intermedio: razona sobre evidencia localizada |
| expert | `openai/gpt-5.6-luna` | caro: SOLO escalación |
| implementer | `openai/gpt-5.5-fast` | intermedio: ejecuta contrato |
| qa | `openai/gpt-5.5-fast` | intermedio: verifica con evidencia |
| dba | `openai/gpt-5.5` | intermedio |
| security | `openai/gpt-5.6-luna` | caro: solo auditoría |
| provider-scraper | `openai/gpt-5.4-mini-fast` | barato |

## Reglas

- **Barato localiza → intermedio diagnostica → caro solo cuando aporta valor → intermedio ejecuta → intermedio verifica.**
- El modelo caro (`gpt-5.6-luna`) nunca localiza archivos ni hace exploración básica.
- El `expert` no reexplora lo que ya localizó `locator`; recibe los handoffs.
- El `implementer` no rediagnostica: aplica el contrato.
- Cada agente tiene un objetivo único y presupuesto estricto de steps. Si se agota sin progreso → **escala o termina**, nunca explora indefinidamente.
- Escritura secuencial: un solo agente edita a la vez. Sin `designer + implementer` en paralelo.
- Máximo **2 ciclos** de QA. Retry sin evidencia nueva prohibido.
- QA independiente: para UI exige viewport exacto + screenshot real + interacción. No aceptar "parece funcionar".
- Coordinator sin capacidad de implementar (edit/bash deny).
- `git commit`/`git push` únicamente con autorización explícita del usuario.

## Contratos de handoff

Cada delegación incluye el bloque del agente receptor (`LOCATOR HANDOFF`, `DIAGNOSTIC HANDOFF`, `EXPERT IMPLEMENTATION CONTRACT`, `QA REPORT`). Sin el bloque, el receptor no empieza y lo pide.

## Harness & Config Files

Capa de agentes/orquestación consolidada en `code/.opencode/` (gitignored — tooling, no código). Se inicia con `cd code && opencode`:

```
code/.opencode/
├── opencode.json                    # Modelos por agente (única fuente)
├── agents/                          # Roles y prompts (.md); permisos/steps en opencode.json
├── orchestration/
│   ├── routing.yaml                 # Matriz de rutas del pipeline
│   ├── model-policy.md              # Política de costo por rol
│   ├── system-integration.md        # Integración pipeline + autosave + OpenSpec
│   └── openspec-orchestration.md    # Pipeline + OpenSpec
├── instructions/
│   ├── project.md                   # Principios core
│   └── harness.md                   # Contratos, presupuestos, puerta de QA
├── autosave/                        # Checkpoints opcionales
├── commands/                        # Comandos OpenCode (opsx-*)
└── skills/                          # Colección única de skills
```

Configuraciones de herramientas en sus carpetas estándar (no se mueven):
- `code/.opencode/` — config de OpenCode (agentes, commands, skills) [canónico]
- `.github/` — adaptadores GitHub Copilot (agents, instructions, prompts, skills)
- `.codex/hooks.json` — hooks de Codex (apunta a `code/.opencode/skills/impeccable/`)

---

**Last Updated**: 2026-08-26  
**System Type**: Pipeline DISCOVER → DIAGNOSE → PLAN → IMPLEMENT → VERIFY  
**Token Strategy**: modelo barato localiza → intermedio diagnostica → caro solo escala → intermedio ejecuta y verifica
