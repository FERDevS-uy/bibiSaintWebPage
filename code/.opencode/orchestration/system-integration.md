# System Integration Guide

## Capas

- Runtime de agentes y perfiles: configuracion global de OpenCode + Gentle AI.
- Contexto local de este repo: `code/.opencode/`.
- Adaptadores de otras plataformas:
    - `.github/` para Copilot.
    - `.codex/` para hooks de Codex.

## Integracion funcional

- App principal en `code/`.
- Scrapers/proveedores en `webScrappingTool/`.
- Specs y planes en `openspec/`.
- Skills locales de dominio viven en `code/.opencode/skills/`.

## Reglas

1. No mezclar configuracion global con documentacion local.
2. Mantener las tres capas desacopladas para evitar conflictos de runtime.
3. Para cambios de dominio, apoyarse en skills locales y validar con comandos del proyecto.
