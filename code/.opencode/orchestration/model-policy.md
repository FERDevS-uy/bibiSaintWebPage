# Model Policy — Bibi Saint

Los modelos viven **solo** en `code/.opencode/opencode.json` (campo `agent.<name>.model`).
Los archivos de agentes (`code/.opencode/agents/*.md`) NO declaran modelo: rol y modelo están desacoplados.
Para cambiar un modelo, se edita `opencode.json`; no hace falta tocar el harness.

## Asignación

| Rol | Modelo | Lógica de costo |
|---|---|---|
| `coordinator` | `opencode-go/glm-5.3-flash` | barato: solo rutea |
| `locator` | `opencode-go/glm-5.3-flash` | barato: solo ubica |
| `diagnostic` | `opencode-go/deepseek-v4-flash` | intermedio: razona sobre evidencia localizada |
| `expert` | `opencode-go/gpt-5.6-luna` | caro: SOLO escalación |
| `implementer` | `opencode-go/deepseek-v4-flash` | intermedio: ejecuta contrato |
| `qa` | `opencode-go/minimax-m3` | intermedio: verifica con evidencia |
| `dba` | `opencode-go/qwen3.7-plus` | intermedio: rama excepcional DB |
| `security` | `opencode-go/qwen3.8-max` | caro (cuota baja): solo auditoría read-only |
| `provider-scraper` | `opencode-go/glm-5.3-flash` | barato: rama excepcional |

## Principio de costo

- **Barato localiza** → **intermedio diagnostica** → **caro SOLO cuando aporta valor** → **intermedio ejecuta** → **intermedio verifica**.
- El modelo caro (`gpt-5.6-luna`) NO se usa para localizar archivos, leer grandes cantidades de código ni exploración básica. Solo razona cuando `diagnostic` decide `ESCALATE_TO_EXPERT`.
- Tarea simple: `Locator → Diagnostic → Implementer → QA` (sin Expert).
- Tarea compleja: `Locator → Diagnostic → Expert → Implementer → QA`.
- No usar Expert por defecto.

## Reglas

1. `git commit`: solo con autorización explícita del usuario (controlado por `permission.bash`).
2. `git push`: ningún agente sin orden explícita e inequívoca del usuario.
3. Si una implementación falla 2 veces con el modelo económico, el coordinator escala al usuario (no insistir).
4. Revisar esta política cuando cambien las cuotas de OpenCode Go (`opencode models`).

## Verificación

```sh
cd code
opencode models   # lista modelos disponibles con sus límites
```