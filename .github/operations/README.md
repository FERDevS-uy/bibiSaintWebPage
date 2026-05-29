# Operacion Produccion

Este directorio contiene guias operativas para mantener estable el e-commerce estatico (Astro + GitHub Pages + CSV + scraping).

## Archivos

- checklist-predeploy.md: validaciones obligatorias antes de desplegar.
- checklist-postdeploy.md: validaciones inmediatamente despues del deploy.
- runbook-incidentes-datos.md: pasos de diagnostico, contencion y recuperacion ante fallos de datos.

## Flujo recomendado

1. Ejecutar checklist-predeploy.md.
2. Tomar decision Go/No-Go.
3. Si es Go, desplegar.
4. Ejecutar checklist-postdeploy.md.
5. Si hay incidente, seguir runbook-incidentes-datos.md.
