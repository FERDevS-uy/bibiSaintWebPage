# .opencode/ — Configuración OpenCode y Orquestación

Carpeta central del marco agéntico del proyecto. Vive dentro de `code/` porque ese es el workspace operativo de OpenCode (se inicia con `cd code && opencode`). Agrupa agentes, orquestación, instrucciones, autosave, commands y skills.

## Estructura

```
.opencode/
├── README.md                          # Este índice
├── agents/                            # Agentes y subagentes (.md individuales)
│   ├── coordinator.md                 # Agente principal: routing e integración
│   ├── designer.md                    # UI/UX, animaciones, accesibilidad
│   ├── implementer.md                 # Astro, React, TS, APIs, lógica
│   ├── qa.md                          # Tests, validación, reproducción de bugs
│   ├── dba.md                         # Supabase, migraciones, RLS
│   ├── security.md                    # Auditoría de seguridad (solo lectura)
│   └── provider-scraper.md            # Scrapers y transporte de proveedores
├── orchestration/
│   ├── routing.yaml                   # Matriz de routing entre agentes
│   ├── model-policy.md                # Política de asignación de modelos
│   ├── system-integration.md          # Integración agentes + OpenSpec + autosave
│   └── openspec-orchestration.md      # División frontend/backend/full-stack
├── instructions/
│   ├── project.md                     # Principios core + matriz de routing
│   └── harness.md                     # Decision tree + reglas operacionales
├── autosave/
│   ├── README.md                      # Sistema integral auto-save
│   ├── rules.md                       # Reglas detalladas de auto-save
│   └── resu.md                        # Resumen ejecutivo / checkpoints
├── commands/                          # Comandos OpenCode (opsx-*)
└── skills/                            # Colección única de skills
```

## Referencias

- `code/AGENTS.md` — contexto del proyecto (Astro, Supabase, Cloudflare, webScrappingTool).
- `.github/` (raíz) — adaptadores GitHub Copilot (agentes, instrucciones, prompts, skills).
- `.codex/hooks.json` — hook de impeccable apuntando a `.opencode/skills/impeccable/`.
- `openspec/` (raíz) — configuración OpenSpec, referencia `.opencode/autosave/resu.md`.

## Convención

- Todo lo operacional del marco agéntico vive aquí, bajo `code/.opencode/`.
- Los agentes son archivos `.md` individuales con frontmatter (model, mode, permission).
- Las rutas de navegación entre documentos usan referencias relativas.