---
applyTo: "**"
---

# Bibi Saint — Instrucciones de Proyecto (GitHub Copilot)

Contexto general para GitHub Copilot. `AGENTS.md` y `code/AGENTS.md` son la fuente canónica de las reglas y la arquitectura; estos archivos complementan esa guía para Copilot.

## Proyecto

Tienda digital de calzados **Bibi Saint**. Stack: Astro 5 SSR + Cloudflare Workers + React Islands + Supabase.

## Estructura

- `code/` — Aplicación Astro (SSR, adapter `@astrojs/cloudflare`).
- `webScrappingTool/` — Paquete TS independiente para scraping de proveedores (Martina, Kai, Alondra, Nuvex).
- `openspec/` — Especificaciones y cambios OpenSpec históricos/activos.
- `sdd/` — Artefactos de trabajo de Gentle AI por proyecto.
- `code/.opencode/` — Configuración local heredada de OpenCode; no asumir que define los agentes disponibles en Copilot.

## Reglas de git

- **Nunca hagas `git push`** sin orden explícita e inequívoca del usuario.
- `git commit` solo cuando el usuario lo solicita explícitamente.
- Revisa `git status` y `git diff` antes de commitear.

## Convenciones

- TypeScript strict. CSS modules. Astro para server rendering.
- Scripts cliente escuchan `astro:page-load` (NO `DOMContentLoaded`).
- Respuestas en español.
- Nunca commitear secretos; credenciales en env vars server-side.
- Las operaciones remotas (deploy, conexiones y credenciales) requieren autorización explícita del usuario para destino, operación y sesión/credencial.

## Comandos (desde code/)

`pnpm dev`, `pnpm build`, `pnpm cf:preview`, `pnpm run providers:sync`, `pnpm test`, `pnpm test:unit`

Ejecutar estos comandos desde `code/`. Los deploys son operaciones remotas: no ejecutar `pnpm deploy` ni `pnpm deploy:dev` sin autorización explícita.
