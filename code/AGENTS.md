# Bibi Saint — AGENTS.md (code/)

Fuente canónica del proyecto de aplicación.

## Proyecto

Tienda digital de calzados Bibi Saint.

Stack principal:
- Astro 5 SSR con Cloudflare Workers
- React Islands
- Supabase (PostgreSQL + Auth)
- Soporte CSV para fallback de catálogo

## Dónde trabajar

- App principal: `code/`
- Scrapers: `../webScrappingTool/`
- Especificaciones y planes: `../openspec/`
- OpenCode se inicia desde `code/`, pero la raíz Git es `../` y puede trabajar en `../webScrappingTool/` y `../openspec/`.

## Arquitectura clave

- SSR real (no static por defecto): `output: "server"` con `@astrojs/cloudflare`.
- Páginas dinámicas (producto/categorías/búsquedas/ofertas/paginación) se renderizan en SSR.
- Lectura dual de catálogo en `src/utils/loadProducts.ts`:
  - Intenta Supabase primero cuando `PUBLIC_USE_SUPABASE === "true"`.
  - Fallback a CSV cuando falla la fuente principal.

## Admin (React + Supabase Auth)

- Admin como SPA React bajo `src/pages/admin/`.
- Login con Turnstile en frontend.
- Auth cliente con key pública anon.
- Writes sensibles solo en servidor con service role.

## Seguridad de writes admin

- Protección de mass assignment mediante `pickWritable()` en `src/server/adminWhitelist.ts`.
- Validación de origen confiable con `hasTrustedOrigin()` en `src/server/security/origin.ts`.
- Endurecimiento de RLS y storage en migraciones de seguridad.

## Nuvex preview/apply

- Flujo en `src/server/providers/nuvexSync.ts`.
- Login a proveedor siempre server-side.
- Preview firmado con HMAC + TTL + `jti` one-shot + actor.
- Apply con revalidación de decisiones y de vigencia del token.
- Endpoints: `POST /api/admin/providers/nuvex/{preview,apply}`.
- Rate limit de apply: 10/h.

## Live prices

- `src/server/livePrice.ts` consulta proveedores (Martina, Kai, Alondra, Nuvex).
- Timeout de 6s y fallback silencioso controlado.
- Aplicación de markup en respuesta de precio en vivo.

## Search

- Búsqueda client-side con Fuse.js.
- Sincronización por URL y evento `searchurlchange`.

## Category pages

- `loadCategoryProducts()` con filtro server-side y paginación (10 por página).
- Cache TTL de 60s a nivel módulo para evitar refetch excesivo en request-driven SSR.
- Normalización/inferencia de subcategorías cuando faltan datos para categorías Tecno.

## Rate limiting y security headers

- Rate limiter in-memory en `src/middleware.ts`.
- Límite default: 180 req/min por IP.
- Exentos: `/_astro` y `/assets`.
- Rutas específicas: `/api/contact` 8/min; `/admin` y `/api/admin` 60/min; Nuvex apply 10/h.
- Headers de seguridad: CSP, HSTS, X-Frame-Options, Referrer-Policy, entre otros.

## Cart

- Carrito client-side (`addToCart.ts`, `removeToCart.ts`, `renderCart.ts`).

## Cache de cliente

- Nano Stores con persistencia local (`@nanostores/persistent`).
- Hidratación inicial de productos vía `ProductHydrator.tsx`.

## View Transitions y scripts cliente

- `Layout.astro` usa View Transitions.
- Los scripts cliente deben escuchar `astro:page-load`.
- No depender de `DOMContentLoaded` para lógica de navegación interna.

## Path aliases

Definidos en `tsconfig.json` y resuelven desde `code/src/`:
- `@components/*`
- `@layouts/*`
- `@utils/*`
- `@assets/*`
- `@server/*`
- `@stores/*`

## Comandos (desde code/)

```sh
pnpm dev
pnpm build
pnpm deploy
pnpm cf:preview
pnpm run providers:sync
pnpm run build:with-sync
pnpm run db:migrate
pnpm test
pnpm test:unit
pnpm run scrap
pnpm run images:remove-bg:boots
```

## Variables de entorno

- Públicas de build: `PUBLIC_*`.
- Sensibles server/runtime: `SUPABASE_*`, `SMTP_*`, `NUVEX_*`.
- Nunca mover secretos al frontend ni commitearlos.
- `code/.env.template` es referencia de estructura.
- En Cloudflare, valores sensibles van por secrets (no hardcode).

## pnpm/build details

- pnpm v11 con política de build scripts aprobados (`allowBuilds` en workspace).
- Si CI bloquea builds por seguridad (`ERR_PNPM_IGNORED_BUILDS`), ejecutar `pnpm approve-builds --all`.
- No usar `PNPM_CONFIG_ALLOW_BUILDS` en CI.
- Evitar overrides globales que oculten el estado real del workspace.

## Deploy (Cloudflare + GitHub Actions)

- Pipeline principal en `.github/workflows/cloudflare-deploy.yml`.
- Build produce artefacto para deploy en Cloudflare Workers.
- Secrets de deploy en entorno de GitHub adecuado.
- `wrangler secret put` / Dashboard para secretos runtime.

## Convenciones Supabase

- Mantener RLS activo en tablas sensibles.
- Lectura pública solo de productos activos (`active=true`) cuando aplique.
- Writes autenticados y server-side.
- Migraciones incrementales: no reescribir historia previa.

## Responsive y layout

- Max container ~1000px centrado.
- Breakpoints: mobile <999px; desktop 1000px+.
- Mantener consistencia visual entre catálogo, detalle y admin.

## Accesibilidad

- Objetivo WCAG 2.1 AA.
- Validar navegación por teclado, contraste y foco visible en componentes críticos.

## Convenciones de código

- TypeScript strict.
- CSS modules/scoped.
- Componentes Astro por defecto para SSR; `client:load`/`client:idle`/`client:visible` solo cuando corresponda.
- Mantener cambios acotados, sin side effects innecesarios.

## Idioma y respuesta del proyecto

- Documentación operativa y respuestas al equipo en español, salvo pedido explícito en otro idioma.

## Reglas git

- No hacer `git commit` ni `git push` sin orden explícita del usuario.
- Revisar `git status` y `git diff` antes de preparar entregables.
- Nunca incluir secretos o credenciales en cambios versionados.
