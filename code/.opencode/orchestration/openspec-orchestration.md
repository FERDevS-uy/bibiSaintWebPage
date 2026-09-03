# OpenSpec + Pipeline Agéntico v4

## Objetivo

OpenSpec planifica; el harness ejecuta usando la ruta mínima suficiente.

## Flujo

```text
openspec-propose
      ↓
artefactos (proposal/specs/design/tasks)
      ↓
openspec-apply
      ↓
coordinator clasifica:
  PRE_DIAGNOSED si los artefactos ya son ejecutables
  NORMAL/COMPLEX si aún falta diagnóstico
      ↓
implementer / pipeline necesario
      ↓
qa [→ reviewer cuando corresponda]
      ↓
openspec-archive
```

## Routing

| Estado del cambio | Ruta |
|---|---|
| Spec ejecutable, bajo riesgo | `implementer → qa` |
| Spec ejecutable, no trivial | `implementer → qa → reviewer` |
| Falta ubicar targets | `locator → implementer → qa` si el cambio es mecánico |
| Causa/solución incierta | `locator → diagnostic → implementer → qa → reviewer` |
| Alto riesgo/arquitectura | `locator → diagnostic → expert → implementer → qa → reviewer` |
| DB/RLS complejo | `locator → diagnostic → dba → implementer → qa → reviewer` |
| Scraper/transporte | `locator → diagnostic → provider-scraper → implementer → qa → reviewer` |

## Reglas

1. No ejecutar locator/diagnostic si OpenSpec ya proporciona un contrato suficiente.
2. Expert solo por escalación real.
3. Escritura secuencial.
4. Máximo 2 ciclos de corrección.
5. Handoffs compactos; artefactos OpenSpec son referencia, no excusa para repetir todo su contenido en cada task.
