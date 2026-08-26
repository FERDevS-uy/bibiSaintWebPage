# Model Policy — Bibi Saint

Política de asignación de modelos para el marco agéntico de OpenCode. El modelo vive en el frontmatter de cada agente (`code/.opencode/agents/*.md`). Este documento es la fuente de la decisión y referencia de cuotas.

## Principio

Optimizar tokens: **modelos de razonamiento** para tareas de alto valor, **modelos económicos de alta cuota** para implementación/trabajo repetitivo. Nunca gastar cuotas bajas en tareas rutinarias.

## Asignación actual

| Agente | Modelo | Racional |
|---|---|---|
| `coordinator` | `opencode-go/gpt-5.6-luna` | Razonamiento general, routing, integración. Cuota alta (2K) con buena capacidad. |
| `designer` | `opencode-go/mimo-v2.5` | Diseño/UX. Alta cuota (30K), suficiente para iteración visual. |
| `implementer` | `opencode-go/deepseek-v4-flash` | Implementación cotidiana. Alta cuota (7.6K), buena velocidad. |
| `qa` | `opencode-go/minimax-m3` | Tests y validación repetitiva. Cuota media-alta (3.2K). |
| `dba` | `opencode-go/qwen3.7-plus` | SQL, migraciones, RLS. Cuota media (4.3K), buen criterio técnico. |
| `security` | `opencode-go/qwen3.8-max` | Auditoría de alto riesgo. Cuota baja (160) — usar solo en auditorías, no en trabajo rutinario. |
| `provider-scraper` | `opencode-go/glm-5.3-flash` | Scrapers/parsing. Cuota 3.1K, consumo 2x (asumir ~1.5K usos efectivos). |

## Reservados (escalaciones puntuales)

| Modelo | Cuota | Cuándo usarlo |
|---|---|---|
| `opencode-go/kimi-k3` | 110 | Análisis excepcional, decisiones difíciles, revisión arquitectónica. **Nunca para commits ni implementación rutinaria.** |
| `opencode-go/grok-4.6` | 169 | Alternativa de escalamiento para razonamiento complejo. |
| `opencode-go/qwen3.8-max` | 160 | Security y arquitectura de alto riesgo. |

## Evitar para trabajo rutinario

- `opencode-go/hy3` — consumo 8x (ineficiente).
- `opencode-go/muse-spark-1.2-contributor` — disponibilidad regional limitada.
- Modelos de cuota baja (K3, Grok, Qwen Max) — reservar para escalación.

## Reglas

1. **Commit**: el `implementer` puede hacer `git commit` SOLO cuando el usuario lo solicita explícitamente. El modelo elegido no habilita commits — eso lo controla `permission.bash`.
2. **Push**: ningún agente hace `git push` sin orden explícita e inequívoca del usuario.
3. Si una tarea de implementación falla reiteradamente con el modelo económico, el `coordinator` puede escalar puntualmente a `gpt-5.6-luna` o `qwen3.7-plus`.
4. Revisar esta política cuando cambien las cuotas de OpenCode Go (ejecutar `opencode models`).

## Verificación

```sh
cd code
opencode models   # lista modelos disponibles con sus límites
```