# Bibi Saint — Harness local

Objetivo: mantener una capa local simple, sin contratos de pipeline legacy.

## Rol del directorio

- Este repo aporta skills y documentacion de dominio.
- El runtime de agentes/perfiles/modelos se resuelve en la capa global.

## Fases SDD de Gentle AI

Flujo operativo: `preflight/init → explore → research` (opcional) `→ propose → spec + design → tasks → apply → verify → archive`.

- `preflight/init`: prepara el contexto e inicializa el cambio.
- `explore`: aclara el problema, el alcance y las alternativas.
- `research` (opcional): reúne evidencia técnica o externa cuando hace falta.
- `propose`: formaliza la intención, el alcance y el enfoque.
- `spec + design`: define requisitos verificables y la solución técnica.
- `tasks`: descompone la solución en tareas ejecutables.
- `apply`: implementa las tareas aprobadas.
- `verify`: comprueba la implementación contra requisitos y evidencia.
- `archive`: sincroniza y cierra el cambio completado.

El dispatcher/status nativo es la autoridad del estado y del artifact store; los agentes no deben saltarse fases ni inferir el estado a partir de la prosa.

## Regla de ejecucion

1. Hacer el cambio minimo necesario.
2. Verificar con comandos proporcionales al riesgo.
3. Preservar worktree sucio no relacionado.
4. No usar operaciones destructivas de git.

## Control de seguridad y git

- Sin secretos en commits ni logs.
- `git commit` y `git push` solo por pedido explicito del usuario.
- No tocar configuraciones globales de OpenCode/Gentle desde esta capa.

## Verificacion sugerida

- Cambios de docs/config local: verificar consistencia de rutas y referencias.
- Cambios de app: ejecutar tests/comandos relevantes en `code/`.
- Cambios de proveedores o DB: aplicar checklist de skills `bibi-providers` y `bibi-database`.
