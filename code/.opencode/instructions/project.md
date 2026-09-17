# Bibi Saint — Project Instructions

## Scope

Este archivo define reglas locales del proyecto para trabajo diario en `code/`.

## Core rules

1. Mantener separacion entre capas.
2. No commitear secretos ni mover credenciales a cliente.
3. `git commit` y `git push` solo con orden explicita del usuario.
4. Preservar SSR en Astro y fallbacks de datos/proveedores existentes.

## Separation of concerns

- Runtime global de agentes/modelos: fuera del repo.
- Contexto local del repo: `code/.opencode/skills/` y documentacion local.
- Adaptadores independientes: `.github/` y `.codex/`.

## Architecture guardrails

- `code/` es la app principal.
- `webScrappingTool/` es paquete separado para scrapers.
- Supabase + fallback CSV deben seguir funcionando.
- Scripts cliente deben engancharse a `astro:page-load`.

## Domain skills

Cuando el cambio toque estas areas, cargar skill local correspondiente:

- `bibi-database` para DB, migraciones y RLS.
- `bibi-security` para seguridad de admin/APIs/headers/origin checks.
- `bibi-providers` para scrapers, transporte y precios en vivo.
