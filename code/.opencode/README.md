# .opencode/ — Contexto local del proyecto

Este directorio contiene contexto local para trabajar Bibi Saint desde OpenCode.

## Objetivo

- Proveer skills y guias de proyecto.
- Mantener documentacion local alineada con el runtime real.
- Evitar configuracion legacy no activa.

## Estructura actual

```text
code/.opencode/
├── skills/            # Skills de proyecto (incluye bibi-database, bibi-security, bibi-providers)
├── commands/          # Comandos de apoyo del repo (opsx-*)
├── instructions/      # Reglas locales y contratos livianos
├── orchestration/     # Documentacion de integracion y routing declarado
└── autosave/          # Checkpoints/documentos operativos
```

## Alcance y limites

- El runtime principal de agentes/modelos/perfiles se define en la capa global de OpenCode + Gentle AI.
- Este repo no debe forzar configuracion global ni duplicar ese runtime.
- Los adaptadores `.github/` y `.codex/` se preservan separados.

## Referencias

- `code/AGENTS.md` - fuente principal de contexto del proyecto.
- `../openspec/` - planes y cambios de especificacion.
- `../webScrappingTool/` - paquete de scrapers de proveedores.
