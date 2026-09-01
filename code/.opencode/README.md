# .opencode/ — Configuración OpenCode y Orquestación

Carpeta central del marco agéntico del proyecto. Vive dentro de `code/` porque ese es el workspace operativo de OpenCode (se inicia con `cd code && opencode`). Agrupa agentes, orquestación, instrucciones, autosave, commands y skills.

## Estructura

```
.opencode/
├── README.md                          # Este índice
├── opencode.json                      # Modelos por agente (única fuente de modelos)
├── agents/                            # Agentes y subagentes (.md individuales)
│   ├── coordinator.md                 # Router principal (primary)
│   ├── locator.md                     # DISCOVER: ubica archivos/líneas (barato)
│   ├── diagnostic.md                  # DIAGNOSE: causa probable + decisión DIRECT/EXPERT
│   ├── expert.md                      # PLAN: planner de escalación (caro)
│   ├── implementer.md                 # IMPLEMENT: aplica el contrato
│   ├── qa.md                          # VERIFY: validación con evidencia
│   ├── designer.md                    # DESACTIVADO (disable: true)
│   ├── dba.md                         # Rama excepcional: DB/RLS
│   ├── security.md                    # Rama excepcional: auditoría read-only
│   └── provider-scraper.md            # Rama excepcional: scrapers
├── orchestration/
│   ├── routing.yaml                   # Matriz de rutas del pipeline
│   ├── model-policy.md                # Política de costo por rol
│   ├── system-integration.md          # Integración pipeline + autosave + OpenSpec
│   └── openspec-orchestration.md      # Pipeline + OpenSpec
├── instructions/
│   ├── project.md                     # Principios core + contexto
│   └── harness.md                     # Contratos, presupuestos, puerta de QA
├── autosave/
│   ├── README.md                      # Checkpoints opcionales
│   ├── rules.md                       # Reglas de auto-save
│   └── resu.md                        # Resumen ejecutivo / checkpoints
├── commands/                          # Comandos OpenCode (opsx-*)
└── skills/                            # Colección única de skills
```

## Pipeline

**DISCOVER → DIAGNOSE → PLAN → IMPLEMENT → VERIFY**

```text
Ruta simple:   coordinator → locator → diagnostic → implementer → qa
Ruta compleja: coordinator → locator → diagnostic → expert → implementer → qa
```

- El `coordinator` solo rutea; no explora ni implementa.
- Los modelos viven únicamente en `opencode.json` (rol y modelo desacoplados).
- Presupuestos de `steps` estrictos por agente.
- El `expert` (modelo caro) solo se invoca cuando `diagnostic` decide `ESCALATE_TO_EXPERT`.

## Referencias

- `code/AGENTS.md` — contexto del proyecto (Astro, Supabase, Cloudflare, webScrappingTool).
- `.github/` (raíz) — adaptadores GitHub Copilot (agentes, instrucciones, prompts, skills).
- `.codex/hooks.json` — hook de impeccable apuntando a `.opencode/skills/impeccable/`.
- `openspec/` (raíz) — configuración OpenSpec, referencia `.opencode/autosave/resu.md`.

## Convención

- Todo lo operacional del marco agéntico vive aquí, bajo `code/.opencode/`.
- Los agentes son archivos `.md` individuales con frontmatter de identidad y comportamiento. Modelos, steps y permisos viven en `opencode.json`.
- Las rutas de navegación entre documentos usan referencias relativas.
