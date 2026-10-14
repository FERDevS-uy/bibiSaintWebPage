# Martina: aplicar campañas próximas

## Objetivo
Permitir aplicar una campaña Martina hasta 7 días antes de `validFrom`, siempre que el preview/campaña siga siendo válido; mantener el rechazo de campañas fuera de esa ventana o ya vencidas.

## Tareas
- [ ] Cubrir con pruebas los límites: ventana permitida, demasiado anticipada, inicio activo y vencimiento.
- [ ] Ajustar la validación compartida preview/apply y mensajes para distinguir campaña futura permitida de expirada.
- [ ] Ejecutar pruebas enfocadas de Martina y revisar diff/estado.

## Decisión de producto
Ventana previa máxima de 7 días. El 13 de octubre puede aplicar la campaña que inicia el 17 de octubre (4 días después), si el plan contiene cambios aplicables.

## Evidencia de cierre
- RED observado; focused GREEN: `node --experimental-strip-types --test tests/martina-sync.test.ts` (82/82) y campaña discovery (2/2), reportado por writer.
- Verificación independiente: sync suite 82/82; confirmado gate antes de preparar plan/escrituras.
- Revisión de diff: `git diff --check` sin errores.
- Native review preflight: blocked pending explicit intended-untracked selection; unrelated working-tree/untracked content was not included.
- Commit: `c687bc3` (`fix(martina): allow applying upcoming campaigns`).
