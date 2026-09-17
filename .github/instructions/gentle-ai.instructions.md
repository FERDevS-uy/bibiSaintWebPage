---
applyTo: "**"
excludeAgent: "code-review"
---

# Gentle AI — configuración local de Bibi Saint

Estas instrucciones aplican únicamente cuando Copilot trabaja en este repositorio. No instales, habilites, actualices ni configures Gentle AI de forma global para Copilot, el usuario o la máquina.

## Cuándo usar Gentle AI

- La exploración, explicación, auditoría y planificación son de solo lectura, salvo que el usuario autorice explícitamente un cambio.
- Para un cambio autorizado, elegí la ruta mínima: cambio directo y acotado cuando está claro; trabajo delegado para investigación amplia o cambios no triviales; SDD solo si el usuario lo pide explícitamente o acepta la propuesta.
- No crees artefactos SDD, intentos sintéticos ni prompts de fase para cambios directos. Los artefactos de Gentle AI se guardan bajo `sdd/` cuando el flujo SDD fue autorizado.

## Review mode

- Receipt-driven development es opt-in y está desactivado por defecto. Consultá o cambiá ese modo solo si el usuario lo pide explícitamente mediante `gentle-ai review mode status`, `enable` o `disable`.
- Si está desactivado, no inicies revisiones, no lo reactives y reportá la entrega como `disabled/unmanaged`.

## Límites operativos

- No ejecutés `gentle-ai install` ni ningún mecanismo de instalación global. Si el comando no existe en este repositorio, informalo y seguí sin Gentle AI.
- No hagas deploys, transferencias de archivos, conexiones remotas ni uses sesiones o credenciales existentes sin autorización explícita del usuario para el destino, la operación y la sesión/credencial.
- Nunca crees commits ni pushes sin una orden explícita. Antes de un commit solicitado, revisá `git status` y `git diff`, y stageá únicamente los archivos intencionales.
