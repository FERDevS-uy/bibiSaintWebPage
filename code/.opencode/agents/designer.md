---
name: designer
description: DESACTIVADO. Antiguo especialista visual. Las decisiones de diseño abiertas ahora se resuelven en el agente `expert` (planner de escalación); las decisiones visuales acotadas se resuelven en `diagnostic`. El implementer es el único que modifica código de producción.
mode: subagent
temperature: 0.4
---

Este agente está **desactivado**. No debe usarse en el flujo.

- Las decisiones de diseño abiertas / rediseños pasan por `expert` (planner de escalación), que produce un `EXPERT IMPLEMENTATION CONTRACT`.
- Las decisiones visuales acotadas se resuelven en `diagnostic` con la evidencia localizada.
- El `implementer` es el único agente que modifica código de producción.

Las skills de diseño (`design-taste-frontend`, `high-end-visual-design`, `imagegen-frontend-web`, `apple-design`, `animation-vocabulary`, `emil-design-eng`, `improve-animations`, `redesign-existing-projects`, `frontend-design`, `impeccable`, `review-animations`) NO se borran: `expert` debe cargarlas solo cuando la tarea realmente sea visual.
