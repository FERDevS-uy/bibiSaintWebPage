# Bibi Saint — Harness de Orquestación v4

Objetivo: **calidad con mínimo coste de contexto y mínimo número de subagentes**.

## Regla principal

No existe una ruta obligatoria única. El `coordinator` selecciona la **ruta mínima suficiente**.

```text
PRE_DIAGNOSED: implementer → qa → reviewer
FAST_KNOWN:     implementer → qa
FAST_LOCATE:    locator → implementer → qa
NORMAL:         locator → diagnostic → implementer → qa → reviewer
COMPLEX:        locator → diagnostic → expert → implementer → qa → reviewer
```

Ramas:

```text
DB/RLS:      locator → diagnostic → dba → implementer → qa → reviewer
Scrapers:    locator → diagnostic → provider-scraper → implementer → qa → reviewer
Security:    security (read-only)
```

Un contrato PRE_DIAGNOSED completo puede saltar locator/diagnostic incluso en una rama especializada; en ese caso conservar `qa → reviewer` si no es trivial.

## Presupuestos reales

Los límites efectivos viven en `opencode.json` mediante `steps`.

| Agente | Steps | Propósito |
|---|---:|---|
| coordinator | 5 | clasificar/rutear |
| locator | 4 | ubicar targets |
| diagnostic | 7 | causa + contrato |
| expert | 8 | resolver escalación |
| implementer | 14 | editar + verificar |
| qa | 7 | evidencia mecánica |
| reviewer | 6 | firma semántica final |
| dba | 10 | DB excepcional |
| security | 8 | auditoría |
| provider-scraper | 9 | proveedor excepcional |

Si un agente no progresa dentro del presupuesto, termina o escala. Nunca exploración indefinida.

## Contratos

### DIRECT EXECUTION CONTRACT

Para FAST_KNOWN / FAST_LOCATE:

```text
DIRECT EXECUTION CONTRACT
Goal:
Targets:
Exact requested change:
Do not touch:
Acceptance criteria:
Verification:
Preserve worktree: YES | NO
Reviewer required: YES | NO
```

### LOCATOR HANDOFF

```text
LOCATOR HANDOFF
Status: FOUND | NOT_FOUND | BLOCKED
Targets:
- path:lines — symbol — motivo breve
Worktree conflicts:
Constraints:
Unknowns:
Stop reason:
```

### DIAGNOSTIC HANDOFF

```text
DIAGNOSTIC HANDOFF
Decision: DIRECT | ESCALATE_TO_EXPERT
Goal:
Cause:
Evidence:
Confidence: HIGH | MEDIUM | LOW
Risk: LOW | MEDIUM | HIGH
Regression surface:
Authorized files:
Minimal change:
Do not touch:
Acceptance criteria:
Verification:
Reviewer required: YES | NO
Escalation reason: none | ...
```

### EXPERT IMPLEMENTATION CONTRACT

Ver `agents/expert.md`.

### IMPLEMENTATION REPORT

```text
IMPLEMENTATION REPORT
Status: DONE | BLOCKED | FAILED
Changed files:
Change summary:
Verification:
Worktree preserved: YES | NO | N/A
Contract deviations: none | ...
Remaining risk: none | ...
```

### QA REPORT

```text
QA REPORT
Verdict: PASS | FAIL | BLOCKED
Write set: OK | VIOLATION
Criteria:
Commands:
UI evidence: N/A | details
Failures: none | ...
Next action: DONE | FIX_REQUIRED | BLOCKED_SETUP
```

### REVIEW REPORT

```text
REVIEW REPORT
Verdict: APPROVE | BLOCK | BLOCKED_EVIDENCE
Contract coverage: COMPLETE | INCOMPLETE
Findings:
QA evidence accepted: YES | NO + reason
Next action: DONE | IMPLEMENTER_FIX | NEED_EVIDENCE
```

## Cuándo se puede saltar fases

- Si el usuario ya entrega diagnóstico + write set + acceptance + verify → **no Locator ni Diagnostic**.
- Si el cambio es mecánico y el target es conocido → **no Locator ni Diagnostic ni Reviewer**.
- Si solo falta localizar un cambio mecánico → **Locator sí; Diagnostic no**.
- Si la causa es incierta → Diagnostic obligatorio.
- Expert solo por `ESCALATE_TO_EXPERT`.
- Reviewer obligatorio en NORMAL/COMPLEX y cambios no triviales PRE_DIAGNOSED.

## QA proporcional

QA no ejecuta una matriz gigante por defecto.

- No visual: write set + criterios + comandos especificados.
- Visual: viewport/screenshot/interacción cuando corresponda.
- SSR/datos/fallbacks: solo modos enumerados por el contrato.
- Build completo solo cuando el contrato lo requiere o el cambio realmente lo justifica.

## Control de ciclos

1. Un solo agente edita a la vez.
2. QA/Reviewer son read-only.
3. Máximo 2 ciclos `implementer → qa/reviewer`.
4. El segundo bloqueo escala al usuario con evidencia.
5. Retry sin evidencia nueva: prohibido.

## Eficiencia de contexto

- No repetir el prompt entero en cada handoff.
- Locator: máximo 200 palabras.
- Diagnostic: ~350 palabras salvo necesidad real.
- QA: ~300 palabras.
- Reviewer: máximo 3 findings.
- Pasar paths/símbolos/criterios, no grandes dumps de código.
- El reviewer inspecciona diff/targets; no vuelve a investigar el proyecto.

## Git / worktree

- Preservar cambios preexistentes cuando el usuario lo pida o el worktree esté sucio.
- Sin commit salvo autorización explícita.
- Sin push salvo orden explícita e inequívoca.
- Nunca force push/reset hard/clean destructivo.

**Version**: 4.0
**Effective**: 2026-09-03
