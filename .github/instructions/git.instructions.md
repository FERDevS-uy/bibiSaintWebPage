# Bibi Saint — Instrucciones de Git (GitHub Copilot)

## Reglas críticas

1. **Push**: nunca ejecutar `git push` sin orden explícita e inequívoca del usuario.
2. **Commit**: solo hacer `git commit` cuando el usuario lo solicita explícitamente. Nunca por iniciativa propia.
3. Antes de commitear:
   - Revisar `git status` y `git diff`.
   - Stagear solo archivos intencionales.
   - Verificar que no se incluyan secretos (`.env`, claves, tokens).
4. No usar `--force`, no modificar config de git, no saltar hooks.
5. Mensajes de commit en Conventional Commits (ej. `feat(x):`, `fix(x):`, `chore(x):`).

## Flujo

1. `git status` → confirmar qué cambió.
2. `git diff` → revisar contenido.
3. Stagear archivos específicos con `git add <archivo>`.
4. `git commit -m "<mensaje>"` → solo tras solicitud explícita.
5. `git push` → solo tras orden explícita.

## Separación

Mantener cambios de features distintas en commits separados (ej. no mezclar Nuvex con reorganización de agentes).