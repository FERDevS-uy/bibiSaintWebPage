# Bibi Saint — AGENTS.md (raíz)

Índice corto del monorepo.

## Dónde trabajar

- App principal: `code/`
- Scrapers: `webScrappingTool/`
- Planes OpenSpec: `openspec/`
- OpenCode normalmente se inicia con `cd code && opencode`.

## Fuente de contexto principal

- Leer primero `code/AGENTS.md` para arquitectura, comandos y reglas del proyecto.

## Capas de agentes

- OpenCode local del repo: `code/.opencode/` (skills, commands y contexto específico del proyecto).
- Gentle AI / orquestación: configuración global de OpenCode.
- Adaptadores Copilot: `.github/`.
- Hook de Codex: `.codex/hooks.json`.

## Reglas críticas

- No commitear secretos.
- No ejecutar `git commit` ni `git push` sin orden explícita del usuario.
- No tocar configuraciones globales de OpenCode/Gentle salvo pedido explícito.