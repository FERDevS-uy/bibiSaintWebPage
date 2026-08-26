# Bibi Saint — AGENTS.md (code/)

Contexto del workspace operativo de OpenCode. Se inicia con `cd code && opencode`. Todo el marco agéntico vive en `code/.opencode/`.

## Proyecto

Tienda digital de calzados **Bibi Saint**. Stack: Astro 5 SSR + Cloudflare Workers + React Islands + Supabase.

## Estructura

- `code/` — Aplicación Astro (SSR, output server, adapter `@astrojs/cloudflare`).
- `../webScrappingTool/` — Paquete TS independiente para scraping de proveedores (Martina, Kai, Alondra, Nuvex). Genera `code/src/data/productos.csv`.
- `../openspec/` — Configuración y cambios OpenSpec (spec-driven).
- `code/.opencode/` — Marco agéntico (agentes, routing, modelos, skills, commands).

> OpenCode se inicia desde `code/`, pero el workspace Git es la raíz del repo: los agentes pueden leer/modificar `../webScrappingTool/` y `../openspec/`.

## Comandos (desde code/)

```sh
pnpm dev          # astro dev en puerto 4321
pnpm build        # astro build → dist/
pnpm deploy       # build → dist-deploy/ → wrangler deploy (Cloudflare Workers)
pnpm cf:preview   # build → dist-deploy/ → wrangler dev (preview local)
pnpm run providers:sync  # ejecuta scraper de webScrappingTool
pnpm run build:with-sync # providers:sync + astro build
pnpm run db:migrate      # CSV → Supabase
pnpm test         # playwright test
pnpm test:unit    # node --test sobre tests/*.test.ts
```

## Arquitectura clave

- **SSR (no static)**: `output: "server"`, adapter Cloudflare. Páginas dinámicas son SSR — no `getStaticPaths`.
- **Supabase + CSV dual-read**: `loadProducts()`/`loadProductById()`/`loadRelatedProducts()` en `src/utils/loadProducts.ts` intentan Supabase primero (`PUBLIC_USE_SUPABASE === "true"`), fallback a CSV.
- **Admin**: React SPA en `src/pages/admin/`. Supabase Auth (anon key client-side), writes server-side con `getSupabaseAdmin()` (service role). Login con Turnstile CAPTCHA.
- **Seguridad admin**: `pickWritable()` (`src/server/adminWhitelist.ts`), `hasTrustedOrigin()` (`src/server/security/origin.ts`), RLS + storage hardening.
- **Nuvex sync**: `src/server/providers/nuvexSync.ts` (login server-side, preview firmado HMAC + TTL + jti one-shot + actor, apply con revalidación). Endpoints `POST /api/admin/providers/nuvex/{preview,apply}`.
- **Live prices**: Server Islands en `src/server/livePrice.ts` (Martina, Kai, Alondra, Nuvex, timeout 6s, markup, fallback silencioso).
- **Search**: Fuse.js client-side, URL-synced via `searchurlchange`.
- **Category pages**: `loadCategoryProducts()` server-side + pagination (10/page), TTL cache 60s.
- **Rate limiter + security headers**: in-memory Map en `src/middleware.ts` (180 req/min por IP default; exentos `/_astro`, `/assets`; paths admin con políticas específicas).
- **Cart**: client-side (`addToCart.ts`, `removeToCart.ts`, `renderCart.ts`).
- **Client cache**: Nano Stores (`@nanostores/persistent`) en `src/stores/` + `ProductHydrator.tsx`.
- **View Transitions**: `<ViewTransitions />` en `Layout.astro`. Todo script cliente escucha `astro:page-load` (NO `DOMContentLoaded`).

## Path aliases (tsconfig.json)

`@components/*`, `@layouts/*`, `@utils/*`, `@assets/*`, `@server/*`, `@stores/*` — desde `code/src/`.

## Env vars

Todas públicas en build (`PUBLIC_*`) o runtime en Cloudflare (`SUPABASE_*`, `SMTP_*`, `NUVEX_*`). Nunca commitear credenciales. Template en `code/.env.template`.

## Marco agéntico

- **Pipeline**: `DISCOVER → DIAGNOSE → PLAN → IMPLEMENT → VERIFY`. Ruta simple: `coordinator → locator → diagnostic → implementer → qa`. Ruta compleja: `coordinator → locator → diagnostic → expert → implementer → qa`.
- **Agentes**: `code/.opencode/agents/` — `coordinator` (primary, router ligero), `locator`, `diagnostic`, `expert`, `implementer`, `qa`, `dba`, `security`, `provider-scraper` (subagents). `designer` desactivado.
- **Routing**: `code/.opencode/orchestration/routing.yaml`.
- **Modelos**: solo en `code/.opencode/opencode.json` (`agent.<name>.model`), desacoplados de los roles. `expert` = `gpt-5.6-luna` (caro, solo escalación); `locator`/`coordinator` baratos; `diagnostic`/`implementer` intermedios.
- **Presupuestos**: `steps` estrictos por agente (locator 6, diagnostic 10, expert 12, implementer 20, qa 15). Si un agente se agota sin progreso → escala o termina.
- **Reglas**:
  - El implementer puede hacer `git commit` SOLO cuando el usuario lo solicita explícitamente.
  - Ningún agente hace `git push` sin orden explícita del usuario.
  - Coordinator sin capacidad de implementar (edit/bash deny); solo rutea y controla máx 2 ciclos de QA.
  - Escritura secuencial; sin ejecución paralela de editores.
  - QA con evidencia obligatoria para UI (viewport exacto + screenshot + interacción).
- **Skills**: `code/.opencode/skills/` — colección única (diseño, stack, OpenSpec, supabase).

## Convenciones de código

- TypeScript strict.
- CSS modules / scoped.
- Componentes Astro para server rendering; hidratación con `client:load` / `client:idle` / `client:visible`.
- Max container width ~1000px centrado.
- Responsive: mobile (<999px), desktop (1000px+).
- Accesibilidad: WCAG 2.1 AA.
- Respuestas en español (a menos que se pida otro idioma).