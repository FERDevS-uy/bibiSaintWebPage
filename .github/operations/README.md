# Operación de producción

Este directorio contiene guías operativas para mantener estable el e-commerce SSR (Astro + Cloudflare Workers + read model de Supabase + scraping).

## Archivos

- checklist-predeploy.md: validaciones obligatorias antes de desplegar.
- checklist-postdeploy.md: validaciones inmediatamente despues del deploy.
- runbook-incidentes-datos.md: pasos de diagnostico, contencion y recuperacion ante fallos de datos.

## Flujo recomendado

1. Ejecutar checklist-predeploy.md.
2. Tomar decision Go/No-Go.
3. Si es Go, desplegar a Cloudflare Workers.
4. Ejecutar checklist-postdeploy.md.
5. Si hay incidente, seguir runbook-incidentes-datos.md.
