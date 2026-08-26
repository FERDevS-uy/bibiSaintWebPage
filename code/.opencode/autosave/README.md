# 📌 Auto-Save & Context Preservation

Los checkpoints de `code/.opencode/autosave/` son **opcionales y complementarios**. El canal real de coordinación entre agentes es el contrato estructurado que viaja en el prompt de `task` (ver `../instructions/harness.md`).

## Qué guardar

| Tipo | Dónde | Ejemplo |
|---|---|---|
| Decisión rápida | `autosave/*.md` | "El fix va en `RelatedProductCarousel.astro`" |
| Análisis/evidencia extensa | `autosave/resu.md` | Reportes de QA, investigaciones, decisiones |
| Cross-session | `autosave/resu.md` | Estado para la próxima sesión |

`resu.md` nunca sustituye un contrato de handoff: guarda contexto, no es el canal de coordinación.

## Cuándo guardar

- Fin de sesión inminente.
- Decisión arquitectónica importante.
- Cambio de proyecto/tarea.
- Bug reproducido o resuelto.
- Investigación completada.

No es un requisito rígido "cada 5-10 mensajes": guardá cuando haya algo relevante, no por inercia.

## Reglas de limpieza

- Archivar secciones completadas; mantener `resu.md` acotado.
- Nunca borrar: decisiones críticas, bug reports, patrones aprendidos.

## Referencias

- `../instructions/harness.md` — contratos y presupuestos del pipeline.
- `../orchestration/routing.yaml` — rutas del pipeline.