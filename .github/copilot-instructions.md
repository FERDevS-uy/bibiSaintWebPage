# Bibi Saint — Copilot Instructions

## Project

E-commerce de calzados **Bibi Saint**. Stack: Astro 5 SSR + Cloudflare Workers + React Islands + Supabase. Desarrollo dentro de `code/`; scraping en `webScrappingTool/`.

## Agents

Custom agents disponibles en `.github/agents/*.agent.md`:
- `@bibi-coordinator` — routing e integración de tareas complejas
- `@bibi-designer` — UI/UX, animaciones, accesibilidad
- `@bibi-implementer` — implementación de código
- `@bibi-qa` — testing y validación
- `@bibi-dba` — base de datos (Supabase, RLS, migraciones)
- `@bibi-security` — auditoría de seguridad (read-only)
- `@bibi-provider-scraper` — scraping de proveedores

## Instructions

- Project: `.github/instructions/project.instructions.md`
- Git: `.github/instructions/git.instructions.md`

## Git rules (CRÍTICO)

- **Nunca** `git push` sin orden explícita del usuario.
- `git commit` solo cuando el usuario lo solicita explícitamente.
- Revisar `git status`/`git diff` antes de commitear; no incluir secretos.

## Architecture summary

- SSR (no static) con `output: "server"` y adapter Cloudflare. Páginas dinámicas SSR, sin `getStaticPaths`.
- Supabase + CSV dual-read (`src/utils/loadProducts.ts`).
- Admin: React SPA en `src/pages/admin/` con Supabase Auth + Turnstile.
- Scripts cliente escuchan `astro:page-load`, no `DOMContentLoaded`.
- Path aliases: `@components/*`, `@layouts/*`, `@utils/*`, `@server/*`, `@stores/*`.

## Conventions

- TypeScript strict, CSS modules, Astro para server rendering.
- Respuestas en español.
- Credenciales solo en env vars server-side; nunca commitear secretos.