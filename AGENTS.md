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

## Architecture

```
┌─────────────────────────────────────┐
│   User Request / @bibi-coordinator  │  ← Entry point (Coordinator Agent)
└──────────────────┬──────────────────┘
                   │ Routes based on task type
        ┌──────────┼──────────┬──────────┬───────────┐
        │          │          │          │           │
   Design     Implementation  Testing   Database  Research
        │          │          │          │           │
    ┌───▼──┐   ┌───▼──┐   ┌──▼──┐   ┌──▼───┐   ┌──▼──┐
    │Design│   │Impl. │   │ QA  │   │ DBA  │   │Brain│
    └──────┘   └──────┘   └─────┘   └──────┘   └─────┘
        │          │          │          │           │
        └──────────┼──────────┼──────────┼───────────┘
                   │
           Coordinator integrates results
```

## Specialist Agents

### 🎨 @bibi-designer
**Mission**: Visual & interaction design decisions  
**Owns**:
- UI layouts, typography, color systems
- Design system components
- Animation/motion effects
- Accessibility & responsive design
- Design spec generation

**When to invoke**:
```
✓ "Rediseña la página de producto"
✓ "Hazme un componente de carrusel"
✓ "¿Qué tipo de animación usarías aquí?"
✓ Cualquier solicitud visual/UX
```

**Skills loaded**: 
- `design-taste-frontend`
- `high-end-visual-design`
- `imagegen-frontend-web`
- `apple-design`
- `animation-vocabulary`

**Token optimization**: Skips backend code context, loads design-focused skills only

---

### 💻 @bibi-implementer
**Mission**: Code implementation & architecture  
**Owns**:
- Astro components, TypeScript, CSS
- API endpoints & server logic
- Feature implementation from specs
- Refactoring & code quality
- Performance optimization

**When to invoke**:
```
✓ "Implementa el carrito de compras"
✓ "Arregla el bug del header"
✓ "Refactoriza ProductCarousel.astro"
✓ Cualquier cambio de código
```

**Skills loaded**:
- `supabase-postgres-best-practices` (si es DB work)
- Project architecture context

**Token optimization**: Keeps full codebase context, skips design philosophy

---

### 🧪 @bibi-qa
**Mission**: Testing, validation, bug reproduction  
**Owns**:
- Test writing (Playwright, integration tests)
- Bug reproduction & debugging
- Performance validation
- Deployment smoke tests
- QA sign-off

**When to invoke**:
```
✓ "Escribe tests para la búsqueda"
✓ "¿Por qué no funciona el carrito?"
✓ "Verifica que la migración funcione"
```

**Skills loaded**:
- `runtime-validation`

**Token optimization**: Focused test context only, minimal codebase

---

### 📊 @bibi-dba
**Mission**: Database schema, migrations, performance  
**Owns**:
- Supabase migrations & RLS policies
- Schema design & optimization
- Query performance tuning
- Data integrity

**When to invoke**:
```
✓ "Crea una migración para productos relacionados"
✓ "¿Cuál es la mejor forma de indexar esta tabla?"
✓ "Hardened el RLS del panel admin"
```

**Skills loaded**:
- `supabase-postgres-best-practices`

**Token optimization**: Ultra-focused database-only context

---

### 🧠 @bibi-coordinator
**Mission**: Route requests, optimize token flow  
**Owns**:
- Request analysis & routing
- Multi-agent orchestration
- Result integration
- Token efficiency decisions

**When to invoke**:
```
✓ All requests START here (unless direct specialist mention)
✓ "Quiero rediseñar toda la página de inicio"
✓ Complex multi-discipline tasks
```

**Process**:
1. Analyze request complexity
2. Identify specialist(s) needed
3. Pass minimal context to each
4. Integrate results into deliverable

---

## How to Use

### Direct Specialist (Fast Path)
If you know who you need:
```
@bibi-designer Rediseña la navegación
@bibi-implementer Arregla el bug del carrito
```

### Coordinator (Recommended)
For complex or uncertain requests:
```
Me gustaría mejorar el flujo de checkout
```
→ Coordinator analyzes → Routes to Designer + Implementer → Integrates

### Token Optimization Checklist

- [ ] Coordinator routes, not monolithic agent
- [ ] Each specialist gets ONLY relevant context
- [ ] File excerpts, not full codebase
- [ ] Reuse specialist context in same conversation
- [ ] Load skills only when needed
- [ ] One agent per task (avoid multi-discipline in single agent)

---

## Skill Availability

Skills físicas en `code/.opencode/skills/`:

**Diseño/UX**:
- `design-taste-frontend` — Anti-slop frontend design
- `high-end-visual-design` — Premium visual system
- `imagegen-frontend-web` — Design reference generation
- `image-to-code` — Visual implementation
- `apple-design` — iOS/Fluid interface patterns
- `animation-vocabulary` — Motion naming
- `emil-design-eng` — UI polish & details
- `improve-animations` — Motion audit & planning
- `redesign-existing-projects` — Full redesigns
- `frontend-design` — Intentional design guidance
- `impeccable` — UI critique / design review
- `review-animations` — Motion review (high bar)

**Base de datos**:
- `supabase-postgres-best-practices` — DB best practices

**Stack (Astro/Cloudflare/React)**:
- `astro`, `cloudflare-deploy`, `workers-best-practices`, `wrangler`, `react-best-practices`, `typescript-advanced-types`, `seo`, `accessibility`, `web-perf`

**Workflow OpenSpec** (en `code/.opencode/skills/`):
- `openspec-propose`, `openspec-explore`, `openspec-apply-change`, `openspec-update-change`, `openspec-sync-specs`, `openspec-archive-change`

**Removed** (irrelevant to e-commerce):
- brandkit, imagegen-frontend-mobile, industrial-brutalist-ui, minimalist-ui, gpt-taste, stitch-design-taste, design-taste-frontend-v1, full-output-enforcement

---

## Harness & Config Files

Capa de agentes/orquestación consolidada en `code/.opencode/` (gitignored — tooling, no código). Se inicia con `cd code && opencode`:

```
code/.opencode/
├── README.md                        # Índice de la capa
├── agents/                          # Agentes/subagentes individuales (.md)
├── orchestration/
│   ├── routing.yaml                 # Matriz de routing entre agentes
│   └── model-policy.md              # Política de modelos por agente
├── instructions/                    # Principios core + harness
├── autosave/                        # Auto-save + resu.md (checkpoints)
├── commands/                        # Comandos OpenCode (opsx-*)
└── skills/                          # Colección única de skills
```

Configuraciones de herramientas en sus carpetas estándar (no se mueven):
- `code/.opencode/` — config de OpenCode (agentes, commands, skills) [canónico]
- `.github/` — adaptadores GitHub Copilot (agents, instructions, prompts, skills)
- `.codex/hooks.json` — hooks de Codex (apunta a `code/.opencode/skills/impeccable/`)

---

**Last Updated**: 2026-08-26  
**System Type**: Coordinator + 4 Specialists  
**Token Strategy**: Narrow context per agent
