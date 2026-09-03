# System Integration Guide — v4

Sistema: routing adaptativo free-first + editor único + QA barato + reviewer senior selectivo.

## Arquitectura

```text
                         ┌──────── FAST_KNOWN ──────── implementer(FREE) → qa(FREE)
                         │
USER → coordinator(FREE) ├──────── FAST_LOCATE ─ locator(FREE) → implementer(FREE) → qa(FREE)
                         │
                         ├──────── PRE_DIAGNOSED ─ implementer(FREE) → qa(FREE) → reviewer(Luna)
                         │
                         ├──────── NORMAL ─ locator(FREE) → diagnostic(FREE) → implementer(FREE) → qa(FREE) → reviewer(Luna)
                         │
                         └──────── COMPLEX ─ locator(FREE) → diagnostic(FREE) → expert(Luna) → implementer(FREE) → qa(FREE) → reviewer(Luna)
```

## Qué evita v4

- locator obligatorio para toda petición;
- rediagnosticar contratos ya entregados;
- GPT caro ejecutando grep/lecturas mecánicas;
- QA de 25 pasos para cambios triviales;
- reviewer rehaciendo la implementación.

## Responsabilidades

| Fase | Agente | Salida |
|---|---|---|
| ROUTE | `coordinator` | ruta mínima |
| LOCATE | `locator` | targets compactos |
| DIAGNOSE | `diagnostic` | causa + contrato |
| PLAN | `expert` | contrato senior solo si escala |
| IMPLEMENT | `implementer` | cambio + implementation report |
| VERIFY | `qa` | evidencia mecánica |
| REVIEW | `reviewer` | APPROVE/BLOCK semántico |

## OpenSpec

OpenSpec puede entregar suficiente especificación para tratar una tarea como PRE_DIAGNOSED si sus artefactos incluyen targets/write set, cambio exacto, aceptación y verificación. Si no, usa NORMAL/COMPLEX según incertidumbre.

## Git

- solo implementer puede editar producción;
- commit/push requieren autorización explícita;
- operaciones destructivas de worktree están denegadas;
- reviewer/qa son read-only.

## Contexto

Cada subagente corre en sesión aislada, pero los handoffs son deliberadamente compactos. No copiar el prompt completo: pasar únicamente objetivo, restricciones, targets y evidencia necesaria.
