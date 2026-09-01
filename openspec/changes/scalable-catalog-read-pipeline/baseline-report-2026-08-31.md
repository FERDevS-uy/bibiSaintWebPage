# Baseline 1.1 - Catalog Routes (2026-08-31)

## Objetivo

Capturar baseline de rutas clave para la migracion `scalable-catalog-read-pipeline` con:

- latencia `p50/p95/p99`
- tamano de payload
- estado de cache observado por headers (`X-Edge-Cache` / `CF-Cache-Status`)

## Comandos ejecutados

```bash
node scripts/baseline-routes.mjs --base=http://localhost:4321 --samples=12 --out=../openspec/changes/scalable-catalog-read-pipeline/baseline-localhost-4321.json
node scripts/baseline-routes.mjs --base=https://bibisaintwebpage.franccesco-giordano11.workers.dev --samples=8 --out=../openspec/changes/scalable-catalog-read-pipeline/baseline-workers-prod.json
```

## Resultado - Localhost (12 muestras)

| Ruta | Status | Bytes avg | p50 (ms) | p95 (ms) | p99 (ms) | Cache hit ratio |
|---|---:|---:|---:|---:|---:|---:|
| / | 200 | 314376 | 10.6 | 2198.2 | 2198.2 | 0.0% |
| /page/2 | 200 | 230377 | 844.9 | 942.5 | 942.5 | 0.0% |
| /categories/Cama | 200 | 246191 | 841.0 | 983.2 | 983.2 | 0.0% |
| /categories/Tecno | 200 | 242203 | 973.6 | 1937.4 | 1937.4 | 0.0% |
| /ofertas | 200 | 235890 | 916.3 | 1022.4 | 1022.4 | 0.0% |
| /api/search-products | 200 | 46 | 275.1 | 401.2 | 401.2 | 0.0% |

Cache local agregado: `hit=0, miss=0, bypass=12, other=60`.

## Resultado - Workers prod (8 muestras)

| Ruta | Status | Bytes avg | p50 (ms) | p95 (ms) | p99 (ms) | Cache hit ratio |
|---|---:|---:|---:|---:|---:|---:|
| / | 200 | 141056 | 58.5 | 1662.6 | 1662.6 | 0.0% |
| /page/2 | 200 | 113426 | 55.8 | 70.7 | 70.7 | 0.0% |
| /categories/Cama | 200 | 118100 | 61.0 | 78.5 | 78.5 | 0.0% |
| /categories/Tecno | 200 | 115227 | 58.7 | 66.1 | 66.1 | 0.0% |
| /ofertas | 200 | 113668 | 60.4 | 80.2 | 80.2 | 0.0% |
| /api/search-products | 200 | 984647 | 63.0 | 74.7 | 74.7 | 0.0% |

Cache workers agregado: `hit=0, miss=0, bypass=0, other=48`.

## Hallazgos rapidos

1. Hay outliers fuertes en `/` y `/categories/Tecno` (p95/p99) tanto local como prod.
2. `api/search-products` en prod devuelve payload alto (~984 KB) para la muestra usada.
3. No se detectaron estados `HIT`/`MISS` por headers observables en esta corrida.

## Estado frente a tarea 1.1

Completado en esta evidencia:

- Latencias p50/p95/p99 por ruta
- Tamano de payload por ruta
- Cache hit ratio observado por header

Pendiente para cerrar 1.1:

- CPU y memoria del Worker por ruta (captura desde Cloudflare Logs/Analytics)
- Conteo de consultas SQL por ruta y cache hit ratio edge/origen con telemetria consolidada

## Artefactos

- `openspec/changes/scalable-catalog-read-pipeline/baseline-localhost-4321.json`
- `openspec/changes/scalable-catalog-read-pipeline/baseline-workers-prod.json`
- `openspec/changes/scalable-catalog-read-pipeline/baseline-report-2026-08-31.md`

## Evaluación de diseño pendiente (apply 2026-09-01)

- El HTML SSR inicial no está envuelto por Cache API/edge cache; la caché implementada cubre endpoints públicos JSON.
- En un cache miss de API se resuelve la versión y se ejecuta la lectura paginada; las páginas que incluyen total también ejecutan `COUNT exact` (`runCatalogQuery`, `includeTotal !== false`).
- Estos costos deben medirse y compararse con umbrales acordados antes de activar progresivamente `CATALOG_READ_MODEL` o retirar la ruta legacy.

## Evidencia adicional - apply 2026-09-01

La captura objetiva adicional está en `evidence-apply-2026-09-01.md`. Incluye:

- `pnpm test:unit`: 120/120.
- `pnpm test:integration`: 1/1 tras `supabase db reset --local`, validando normalización SQL materializada y taxonomía con conteo cero.
- `wrangler tail bibisaintwebpage --format json --status ok`: 7 invocaciones controladas con CPU/wall del Worker. Cloudflare no expuso RSS/memoria en esos eventos.
- SQL remoto de solo lectura: 918 `catalog_products`, 72 filas de categorías, 8 filas de taxonomía y versión 2.
- Logs Supabase 21:13:30–21:15:00 UTC: 5 llamadas a `/rest/v1/products`, promedio 319.2 ms y p95 726.4 ms; no hay correlación con rutas Worker.

La evidencia no permite cerrar 1.1, 6.1, 6.3 ni 6.5: faltan RSS Worker y conteo SQL correlacionado por ruta; el RED histórico no es recuperable; no existe carga productiva de 100k; y no hay autorización, umbrales ni rollback aprobado para activar la bandera. El endpoint read-model `/api/catalog/products?limit=12` respondió 404 en el Worker desplegado durante la captura.
