# 🎯 System Integration Guide

**Sistema**: Pipeline agéntico `DISCOVER → DIAGNOSE → PLAN → IMPLEMENT → VERIFY` + Auto-Save (checkpoints opcionales) + OpenSpec.

---

## La Arquitectura

```
USER REQUEST
      │
      ▼
┌─────────────┐
│ coordinator │  Router ligero. Clasifica, delega en orden, controla ciclos.
└──────┬──────┘
       │
       ▼
┌─────────┐    ┌───────────┐    ┌───────────┐    ┌──────────────┐    ┌──────┐
│ locator │───▶│ diagnostic│───▶│  expert   │───▶│  implementer │───▶│  qa  │
│ (ubica) │    │ (decide)  │    │ (escala)  │    │ (ejecuta)    │    │(valida│
│  6 st.  │    │  10 st.   │    │  12 st.   │    │  20 st.      │    │25 st.│
└─────────┘    └───────────┘    └───────────┘    └──────────────┘    └──────┘
   solo read      solo read      solo read          único editor        solo tests
```

- **Tarea simple**: `locator → diagnostic (DIRECT) → implementer → qa`. Sin expert.
- **Tarea compleja/incierta/alto riesgo**: `locator → diagnostic (ESCALATE_TO_EXPERT) → expert → implementer → qa`.
- **Ramas excepcionales**: `security` (auditoría read-only), `dba` (schema/RLS), `provider-scraper` (scrapers) — solo cuando el diagnóstico lo indique.
- **Escritura secuencial**: un solo agente edita a la vez.

## Cuándo actúa cada componente

| Fase | Agente | Modelo | Salida |
|---|---|---|---|
| DISCOVER | `locator` | `openai/gpt-5.4-mini-fast` | `LOCATOR HANDOFF` (archivos/líneas/símbolos) |
| DIAGNOSE | `diagnostic` | `openai/gpt-5.5-fast` | `DIAGNOSTIC HANDOFF` + decisión `DIRECT`/`ESCALATE_TO_EXPERT` |
| PLAN | `expert` | `openai/gpt-5.6-luna` | `EXPERT IMPLEMENTATION CONTRACT` |
| IMPLEMENT | `implementer` | `openai/gpt-5.5-fast` | cambio mínimo en archivos autorizados |
| VERIFY | `qa` | `openai/gpt-5.5-fast` | `QA REPORT` con evidencia (screenshot+interacción) |

Modelos centralizados en `code/.opencode/opencode.json`. No duplicar en frontmatter.

## Auto-Save (checkpoints opcionales)

- Los checkpoints en `code/.opencode/autosave/` son **opcionales** y complementarios, NO el canal de coordinación.
- El handoff entre agentes viaja SIEMPRE en el prompt de `task` (contrato estructurado).
- `resu.md` puede guardar decisiones y evidencia para cruzar sesiones, pero nunca sustituye un contrato.

## Recuperación de contexto

- En solicitudes de reanudación, el `coordinator` consulta primero `engram_mem_context` y usa `engram_mem_search` para recuperar decisiones o trabajo específico cuando sea necesario.
- La memoria persistente orienta la reanudación, pero no sustituye la localización actual del worktree ni los handoffs estructurados.
- El `coordinator` no escribe memoria durante el pipeline; la sesión principal conserva la responsabilidad de persistir el resultado.

## OpenSpec

- `openspec-propose` → genera artefactos de planificación (proposal, specs, design, tasks). No implementa.
- `openspec-apply` → ejecuta tareas del cambio. Si el cambio toca múltiples disciplinas, aplica el pipeline: el coordinator rutea `locator → diagnostic` primero y delega la ejecución al `implementer` (y ramas excepcionales si aplica).
- `openspec-archive` → cierra el cambio.
- No hay ejecución paralela de editores: la escritura es secuencial.

## Reglas transversales

1. Cada agente tiene un objetivo único y medible (ver tabla de fases).
2. Presupuestos de `steps` estrictos por agente. Si se agotan sin progreso → escalar o terminar.
3. Máximo 2 ciclos de QA. Retry sin evidencia nueva prohibido.
4. El modelo caro nunca localiza ni explora: solo planifica cuando se lo escala.
5. El implementer no rediagnostica; el expert no reexplora lo ya localizado.
6. QA independiente con evidencia obligatoria para UI (viewport exacto + screenshot + interacción).
7. git commit/push solo con autorización explícita del usuario.
8. Coordinator sin capacidad de implementar (edit/bash deny).

## Archivos de referencia

| Archivo | Propósito |
|---|---|
| `opencode.json` | Modelos por agente (única fuente) |
| `agents/*.md` | Roles y prompts de comportamiento |
| `orchestration/routing.yaml` | Matriz de rutas |
| `orchestration/model-policy.md` | Política de costo por rol |
| `instructions/harness.md` | Contratos, presupuestos, puerta de QA |
