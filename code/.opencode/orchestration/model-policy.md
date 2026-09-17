# Model Policy — Bibi Saint

## Autoridad de modelos

La asignacion de modelos es global (OpenCode + Gentle AI) y no se fija en esta capa local.

## Politica local

- Este repo mantiene skills y reglas de dominio.
- No declarar ni duplicar matrices de modelos en docs locales.
- Si se audita costo/rendimiento, usar `opencode debug config` y `opencode agent list` como evidencia runtime.

## Seguridad de datos

- No exponer secretos en prompts o logs de debugging.
- No asumir disponibilidad permanente de modelos promocionales.
