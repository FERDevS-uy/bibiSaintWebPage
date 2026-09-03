# Model Policy — Bibi Saint v4

Los modelos viven solo en `code/.opencode/opencode.json`.

## Asignación free-first

| Rol | Modelo | Motivo |
|---|---|---|
| `coordinator` | `opencode/nemotron-3.5-lightning-free` | routing corto y rápido |
| `locator` | `opencode/nemotron-3.5-lightning-free` | búsquedas/localización |
| `diagnostic` | `opencode/nemotron-3-ultra-free` | razonamiento gratuito más fuerte |
| `implementer` | `opencode/ling-3.0-flash-fin-free` | ejecución mecánica/código |
| `qa` | `opencode/nemotron-3.5-lightning-free` | verificación barata |
| `reviewer` | `openai/gpt-5.6-luna#max` | firma semántica final |
| `expert` | `openai/gpt-5.6-luna#max` | escalación difícil solamente |
| `dba` | `opencode/nemotron-3-ultra-free` | análisis DB excepcional |
| `security` | `openai/gpt-5.6-luna#max` | riesgo alto |
| `provider-scraper` | `opencode/nemotron-3-ultra-free` | parsing/transporte no rutinario |

## Principio de costo

```text
FREE worker → FREE QA → Luna reviewer solo cuando importa
```

- FAST: 0 llamadas a Luna por defecto.
- PRE_DIAGNOSED/NORMAL: 1 llamada corta a Luna como reviewer.
- COMPLEX: Luna puede entrar como expert y luego reviewer; esta ruta debe ser rara.
- GPT-5.5 queda fuera del flujo normal para proteger cuota.

## Reviewer discipline

Luna no recibe el repo entero. Recibe contrato + implementation report + QA report y solo inspecciona diff/targets si necesita validar algo.

No usar reviewer para copy/typo/CSS mecánico salvo pedido explícito o riesgo real.

## Nota sobre modelos Free

Los modelos gratuitos de OpenCode Zen son promocionales y su disponibilidad puede cambiar. Además, algunos endpoints Free permiten uso de prompts/completions para mejora del modelo o logging de prueba. No enviar secretos, tokens, `.env`, datos personales ni material confidencial sin revisar la política vigente.

## Verificación periódica

```sh
cd code
opencode models opencode --refresh
opencode debug agents
```

Confirmar que los IDs siguen disponibles y que cada agente resuelve al modelo esperado.
