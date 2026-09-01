# OpenSpec + Pipeline Agéntico

## Objetivo

Cuando creás un cambio en OpenSpec, el pipeline agéntico lo procesa de forma secuencial:

1. `openspec-propose` genera los artefactos de planificación.
2. `openspec-apply` ejecuta las tareas siguiendo `DISCOVER → DIAGNOSE → PLAN → IMPLEMENT → VERIFY`.
3. `openspec-archive` cierra el cambio.

## Flujo Integrado

```
User: "Quiero mejorar el flujo de checkout"
        │
        ▼
[openspec-propose]  → proposal.md, specs/, design.md, tasks.md  (planificación, no implementa)
        │
        ▼
[openspec-apply]
        │
        ▼
coordinator → locator → diagnostic → (expert si escala) → implementer → qa
        │
        ▼
[openspec-archive]  → cierra el cambio
```

## Cómo el pipeline procesa un cambio

El coordinator recibe las tareas del cambio y rutea el pipeline:

| Cambio | Ruta |
|---|---|
| Frontend/UI | `locator → diagnostic → (expert si escala) → implementer → qa` |
| Backend/API | `locator → diagnostic → (expert si escala) → implementer → qa` |
| Schema/RLS | `locator → diagnostic → dba → implementer → qa` |
| Scrapers/transporte | `locator → diagnostic → provider-scraper → implementer → qa` |
| Auditoría de seguridad | `security` (read-only) |

La escritura es **secuencial**: un solo agente edita a la vez. No hay ejecución paralela de editores sobre los mismos archivos.

## Handoff con OpenSpec

- Los artefactos de OpenSpec (design.md, tasks.md) son entrada para el pipeline, no canal de coordinación entre agentes.
- El handoff entre agentes viaja en el prompt de `task` (contrato estructurado).
- `resu.md` puede guardar checkpoints, pero nunca sustituye un contrato.

## Reglas

1. `openspec-propose` solo planifica; no implementa (guardrail del workflow).
2. El `expert` solo se invoca cuando `diagnostic` decide `ESCALATE_TO_EXPERT`.
3. Máximo 2 ciclos de QA; un retry sin evidencia nueva está prohibido.
4. No prometer ahorros de tokens/minutos no verificables: la optimización se logra con presupuestos estrictos y sin exploración duplicada.
5. Los modelos viven solo en `code/.opencode/opencode.json`.
