# Bibi Saint — Harness de Orquestación

Pipeline operativo del marco agéntico. Los agentes se rigen por `routing.yaml`, `model-policy.md` y este documento.

## Pipeline

**DISCOVER → DIAGNOSE → PLAN → IMPLEMENT → VERIFY**

```text
Ruta simple:   coordinator → locator → diagnostic → implementer → qa
Ruta compleja: coordinator → locator → diagnostic → expert → implementer → qa
```

## Reanudación

Cuando el usuario pide retomar trabajo previo, el `coordinator` debe consultar primero `engram_mem_context` y, si el contexto es insuficiente, `engram_mem_search`. Después debe ejecutar `locator` para confirmar que la memoria coincide con el estado actual del worktree.

## Presupuestos por agente (steps)

| Agente | steps | Lecturas máx | Escalación si se agota |
|---|---|---|---|
| `locator` | 6 | preflight git read-only | `NOT_FOUND` / `BLOCKED` |
| `diagnostic` | 10 | dependencias directas | `ESCALATE_TO_EXPERT` o termina |
| `expert` | 12 | contexto inmediato | `ESCALATE_TO_USER` |
| `implementer` | 20 | — | `BLOCKED` si el contrato está incompleto |
| `qa` | 25 | — | `FAIL` con evidencia; `BLOCKED_SETUP` si no puede iniciar el entorno |
| `dba` / `security` / `provider-scraper` | 15 | — | reporte o contrato |

Regla general: si un agente alcanza su presupuesto de steps sin progreso significativo, **escala o termina**; nunca continúa explorando indefinidamente.

## Contratos de handoff (obligatorios)

Cada delegación incluye el bloque del agente receptor. Sin él, el agente receptor NO debe empezar y debe pedirlo.

### LOCATOR HANDOFF → diagnostic

```text
Status: FOUND | NOT_FOUND | BLOCKED
Request summary:
Relevant files: (path + lines + symbols)
Worktree scope: (modified + untracked files relevant to the request)
Why relevant:
Minimal excerpts/context:
Observed constraints:
Unknowns:
Suggested next agent:
Stop reason:
```

### DIAGNOSTIC HANDOFF → implementer (DIRECT) o expert (ESCALATE_TO_EXPERT)

```text
Decision: DIRECT | ESCALATE_TO_EXPERT
Problem:
Evidence:
Probable cause:
Confidence: HIGH | MEDIUM | LOW
Complexity: SIMPLE | NORMAL | COMPLEX
Risk: LOW | MEDIUM | HIGH
Regression surface:
Runtime modes / fallbacks:
Authorized files:
Minimal solution:
Do not touch:
Acceptance criteria:
Verification commands:
Why Expert is unnecessary:
```

### EXPERT IMPLEMENTATION CONTRACT → implementer

```text
Decision:
Problem:
Confirmed evidence:
Regression surface:
Runtime modes / fallbacks:
Files authorized:
Exact change:
Implementation steps:
Do not touch:
Acceptance criteria:
Functional tests:
UI evidence required:
Verification commands:
Expected risks:
Rollback boundary:
```

### QA REPORT → coordinator

```text
Verdict: PASS | FAIL | BLOCKED
Block type: NONE | BLOCKED_SETUP | BLOCKED_EVIDENCE
Criteria checked:
Evidence files:
Viewport:
Interactions tested:
Commands:
Real results:
Failures:
Regression status:
Next action:
```

## Puerta de QA (no se pasa sin evidencia)

Para declarar **PASS** en bugs visuales:

- Screenshot en el viewport exacto del reporte.
- Verificación visual: el defecto desapareció (borde completo, sin recorte, alineación correcta).
- Comportamiento interactivo: selección, focus y scroll funcionan.
- Comandos de verificación ejecutados con su resultado real.
- Para cambios de datos/SSR/fallbacks, cada modo de runtime definido en el contrato.

Se marca **FAIL** si:

- La captura aún muestra el defecto aunque las métricas DOM "pasen".
- No hay screenshot o se usó un viewport distinto al reportado.
- Solo se aportan tamaños/rects/ausencia de errores JS sin evidencia visual.
- Se dice "parece funcionar" sin evidencia.
- Se prueba una sola fuente de datos cuando el cambio afecta fuentes alternativas o fallback.

## Reglas de control

1. Escritura secuencial: un solo agente edita a la vez. No paralelizar editores sobre los mismos archivos.
2. Revisores independientes en paralelo SOLO si no editan y evalúan sin ver la opinión del otro (evita "agreement bias").
3. Máximo **2 ciclos** de corrección por bug. Si QA falla 2 veces, escalar al usuario con evidencia. Un retry sin evidencia nueva está prohibido.
4. Los subagentes corren en sesiones aisladas: todo contexto necesario va en el prompt de `task`, nunca "recordar" de la conversación padre.
5. El coordinator no explora, no diagnostica, no implementa: solo recupera contexto de Engram, rutea y controla ciclos.
6. Sin loops `coordinator → agente → coordinator`: cada agente entrega su handoff y termina.
7. El `expert` solo se invoca cuando `diagnostic` decide `ESCALATE_TO_EXPERT`.
8. El implementer no rediagnostica: aplica el contrato.
9. El `locator` debe reportar el alcance del worktree en bugs de regresión o cambios sin commit.
10. El `diagnostic` debe revisar dependencias directas y declarar la superficie de regresión antes de autorizar implementación.
11. `BLOCKED_SETUP` de QA no equivale a `FAIL` y no habilita declarar `PASS`; requiere resolver el entorno o escalarlo.

## Anti-patrones (prohibidos)

- El `expert` reexplorando archivos que el `locator` ya localizó.
- El implementer volviendo a diagnosticar o reexplorar de forma amplia.
- QA aprobando por `boundingClientRect` o ausencia de errores JS sin screenshot.
- QA aprobando un cambio SSR/datos solo con build y tests unitarios.
- Agentes explorando sin presupuesto o reejecutando la misma hipótesis sin evidencia nueva.
- Modelo caro haciendo trabajo de localización o exploración básica.
- Mandar un bug visual directo al implementer sin diagnóstico.
- Handoff ambiguo vía archivos compartidos (`resu.md`) sin contrato estructurado en el prompt de `task`.
- Ignorar el timing de `astro:page-load`: los clicks inmediatos post-carga pueden no responder hasta que el script engancha los listeners.

**Version**: 3.0
**Effective**: 2026-08-26
