# Bibi Saint — Instrucciones de Proyecto (GitHub Copilot)

Contexto general para GitHub Copilot. El marco agéntico canónico vive en `code/.opencode/` (OpenCode); estos archivos son adaptadores para Copilot.

## Proyecto

Tienda digital de calzados **Bibi Saint**. Stack: Astro 5 SSR + Cloudflare Workers + React Islands + Supabase.

## Estructura

- `code/` — Aplicación Astro (SSR, adapter `@astrojs/cloudflare`).
- `webScrappingTool/` — Paquete TS independiente para scraping de proveedores (Martina, Kai, Alondra, Nuvex).
- `openspec/` — Configuración y cambios OpenSpec.
- `code/.opencode/` — Marco agéntico canónico (agentes, routing, modelos, skills).

## Agentes (adaptadores)

Ver `.github/agents/*.agent.md`:
- `bibi-coordinator` — routing e integración
- `bibi-designer` — UI/UX
- `bibi-implementer` — código
- `bibi-qa` — testing
- `bibi-dba` — base de datos
- `bibi-security` — auditoría (read-only)
- `bibi-provider-scraper` — scraping

## Reglas de git

- **Nunca hagas `git push`** sin orden explícita e inequívoca del usuario.
- `git commit` solo cuando el usuario lo solicita explícitamente.
- Revisa `git status` y `git diff` antes de commitear.

## Convenciones

- TypeScript strict. CSS modules. Astro para server rendering.
- Scripts cliente escuchan `astro:page-load` (NO `DOMContentLoaded`).
- Respuestas en español.
- Nunca commitear secretos; credenciales en env vars server-side.

## Comandos (desde code/)

`pnpm dev`, `pnpm build`, `pnpm deploy`, `pnpm run providers:sync`, `pnpm test`, `pnpm test:unit`