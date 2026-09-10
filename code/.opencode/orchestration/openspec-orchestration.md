# OpenSpec Integration — Bibi Saint

## Objetivo

OpenSpec gestiona especificaciones y tareas. Las implementaciones deben respetar skills locales de dominio.

## Integracion esperada

1. Plan/spec en `openspec/`.
2. Implementacion en `code/` y, si aplica, `webScrappingTool/`.
3. Validacion con comandos del proyecto y checklists de skills.

## Reglas

- No usar esta guia para declarar runtime de agentes/modelos.
- Mantener trazabilidad simple entre artefacto OpenSpec y cambios reales.
- Si el cambio toca DB, seguridad o proveedores, cargar respectivamente:
  - `bibi-database`
  - `bibi-security`
  - `bibi-providers`
