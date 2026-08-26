# Auto-Save & Context Preservation Rules

## Objetivo
Guardar lo **relevante** para no perder contexto entre sesiones. Los checkpoints son opcionales; el handoff entre agentes viaja en el prompt de `task`, no en estos archivos.

## Cuándo guardar

- Fin de sesión inminente.
- Decisión arquitectónica importante.
- Cambio de proyecto/tarea.
- Investigación completada.
- Bug reproducido o resuelto.

## Qué guardar

### En `code/.opencode/autosave/*.md` (breve)

- Decisiones clave (2-3 líneas).
- URLs/paths importantes.
- Estados de pendientes.
- Próximos pasos.

**Límite**: 3-5 bullets por sección, máx 200 palabras.

### En `resu.md` (extenso)

- Investigaciones profundas.
- Reportes de QA / evidencia técnica.
- Análisis de código > 100 líneas.
- Múltiples opciones evaluadas.

### Descartar

- Saludos, confirmaciones, explicaciones repetidas.

## Estructura recomendada de `resu.md`

```markdown
# Resumen Session [Fecha]

## Sección: <tema>
**Decisión**: ...
**Evidencia**: ...
**Próximas acciones**:
1. ...
```

## Integración con el pipeline

- Cada agente entrega su handoff estructurado (LOCATOR/DIAGNOSTIC/CONTRACT/QA) en el prompt de `task`.
- `resu.md` puede enlazar el output de especialistas para continuar en otra sesión, pero nunca reemplaza un contrato.
- No usar archivos compartidos como canal de coordinación implícito.

## Reglas de limpieza

- Mergear checkpoints viejos → `resu.md`.
- Archivar completados a `autosave/archive/`.
- Nunca borrar: decisiones críticas, bug reports, patrones aprendidos.

**Version**: 2.0
**Effective**: 2026-08-26