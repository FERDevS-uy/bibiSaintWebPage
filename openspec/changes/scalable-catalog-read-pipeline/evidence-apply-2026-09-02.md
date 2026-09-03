# Evidence Apply 2026-09-02

## Alcance y límites

- Change: `scalable-catalog-read-pipeline`
- Tareas evaluadas: `1.1`, `6.1`, `6.3`, `6.5`
- Modo: Strict TDD; no hubo cambios de producción.
- Producción: no se mutó configuración, secretos, flags ni datos.
- Evidencia externa: el entorno usado fue únicamente el Worker dev `https://bibisaintwebpage-dev.franccesco-giordano11.workers.dev/`; no se presenta como evidencia productiva.
- Settlement: no se ejecutó ni se asentó el intento nativo; el token y la obligación de remediación quedan para el orquestador.

## Tests

```text
pnpm test:unit
```

Resultado: exit 0, 120/120 tests passed, 0 failed.

## Baseline del Worker dev

```text
pnpm exec node scripts/baseline-routes.mjs --base=https://bibisaintwebpage-dev.franccesco-giordano11.workers.dev --samples=5 --out=.opencode/autosave/baseline-dev-2026-09-02.json
```

Resultado: las seis rutas respondieron HTTP 200. El reporte contiene payload, p50/p95/p99 y estado de caché. `/api/search-products` registró 3 HIT y 2 MISS; las rutas SSR no exponen un estado Cache API en sus respuestas.

| Ruta | Payload promedio | p50 ms | p95 ms | Cache hit ratio |
|---|---:|---:|---:|---:|
| `/` | 158133 B | 197.8 | 1246.7 | 0.0% |
| `/page/2` | 111778 B | 192.2 | 196.2 | 0.0% |
| `/categories/Cama` | 115524 B | 197.2 | 247.3 | 0.0% |
| `/categories/Tecno` | 98888 B | 190.1 | 197.4 | 0.0% |
| `/ofertas` | 112345 B | 189.3 | 196.0 | 0.0% |
| `/api/search-products` | 46 B | 206.6 | 1120.1 | 60.0% |

Esto aporta payload/latencia/cache del entorno dev, pero no aporta CPU, RSS ni conteo SQL correlacionado por ruta. Por eso `1.1` permanece abierta.

## Carga local de 100.000 filas

```text
pnpm run test:load:local -- --base=http://127.0.0.1:4321 --fixtures=100000 --requests=200 --concurrency=8 --page-size=48 --out=.opencode/autosave/catalog-load-local-apply-2026-09-02.json
```

Resultado: el harness insertó y limpió 100.000 fixtures en el Supabase local, pero el run quedó bloqueado por el rate limiter local: 179/200 requests devolvieron 200 y 21/200 devolvieron 429. No hubo timeouts. Los p95 locales fueron 622.337 ms (productos por nombre), 672.897 ms (productos por precio), 585.465 ms (categorías) y 574.449 ms (búsqueda). El CPU/RSS medido es del proceso Node local, no del Worker: 593.04 ms CPU, RSS 40,370,176 → 65,372,160 bytes.

La carga de 100.000 filas quedó objetivamente ejecutada, pero no es un resultado aprobatorio de límites por los 429 y no prueba CPU/RSS del Worker. `6.3` permanece abierta.

## Disposición de tareas

- `1.1`: abierta — falta memoria/RSS del Worker y conteo SQL correlacionado por ruta; el baseline dev no reemplaza esas métricas.
- `6.1`: abierta — la integración local actual es verde, pero no existe evidencia histórica RED que pruebe el orden test-first.
- `6.3`: abierta — el fixture de 100.000 filas se ejecutó localmente, pero el run tuvo 21 respuestas 429 y no mide límites del Worker.
- `6.5`: abierta — no se activó la bandera ni se retiró legacy; faltan autorización explícita para producción, umbrales acordados y ejercicio de rollback. El entorno dev no autoriza ese cambio.

## Strict TDD — TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1.1 | `tests/baseline-percentiles.test.ts` | Unit + evidence | ✅ 120/120 | N/A: medición | ✅ script ejecutado contra dev | ✅ 6 rutas | N/A: evidencia |
| 6.1 | `tests/integration/catalog-integration.test.ts` | Integration | ✅ 120/120 | ❌ histórica no recuperable | ✅ 1/1 local previamente verificado | ✅ escenarios SQL existentes | N/A |
| 6.3 | `scripts/catalog-load-local.mjs` | Local load | ✅ 120/120 | N/A: carga/evidencia | ⚠️ 179/200; 21 rate-limited | ✅ cuatro rutas y 100k fixtures | N/A |
| 6.5 | N/A | Operational | ✅ 120/120 | N/A: requiere autorización | N/A: no se activó | N/A | N/A |

## Work Unit Evidence

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm test:unit` → exit 0; 120/120 passed, 0 failed |
| Runtime harness command/scenario and exact result | Dev baseline: 30 requests, 30 HTTP 200; local 100k load: 200 requests, 179 HTTP 200 and 21 HTTP 429 |
| Rollback boundary | Revert only this evidence artifact and the two generated baseline reports; no production behavior or runtime state is part of the change |

## Corrective retry evidence — 2026-09-03 UTC

### Published dev Worker recheck

The retry used only the published dev URL and did not change deployment, flags, secrets, data, or runtime state:

```text
pnpm exec node scripts/baseline-routes.mjs --base=https://bibisaintwebpage-dev.franccesco-giordano11.workers.dev --samples=10 --out=/var/folders/97/qsfjwqc17ql07t5vm56jgmk00000gq/T/opencode/catalog-baseline-retry-2026-09-02.json
```

Result: 60/60 requests returned HTTP 200. The six routes had the following observed values:

| Route | Payload average | p50 ms | p95 ms | p99 ms | Cache observation |
|---|---:|---:|---:|---:|---|
| `/` | 158,133 B | 73.8 | 2,893.2 | 2,893.2 | 0/10 exposed cache state |
| `/page/2` | 111,778 B | 65.1 | 84.2 | 84.2 | 0/10 exposed cache state |
| `/categories/Cama` | 115,524 B | 77.1 | 250.5 | 250.5 | 0/10 exposed cache state |
| `/categories/Tecno` | 98,888 B | 63.1 | 78.7 | 78.7 | 0/10 exposed cache state |
| `/ofertas` | 112,345 B | 67.8 | 83.1 | 83.1 | 0/10 exposed cache state |
| `/api/search-products` | 46 B | 82.2 | 398.0 | 398.0 | 9 HIT / 1 MISS (90%) |

Direct read-only HTTP checks against the same dev Worker returned:

```text
/api/catalog/products?limit=12       HTTP 200; X-Edge-Cache: MISS; Cache-Control: public, max-age=60, s-maxage=120, stale-while-revalidate=300
/api/catalog/categories              HTTP 200; X-Edge-Cache: MISS; Cache-Control: public, max-age=300, s-maxage=600, stale-while-revalidate=1800
/api/catalog/related?productId=1     HTTP 400; content-length: 62 (invalid request contract)
/api/search-products?q=bot            HTTP 200; X-Edge-Cache: MISS; Cache-Control: public, max-age=60, s-maxage=120, stale-while-revalidate=300
```

This is dev evidence only. It does not provide Worker RSS or route-correlated SQL query counts. It also does not authorize production activation.

### Corrective disposition

- `1.1`: remains open. The retry strengthens dev HTTP/payload/cache evidence but still cannot supply actual Worker RSS or correlated SQL counts.
- `6.1`: remains open. No historical RED receipt was recovered; the existing green tests cannot be relabeled as test-first evidence.
- `6.3`: remains open. The prior 100,000-fixture run remains qualified as local-only and had 21/200 HTTP 429 responses. The new dev sample is not a 100,000-fixture load and exposes no Worker CPU/RSS; no approval claim is made.
- `6.5`: remains open. The dev endpoints are reachable, but there is no explicit production rollout authorization, agreed thresholds, rollback proof, or live production read-model confirmation. No activation or legacy removal was performed.

### Retry verification

```text
pnpm test:unit
```

Result: exit 0; 120/120 passed, 0 failed.

```text
pnpm build
```

Result: exit 0; Astro SSR/Cloudflare build completed. Existing non-blocking warnings remained for prerendered `Astro.request.headers`, externalized Node built-ins, and a dynamic/static import split.

No integration reset or load harness was rerun in this corrective retry because the requested safety boundary prohibits runtime reset, and repeating the prior local load would not resolve the Worker RSS, historical RED, or production authorization blockers.

## Task 5.6 implementation evidence — 2026-09-02

La telemetría del camino legacy quedó instrumentada en el límite real de ejecución:

- `legacySidebarCategories` registra una única ejecución con `route=sidebar`, la categoría solicitada y la razón recibida (`supabase-empty`, `supabase-error` o `legacy-path`).
- El fallback de `getHeaderCategories` registra una única ejecución con `route=header`, `category=all` y la razón que explica por qué se abandonó la RPC.
- El contador se incrementa por evento y el log key/value conserva el evento estable `[catalog:legacy-fallback]`.
- La categoría se sanitiza para impedir saltos de línea o control chars; no se incluyen PII, secretos, payloads, IPs, user-agent ni URLs.
- La emisión a `console.warn` es best-effort: si el logger falla, el camino legacy conserva su resultado y no se interrumpe.

### TDD Cycle Evidence — task 5.6

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 5.6 | `tests/legacy-telemetry.test.ts` | Unit | ✅ 120/120 | ✅ logger failure test failed before implementation | ✅ focused 8/8; full 122/122 | ✅ sidebar/header events with distinct categories and reasons | ✅ logger call isolated as best-effort |

### Work Unit Evidence — task 5.6

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `node --experimental-strip-types --test tests/legacy-telemetry.test.ts` → exit 0; 8/8 passed, 0 failed |
| Full test command and exact result | `pnpm test:unit` → exit 0; 122/122 passed, 0 failed |
| Runtime harness command/scenario and exact result | `pnpm build` → exit 0; Astro SSR/Cloudflare build completed. No deploy or runtime mutation performed. |
| Rollback boundary | Revert only `src/server/catalog/legacyTelemetry.ts`, `src/server/sidebarCategories.ts`, `tests/legacy-telemetry.test.ts` and this evidence section; prior catalog changes remain outside this unit |

### Disposición actualizada

- `5.6`: completada y marcada `[x]` en `tasks.md`.
- `1.1`, `6.1`, `6.3` y `6.5`: permanecen abiertas con los mismos blockers documentados arriba; esta tarea no aporta evidencia productiva, histórica RED, límites del Worker ni autorización de rollout.

## Task 6.3 — isolated 100,000-fixture DEV attempt — 2026-09-03 UTC

### Scope and safety gate

- The only HTTP target was `https://bibisaintwebpage-dev.franccesco-giordano11.workers.dev/`.
- No production Worker, deployment, flag, secret, schema, migration, `impladmin` branch, source `products` row, provider table, admin table, taxonomy row, category row, or catalog version row was modified.
- Before the write, the remote schema, constraints, triggers, and RLS policies were inspected. The DEV read path is implemented through `catalog_products` for product pages/search, while categories read `catalog_taxonomy` and `catalog_categories`.
- The isolated fixture namespace was collision-checked across `catalog_products`, `catalog_changes`, `products`, and `catalog_categories`; every result was zero.
- The run prefix was `loadtest:catalog-100k:20260903:6bcbdec7deec496bab38b8a2239d34df`. Every synthetic `catalog_products.product_id` used that prefix. Inserts used explicit columns in 20 bounded SQL batches of 5,000 rows and did not use `ON CONFLICT`, so an unexpected collision could not update an existing row.
- The temporary remote harness was removed after execution. No credentials or full product payloads were emitted.

### Commands and outcomes

```text
pnpm test:unit
```

Result: exit `0`; `122/122` passed, `0` failed.

```text
node --check scripts/catalog-load-dev-63.mjs
```

Result: exit `0`; temporary harness syntax check passed. The harness was deleted after the run.

Read-only schema and safety inspection:

```text
supabase db query --linked --output json --agent=no '<information_schema columns, pg_constraint, pg_trigger, pg_policies queries>'
```

Result: `catalog_products` has primary key `product_id`, search-vector and ingested-at BEFORE triggers only; no trigger exists on `catalog_products` that writes to another table. Public RLS permits SELECT of active rows only. `catalog_categories`, `catalog_taxonomy`, `catalog_changes`, and `catalog_version` were not written.

Read-only DEV preflight:

```text
curl -fsS -D - -o /dev/null 'https://bibisaintwebpage-dev.franccesco-giordano11.workers.dev/api/catalog/products?limit=12&probe=task63-preflight'

Result: all three endpoints returned HTTP `200`; the DEV KV value was `2`; product/category/search cache policy headers were present. This confirmed the endpoint was reachable, but did not yet confirm fixture visibility.

### Exact fixture lifecycle evidence

| Check | Result |
|---|---:|
| Pre-test `catalog_products` rows / active | `918 / 420` |
| Pre-test `catalog_categories` rows | `72` |
| Pre-test `catalog_taxonomy` rows | `8` |
| Pre-test `catalog_changes` rows | `1497` |
| Pre-test `catalog_version` | `1 row; version 3; published_at 2026-09-03T00:21:04.934+00:00` |
| Pre-test source `products` rows / active | `918 / 420` |
| Namespace collision counts (`catalog_products`, `catalog_changes`, `products`, category) | `0, 0, 0, 0` |
| Created `catalog_products` rows | `100000` |
| Created distinct IDs / active IDs | `100000 / 100000` |
| Created ID range | `...:000000` through `...:099999` |
| DEV visibility probe: products endpoint | HTTP `200`, but no returned ID used the run prefix |
| DEV visibility probe: search endpoint | HTTP `200`, but no returned ID used the run prefix |
| Load phase | **Not executed**; the safety gate stopped it because DEV did not return fixtures |
| Cleanup deleted | `100000` exact run-prefix rows |
| Post-test `catalog_products` rows / active | `918 / 420` |
| Post-test `catalog_categories` rows | `72` |
| Post-test `catalog_taxonomy` rows | `8` |
| Post-test `catalog_changes` rows | `1497` |
| Post-test `catalog_version` | `1 row; version 3; published_at 2026-09-03T00:21:04.934+00:00` |
| Post-test source `products` rows / active | `918 / 420` |
| Post-test identity hashes | All pre-test and post-test hashes matched for `catalog_products`, `catalog_categories`, `catalog_taxonomy`, `catalog_changes`, and source `products` |

The cleanup report was written outside the repository at `/var/folders/97/qsfjwqc17ql07t5vm56jgmk00000gq/T/opencode/catalog-load-dev-63-20260903.json`. It records `deleted=100000`, `expected=100000`, and `cleanupVerified=true`.

### Task 6.3 verdict

**BLOCKED — leave task `6.3` open.** The isolated 100,000-row fixture lifecycle was safe and fully restored, but the published DEV Worker returned HTTP `200` without returning either the category-filtered fixtures or the search fixtures. Per the safety contract, no load traffic was sent before confirming that DEV read the fixture population. Consequently there are no valid DEV load p50/p95/p99, payload, status/failure, rate-limit, or Worker CPU/wall results for this run, and no unsupported RSS claim is made. The next attempt requires identifying and authorizing the correct DEV Worker/read-model database alignment without mutating source or production-sensitive tables.

### Work-unit evidence — task 6.3

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm test:unit` → exit `0`; `122/122` passed, `0` failed |
| Runtime harness command/scenario and exact result | Temporary remote fixture harness → `100000` inserted in bounded batches; DEV visibility gate returned HTTP `200` for products/search but `0` fixture IDs; load phase not run |
| Rollback boundary | Delete only `catalog_products.product_id LIKE 'loadtest:catalog-100k:20260903:6bcbdec7deec496bab38b8a2239d34df:%'`; cleanup deleted `100000`; all pre/post counts and identity hashes matched |
| Worker metrics | N/A: load was correctly not started; no CPU/wall or RSS claim |

### Strict TDD cycle evidence — task 6.3

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 6.3 | Temporary `scripts/catalog-load-dev-63.mjs` | Operational load/evidence | ✅ `122/122` | N/A: measurement-only task | ⚠️ fixture lifecycle green; DEV visibility gate blocked | N/A: load was not safely admissible | N/A: temporary harness removed |

## Task 1.1 — baseline dev actualizado — 2026-09-03 UTC

### Alcance y seguridad

- Esta corrida evaluó únicamente la evidencia de baseline de la task `1.1`.
- El único destino externo fue el Worker dev publicado: `https://bibisaintwebpage-dev.franccesco-giordano11.workers.dev/`.
- No se hizo deploy, no se modificaron flags, secretos, KV, datos, migraciones ni el branch `impladmin`.
- El tail se detuvo al terminar la captura. El token nativo no se restableció ni se asentó.
- No se ejecutó un reset de Supabase ni se crearon fixtures.

### Commands and results

```text
pnpm exec wrangler --version
```

Resultado: `4.125.0`.

```text
pnpm exec node scripts/baseline-routes.mjs --base=https://bibisaintwebpage-dev.franccesco-giordano11.workers.dev --samples=10 --out=/var/folders/97/qsfjwqc17ql07t5vm56jgmk00000gq/T/opencode/catalog-baseline-dev-2026-09-02-task-1-1.json
```

Resultado: `60/60` requests HTTP `200`; la salida temporal no se agregó al repositorio. La función existente calcula percentiles nearest-rank; cada ruta recibió 10 muestras.

| Ruta | Payload promedio | p50 ms | p95 ms | p99 ms | Cache observado |
|---|---:|---:|---:|---:|---|
| `/` | 158,133 B | 65.3 | 2,156.2 | 2,156.2 | 0/10 con estado expuesto |
| `/page/2` | 111,778 B | 63.0 | 68.9 | 68.9 | 0/10 con estado expuesto |
| `/categories/Cama` | 115,524 B | 63.1 | 516.8 | 516.8 | 0/10 con estado expuesto |
| `/categories/Tecno` | 98,888 B | 58.5 | 61.5 | 61.5 | 0/10 con estado expuesto |
| `/ofertas` | 112,345 B | 59.6 | 66.1 | 66.1 | 0/10 con estado expuesto |
| `/api/search-products` | 46 B | 65.9 | 350.5 | 350.5 | 9 HIT / 1 MISS (90%) |

The following read-only API probe used five unique `probe` query values per endpoint to force distinct cache keys without changing application data or filters:

| Endpoint | HTTP | Payload | p50 ms | p95 ms | p99 ms | Cache | Catalog version |
|---|---:|---:|---:|---:|---:|---|---:|
| `/api/catalog/products?limit=12` | 200 | 3,236 B | 79.0 | 80.2 | 80.2 | 5 MISS / 0 HIT | 2 |
| `/api/catalog/categories` | 200 | 2,287 B | 85.2 | 105.5 | 105.5 | 5 MISS / 0 HIT | 2 |
| `/api/catalog/related?product_id=mdt-42302` | 200 | 554 B | 81.1 | 86.2 | 86.2 | 5 MISS / 0 HIT | 2 |
| `/api/search-products?q=bot` | 200 | 2,970 B | 69.1 | 71.4 | 71.4 | 5 MISS / 0 HIT | 2 |

Direct header checks against the same dev Worker returned HTTP `200` and `X-Edge-Cache: MISS` for products, categories and search. The observed `Cache-Control` policies were respectively `max-age=60, s-maxage=120, stale-while-revalidate=300` for products/search and `max-age=300, s-maxage=600, stale-while-revalidate=1800` for categories. The invalid related contract `/api/catalog/related?productId=1` returned HTTP `400` and was not treated as a successful baseline sample.

### Cloudflare Worker tail evidence

```text
pnpm exec wrangler tail bibisaintwebpage-dev --format json --status ok
```

The controlled tail contained events for the five SSR routes and the catalog API probes. All selected events had `outcome=ok`, `truncated=false`, `scriptName=bibisaintwebpage-dev`, environment `dev`, and script version `45244545-4f37-42b5-8056-973e627dca44`.

| Route | HTTP | CPU ms | Wall ms | Evidence condition |
|---|---:|---:|---:|---|
| `/` | 200 | 21 | 22 | SSR, legacy path log |
| `/page/2` | 200 | 48 | 250 | SSR, legacy path log |
| `/categories/Cama` | 200 | 22 | 473 | SSR, legacy path log |
| `/categories/Tecno` | 200 | 19 | 22 | SSR, legacy/sidebar fallback logs |
| `/ofertas` | 200 | 14 | 14 | SSR, legacy path log |
| `/api/search-products?q=boot&probe=tail-baseline` | 200 | 32 | 845 | API, legacy/search log and cache MISS |
| `/api/catalog/products?limit=12` | 200 | 4 | 260 | API cache HIT, version 2 |
| `/api/catalog/categories` | 200 | 3 | 25 | API cache HIT, version 2 |
| `/api/search-products?q=bot` | 200 | 16 | 47 | API cache HIT, version 2 |

For the five unique-cache-key MISS samples, Wrangler reported these exact CPU/wall sequences in request order:

- `products`: CPU `3, 3, 6, 5, 3` ms; wall `25, 25, 29, 31, 33` ms.
- `categories`: CPU `14, 8, 10, 14, 7` ms; wall `35, 29, 41, 56, 34` ms.
- `related`: CPU `9, 9, 10, 4, 3` ms; wall `31, 37, 38, 25, 22` ms.
- `search`: CPU `3, 3, 3, 3, 3` ms; wall `26, 22, 22, 24, 21` ms.

Cloudflare tail exposed `cpuTime` and `wallTime`, but no invocation RSS or memory measurement. Cloudflare memory limits/documentation are not a measurement of this Worker, so RSS/memory is explicitly **not claimed** and remains unavailable for task `1.1`.

### Read-only database evidence

```text
supabase db query --linked --output json --agent=no 'SELECT (SELECT count(*)::bigint FROM public.catalog_products) AS catalog_products, (SELECT count(*)::bigint FROM public.catalog_categories) AS catalog_categories, (SELECT count(*)::bigint FROM public.catalog_taxonomy) AS catalog_taxonomy, (SELECT count(*)::bigint FROM public.catalog_version) AS catalog_version_rows, (SELECT count(*)::bigint FROM public.products WHERE active = true) AS active_products;'
```

Resultado: `catalog_products=918`, `catalog_categories=72`, `catalog_taxonomy=8`, `catalog_version_rows=1`, `active_products=420`.

```text
supabase db query --linked --output json --agent=no 'SELECT version, published_at FROM public.catalog_version WHERE id = 1;'
```

Resultado: database `catalog_version=3`, `published_at=2026-09-03 00:21:04.934+00`.

```text
pnpm exec wrangler kv key get catalog:version --binding CATALOG_KV --remote --env dev --text
```

Resultado: KV dev `catalog:version=2`. Por lo tanto, durante esta captura el Worker dev seleccionó/expuso version `2` mientras la fila remota `catalog_version` ya era `3`; esta diferencia es un hallazgo operativo de versionado, no una modificación realizada en esta task.

`pg_stat_statements` está disponible. Su lectura fue acumulada y read-only; no se ejecutó `pg_stat_statements_reset()`. Las familias observadas fueron globales del proyecto/ventana acumulada, no correlacionadas de forma exacta con cada request del Worker:

| Familia normalizada | Calls | Total exec ms | Mean exec ms |
|---|---:|---:|---:|
| `products.* active ORDER BY name LIMIT/OFFSET` | 2,390 | 102,077.065 | 42.710 |
| `catalog_products` proyección por categoría | 680 | 388.666 | 0.572 |
| `catalog_categories` listado | 240 | 50.297 | 0.210 |
| `catalog_taxonomy` listado | 240 | 30.607 | 0.128 |
| RPC `catalog_search_products` | 75 | 4,380.402 | 58.405 |

The available database statistics do not carry a request correlation ID matching the Worker tail events. The controlled requests therefore strengthen aggregate query evidence but do not prove exact SQL counts or SQL latency per route. No broad instrumentation or SQL changes were made because that would exceed the task's evidence-only scope.

### Task 1.1 evidence matrix

| Criterion | Status | Objective evidence / missing evidence |
|---|---|---|
| Status by relevant dev route | PASS | 60/60 HTTP 200 for six baseline routes; API probe 20/20 HTTP 200; invalid related contract 400. |
| Payload size and p50/p95/p99 latency | PASS | Ten samples for six routes and five samples for each of four read API endpoints, with payload and nearest-rank percentiles recorded above. |
| Cache hit/miss and catalog version | PASS | API headers/tail expose HIT/MISS and version `2`; SSR routes expose no Cache API state. KV confirms version `2`. |
| Worker CPU/wall time | PARTIAL | Wrangler tail exposes per-invocation `cpuTime`/`wallTime`; no RSS/memory metric is available. |
| Database query counts/latencies correlated by route | PARTIAL | `pg_stat_statements` supplies aggregate calls and execution times only; exact Worker-route correlation is unavailable. |
| All task 1.1 closure criteria | BLOCKED | Memory/RSS and route-correlated SQL evidence are objectively unavailable; task remains open. |

### Strict TDD and work-unit evidence — task 1.1

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1.1 | `tests/baseline-percentiles.test.ts` + external evidence | Unit + runtime evidence | ✅ 122/122 | N/A: measurement-only task | ✅ 60/60 HTTP 200 baseline and tail/API collection | ✅ five SSR routes + four API endpoints + hit/miss paths | N/A: no production code changed |

| Work-unit evidence | Result |
|---|---|
| Focused test command and exact result | `pnpm test:unit` → exit `0`; `122/122` passed, `0` failed. |
| Runtime harness command/scenario and exact result | Published dev Worker baseline plus `wrangler tail`; `60/60` baseline HTTP 200, `20/20` unique API probes HTTP 200, tail CPU/wall captured. |
| Rollback boundary | Revert only this appended evidence section and its Engram apply-progress revision; no production behavior, database state, KV state, flags or secrets were changed. |

### Disposition

- `tasks.md` task `1.1` remains `[ ]`; it was not objectively complete because memory/RSS and route-correlated SQL counts are unavailable.
- This update does not close `1.1`, does not claim Worker RSS, and does not treat aggregate `pg_stat_statements` data as route-correlated.

## Task 6.3 — aligned DEV retry with 100,000 read-model fixtures — 2026-09-03 UTC

### Scope, alignment, and safety gate

- The only HTTP target was `https://bibisaintwebpage-dev.franccesco-giordano11.workers.dev/`.
- Read-only preflight confirmed DEV KV `catalog:version=3` and deployed Worker version `e128da0d-4fed-4e74-8435-231211ce08d5`.
- The actual remote schema was inspected before the write. `catalog_products` is the Worker product/search read model; its only triggers are BEFORE `ingested_at` and search-vector maintenance. The sync trigger is on source `products`, not on `catalog_products`.
- Only `public.catalog_products` was written, using explicit columns and bounded 500-row INSERT batches. No source products, aggregates, taxonomy, change queue, catalog version, schema, RLS, flags, secrets, or deployment were changed.
- The first retry harness attempt was rejected by the Supabase Management API with HTTP 413 before any row was inserted; its exact-prefix cleanup check returned zero rows. The corrected harness reduced the batch size to 500 and completed safely.
- The native acquire token was retained and neither reset nor settled.

### Commands and outcomes

```text
pnpm exec wrangler --version
```

Result: `4.125.0`.

```text
pnpm exec wrangler kv key get catalog:version --binding CATALOG_KV --remote --env dev --text
```

Result: `3`.

```text
pnpm exec wrangler versions list --env dev
```

Result: deployed version `e128da0d-4fed-4e74-8435-231211ce08d5` was present.

```text
node --check scripts/catalog-load-dev-63.mjs
pnpm test:unit
```

Result: syntax check passed; unit safety net exit `0`, `122/122` passed, `0` failed.

```text
wrangler tail bibisaintwebpage-dev --format json --status ok
node scripts/catalog-load-dev-63.mjs
```

Result: tail captured `122` DEV events (2 visibility probes + 120 load requests), all for Worker version `e128da0d-4fed-4e74-8435-231211ce08d5`. The temporary harness was removed after execution.

### Exact fixture lifecycle

| Check | Result |
|---|---:|
| Run prefix | `loadtest:catalog-100k:20260903:37c5644be53c4b9aa6fbd30851a0fb9e` |
| Fixture ID range | `<prefix>:000000` through `<prefix>:099999` |
| Batch size / batches | `500 / 200` |
| Pre-test `catalog_products` rows / active | `918 / 420` |
| Pre-test `catalog_categories` rows | `72` |
| Pre-test `catalog_taxonomy` rows | `8` |
| Pre-test `catalog_changes` rows | `1497` |
| Pre-test `catalog_version` | `1 row; version 3; published_at 2026-09-03T00:21:04.934+00:00` |
| Pre-test source `products` rows / active | `918 / 420` |
| Namespace collisions (`catalog_products`, `catalog_changes`, `products`, category) | `0, 0, 0, 0` |
| Inserted distinct fixtures | `100000` |
| DEV visibility: product endpoint | HTTP `502`, zero fixture IDs; this endpoint was not used as the sole gate |
| DEV visibility: search endpoint | HTTP `200`, `48` fixture IDs, catalog version `3` |
| Deleted by exact prefix | `100000` |
| Remaining exact-prefix rows | `0` |
| Post-test `catalog_products` rows / active | `918 / 420` |
| Post-test `catalog_categories` rows | `72` |
| Post-test `catalog_taxonomy` rows | `8` |
| Post-test `catalog_changes` rows | `1497` |
| Post-test `catalog_version` | `1 row; version 3; published_at 2026-09-03T00:21:04.934+00:00` |
| Existing-data identity hashes | All pre/post hashes matched for `catalog_products`, `catalog_categories`, `catalog_taxonomy`, `catalog_changes`, `catalog_version`, and source `products` |

The full redacted operational report is retained outside the repository at `/var/folders/97/qsfjwqc17ql07t5vm56jgmk00000gq/T/opencode/catalog-load-dev-63-20260903-aligned.json`. It records the complete pre/post hashes, exact insert/delete counts, request-level status/cache/payload data, and `cleanupVerified=true`. The raw Wrangler tail is at `/var/folders/97/qsfjwqc17ql07t5vm56jgmk00000gq/T/opencode/catalog-load-dev-63-corrected-tail-20260903.jsonl`.

### Controlled load results

The load used four routes and a staged ramp: `8@1`, `16@2`, `32@4`, and `64@8` requests/concurrency. It sent `120` load requests plus two visibility probes, below the documented default `180 requests/minute` per-IP limiter. No `429` responses occurred.

| Route | Requests | Statuses | Cache | Payload min/avg/max | Client p50/p95/p99 ms |
|---|---:|---|---|---:|---:|
| Product list by name | 30 | `29x200`, `1x502` | `3 MISS`, `26 HIT`, `1 not exposed` | `79 / 20124 / 20815 B` | `51.408 / 2322.002 / 3876.095` |
| Product list by price + offer | 30 | `30x200` | `2 MISS`, `28 HIT` | `20646 / 20646 / 20646 B` | `49.453 / 1065.109 / 1246.537` |
| Categories | 30 | `30x200` | `2 MISS`, `28 HIT` | `292 / 292 / 292 B` | `52 / 399.669 / 676.617` |
| Search | 30 | `30x200` | `3 MISS`, `27 HIT` | `25911 / 25911 / 25911 B` | `49.894 / 1287.268 / 1913.242` |
| **Total** | **120** | **`119x200`, `1x502`** | **10 MISS, 109 HIT, 1 not exposed** | — | **13.529 s total; 8.869 req/s** |

The single load failure was a product-name cache miss returning the application’s `502 UPSTREAM_ERROR`; the product endpoint also returned `502` during the visibility probe. Search independently demonstrated fixture visibility and remained `200` throughout load.

### Cloudflare Worker metrics

Wrangler tail exposed CPU and wall time, but no Worker RSS or memory metric. For the 120 load events, nearest-rank observations were:

| Route | Worker CPU p50/p95/p99/max ms | Worker wall p50/p95/p99/max ms |
|---|---:|---:|
| Product list by name | `1 / 3 / 4 / 4` | `8 / 2281 / 3802 / 3802` |
| Product list by price + offer | `1 / 4 / 5 / 5` | `8 / 1021 / 1171 / 1171` |
| Categories | `1 / 4 / 6 / 6` | `8 / 271 / 554 / 554` |
| Search | `1 / 4 / 5 / 5` | `7 / 1216 / 1712 / 1712` |

Cloudflare did not expose RSS/memory, so no RSS or memory claim is made. A read-only aggregate `pg_stat_statements` query after cleanup matched `4476` historical/current `catalog_products` SELECT calls, `71571.613 ms` total execution time, and `2522.611 ms` maximum mean execution time; it has no request correlation ID and is not treated as route-specific load evidence.

### Task 6.3 verdict

**BLOCKED — leave task `6.3` unchecked.** The aligned DEV Worker read the 100,000-fixture population through search, the exact fixture lifecycle was fully cleaned up, and all pre/post counts and identity hashes matched. However, the product-name path produced one `502` during the controlled load and one `502` during visibility, Worker RSS/memory is unavailable from supported Cloudflare telemetry, and therefore the complete CPU/memory/p95 acceptance evidence is not objectively satisfied. No production target, production flag, deployment, source data, or native settlement was touched.

### Post-run product-path diagnostic — 2026-09-03 UTC

After cleanup, a read-only diagnostic probe against the same DEV product endpoint (`pageSize=48&sort=nombre`) returned `30/30` HTTP `200` responses with `curl --max-time 6`. The first five probes showed two uncached `200` responses (`1.796s`, `0.961s`) followed by three cache hits (`0.097s`, `0.083s`, `0.094s`). This supports treating the earlier `502` as transient or cold-path behavior, but it does not erase the failed request from the controlled 100k run and does not supply Worker RSS/memory evidence. The task therefore remains blocked.

### Work-unit evidence — aligned retry

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm test:unit` → exit `0`; `122/122` passed, `0` failed |
| Runtime harness command/scenario and exact result | Corrected remote harness → `100000` inserted in 200 bounded batches; search visibility `48` fixture IDs; 120 load requests; `119x200`, `1x502`; no `429` or timeout |
| Database safety proof | Read-only schema/RLS/trigger inspection; pre/post counts and identity hashes matched; exact-prefix delete `100000`; remaining `0` |
| Worker observability | Wrangler tail → `120` load events for version `e128da0d-4fed-4e74-8435-231211ce08d5`; CPU/wall available; RSS/memory unavailable |
| Rollback boundary | Delete only `catalog_products.product_id LIKE '<run-prefix>%'`; no other table or runtime configuration was changed |

### Strict TDD cycle evidence — aligned retry

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 6.3 | Temporary `scripts/catalog-load-dev-63.mjs` | Operational load/evidence | ✅ `122/122` | N/A: measurement-only task | ⚠️ fixture lifecycle and visibility green; one product-path `502` | ✅ name, price/offer, categories, and search across four ramp stages | N/A: temporary harness removed |

## Cloudflare Workers GraphQL Analytics evidence — 2026-09-03 UTC

Newly verified runtime evidence for Worker `bibisaintwebpage-dev`:

- Dataset: `workersInvocationsAdaptive`.
- Analytics interval: `2026-09-03T04:30:00Z`–`2026-09-03T04:50:00Z`.
- The interval contained `150` GraphQL requests in total, including the `120` load requests, two visibility probes, and other nearby requests.
- Worker analytics reported `errors: 0` at the Worker analytics outcome level.
- During the exact `04:35` load window, `120` requests were observed across the returned analytics rows. The maximum reported `memoryUsageBytesP99` was `13,335,251` bytes (~`12.7 MiB`), the maximum `memoryUsageBytesP95` was `13,335,251` bytes, and the maximum `cpuTimeP99` was `6,694` microseconds.

These are runtime-level aggregate/quantile observations. They do **not** prove that all application HTTP responses were `200` and must not be interpreted as an application success-rate result or as newly invented acceptance thresholds.

### Load-status interpretation clarification

The structured load report records `119/120` HTTP `200` responses and one HTTP `502` within the `120` load requests. The failure was specifically the `products-name` route on a cold/`MISS` request. The separate visibility probe for that same route also returned HTTP `502`. The Worker tail showed `outcome: ok`, no exceptions, and the application log `route=products ... status=502`. This supports an application/backend upstream error rather than a Cloudflare Worker crash, but it does **not** establish the root cause. The prior safety, fixture-cleanup, and task-blocking conclusions remain unchanged.

## Superseding interpretation — Cloudflare memory metric

Date: `2026-09-03 UTC`

The earlier statements that Worker memory/RSS was unavailable referred specifically to **Wrangler Tail**. They are superseded for the supported telemetry question by the newly verified GraphQL Analytics result:

- Dataset: `workersInvocationsAdaptive` on `bibisaintwebpage-dev`.
- Analytics interval: `2026-09-03T04:30:00Z`–`2026-09-03T04:50:00Z`.
- Exact `04:35` load window: `120` load requests were represented in the analytics rows; Worker analytics reported `errors=0`.
- Maximum `memoryUsageBytesP99`: `13,335,251` bytes (~`12.7 MiB`).
- Maximum `memoryUsageBytesP95`: `13,335,251` bytes.
- Maximum `cpuTimeP99`: `6,694` microseconds.

These are aggregate/quantile runtime metrics. They do not remove the application HTTP failure: `119/120` load requests were HTTP `200` and one was a `products-name` HTTP `502`; the separate visibility probe also returned HTTP `502`.

Updated conclusion: memory evidence is now available for tasks `1.1` and `6.3`, but task `1.1` still lacks route-correlated SQL counts, and task `6.3` remains blocked by the observed HTTP `502` until a clean accepted run or an explicitly documented disposition exists. No thresholds are invented, and no task is marked complete by this interpretation.

## Task 6.3 — bounded DEV retry after native reset — 2026-09-03 UTC

### Scope and safety

Source report: `/var/folders/97/qsfjwqc17ql07t5vm56jgmk00000gq/T/opencode/catalog-load-dev-63-retry-20260903.json` (`status=PASSED_WITH_CLEANUP_RECOVERY`).

- The only target was the published `bibisaintwebpage-dev` Worker.
- No production, configuration, flags, secrets, KV, schema, source data, aggregate, catalog-version, or `impladmin` mutation occurred. The temporary write was limited to isolated `catalog_products` fixtures.
- The fixture population contained `100,000` active `catalog_products` rows, inserted in `200` batches of `500`.
- Visibility passed for both products and search, with `48` fixture IDs returned by each visibility check; the catalog version was `3`.

### Staged load results

Exactly `120` staged load requests were sent using `8@1`, `16@2`, `32@4`, and `64@8` requests/concurrency. All `120/120` returned HTTP `200`. There were `0` HTTP 4xx/5xx responses, `0` timeouts, `0` network failures, `0` body failures, and `0` rate-limit responses. Every load request reported catalog version `3`.

The report interval was `loadStartedAt=2026-09-03T05:18:53.513Z` through `loadFinishedAt=2026-09-03T05:18:58.405Z`, with elapsed time `4,892.239 ms` and throughput `24.529 req/s`.

| Route | Requests/status | p50 ms | p95 ms | p99 ms | Fixture IDs returned |
|---|---:|---:|---:|---:|---:|
| `products-name` | `30x200` | `41.746` | `55.206` | `78.282` | `1,440` |
| `products-price-offer` | `30x200` | `43.551` | `372.516` | `1,277.678` | `1,440` |
| `categories` | `30x200` | `39.176` | `250.746` | `561.615` | `0` |
| `search` | `30x200` | `39.609` | `157.041` | `952.663` | `1,440` |
| **Total** | **`120x200`** | — | — | — | **`4,320`** |

### Cloudflare GraphQL Analytics

- Query dataset: `workersInvocationsAdaptive`.
- Analytics window: `2026-09-03T05:18:53Z`–`2026-09-03T05:18:59Z`.
- The returned analytics represented all `120` load requests; Worker analytics errors were `0`.
- Maximum returned-row quantiles: memory P50 `12,396,464` bytes, memory P95 `12,681,161` bytes, memory P99 `12,960,846` bytes (`~12.4 MiB`); CPU P50 `3,237` µs, CPU P95 `7,630` µs, and CPU P99 `14,040` µs (`~14.04 ms`).

These are **script-level aggregate/quantile observations**, not route-correlated resource percentiles. They must not be used as per-route CPU or memory limits.

### Cleanup and integrity

- The initial exact-prefix delete encountered the opaque reason `DB_CLEANUP_DELETE`.
- Recovery used an exact-prefix delete and removed all `100,000` temporary rows; the final exact-prefix row count was `0`.
- All pre/post row counts and hashes matched. Existing data was unchanged, and the catalog version remained `3`.
- Final cleanup verification passed. The load, recovery, and finalization harnesses were deleted.

### Conclusion and task disposition

This retry removes the prior `502`/load failure and supplies supported memory evidence. It does **not** establish task `6.3` as complete: the task asks for CPU/memory limits per route, while the GraphQL resource quantiles are not route-correlated. No agreed acceptance thresholds are available where applicable, and no thresholds are invented. The cleanup-recovery risk is retained because the initial exact-prefix delete required recovery. Task `6.3` remains unchecked.

## Local verification follow-up — 2026-09-03 UTC

### Unit baseline

```text
pnpm test:unit
```

Result: exit `0`; `122/122` tests passed, `0` failed, `0` skipped.

### Playwright server-target diagnosis

The repository Playwright configuration uses `http://localhost:4321` as its fixed base URL. At the time of the full `pnpm test` attempt, that port served an unrelated local application whose page title was `Mi Portfolio`, not Bibi Saint. The run started `47` tests, reported failures across catalog, home, cart, and order suites, and was terminated by the external `120000 ms` command timeout. This run is not treated as a Bibi Saint regression result.

Bibi Saint was separately running on port `4327` with `CATALOG_READ_MODEL=true` and `ENABLE_CSV_FALLBACK=false`, but its local read model returned an empty catalog (`x-catalog-version: 1`, `x-edge-cache: BYPASS`), so it was not a valid target for the existing legacy-data E2E suite.

A temporary, removed Playwright configuration targeted a second local server on port `4328`. With `CATALOG_READ_MODEL=false` and `ENABLE_CSV_FALLBACK=true`, the targeted `tests/catalog-regressions.spec.ts` run produced `2/3` passing tests: offers and Ropa Hombre passed, while Tecno rendered `Sin Productos`. The repository `.env` declares `PUBLIC_USE_SUPABASE="true"`; the attempted process-level override did not produce a CSV-only fixture, so this run is diagnostic evidence only and does not change task disposition.

### Disposition

- `1.1`, `6.1`, `6.3`, and `6.5` remain open and unchanged.
- The unit baseline is green, but no pending task is closed by this follow-up.
- No production, database, deployment, source, configuration, task checkbox, or native-attempt state was changed by the verification commands. The temporary Playwright configuration and local server were removed after the run.

## Route-correlated query telemetry — 2026-09-03 UTC

### Scope and safety

- This corrective implementation adds application-level correlation for bounded read-model operations; it does not claim database-side tracing or production evidence.
- No production Worker, DEV deployment, flags, secrets, KV, database rows, schema, migrations, or native-attempt state were changed.
- Query logs contain only a sanitized route, request ID, operation, status, query count, and duration. Query text, filters, credentials, product data, IPs, and user-agent values are excluded.
- The request context is explicit and request-scoped. It is passed through the catalog facade and direct public API adapters rather than stored in module-global state.

### Implementation

- `code/src/server/catalog/queryTelemetry.ts` provides `createCatalogQueryTelemetry()` and `observeCatalogQuery()`.
- `runCatalogQuery()` records `catalog_version`, `catalog_products_page`, and cursor-page `catalog_products_count` operations.
- The facade propagates the context through list, category, home, search, and related reads.
- Public catalog APIs record taxonomy/count, related-ID/product, search, and paginated product operations. SSR catalog pages create route-specific contexts (`home`, `catalog-page`, `offers`, `category`, `subcategory`, `product`, and `search-page`).

### TDD cycle evidence

| Work unit | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Route-correlated query telemetry | `tests/catalog-query-telemetry.test.ts`, `tests/catalog-queries.test.ts` | Unit | ✅ `125/125` before existing production-file changes | ✅ `26/27`: missing query instrumentation produced no events | ✅ `27/27` after `runCatalogQuery` instrumentation | ✅ `28/28`, including cursor-page count and error/uninstrumented paths | ✅ build and full suite remain green |

### Local runtime harness

The implementation was exercised against a temporary local Astro server on `127.0.0.1:4329` with `CATALOG_READ_MODEL=true` and `ENABLE_CSV_FALLBACK=false`. The server performed read-only Supabase requests; the process and server were stopped after the run.

| Route scenario | Request ID | Observed query operations | HTTP |
|---|---|---|---:|
| `/api/catalog/products?pageSize=12&sort=nombre` | `51550a6f-5726-4672-ad85-2e2fe9b400eb` | `catalog_version`, `catalog_products_page` | 200 |
| `/api/catalog/products` with returned cursor | `abd3c5d4-8b10-4217-a506-9a70046367cb` | `catalog_version`, `catalog_products_page`, `catalog_products_count` | 200 |
| `/api/catalog/categories` | `b3b8f97d-957d-4331-b7e1-81d94fc1f15a` | `catalog_categories`, `catalog_taxonomy` | 200 |
| `/api/catalog/related?product_id=mdt-42302` | `db04dbe0-e726-40cf-85c7-19bde5b827ce` | `product_related` | 200 |
| `/api/search-products?q=bot` | `ffb31741-a871-415e-baa2-c3953537b1fd` | `catalog_version`, `catalog_products_page` | 200 |
| `/categories/Tecno` | `d316dafa-7a30-4ad4-b1fd-3b1381a92d65` | `catalog_version`, `catalog_products_page` | 200 |

Each emitted event had `query_count=1` and the same `request_id` within its route scenario. The cursor request proved that the exact-count operation is separately observable without logging SQL text. The category SSR request also exposed the existing legacy sidebar fallback log, independently of the read-model query events.

### Verification

```text
node --experimental-strip-types --test tests/catalog-queries.test.ts
```

Result: exit `0`; `28/28` passed, `0` failed.

```text
pnpm test:unit
```

Result: exit `0`; `127/127` passed, `0` failed, `0` skipped.

```text
pnpm build
```

Result: exit `0`; Astro SSR/Cloudflare build completed. Existing non-blocking warnings remained for prerendered `Astro.request.headers`, externalized Node built-ins, and a dynamic/static import split.

### Disposition

- The new instrumentation supplies route-correlated application-level operation counts and timings for the current code path, but it does not prove that a deployed Worker version emitted these events or provide database-side request tracing. Task `1.1` therefore remains open.
- Tasks `6.1`, `6.3`, and `6.5` remain open for the previously documented historical-RED, resource/threshold, and production-authorization blockers. No task checkbox was changed.

### Work-unit evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `node --experimental-strip-types --test tests/catalog-queries.test.ts` → exit `0`; `28/28` passed, `0` failed |
| Full unit command and exact result | `pnpm test:unit` → exit `0`; `127/127` passed, `0` failed |
| Runtime harness command/scenario and exact result | Temporary local Astro server plus read-only route probes → readiness plus six route scenarios, all HTTP `200`; route/request/operation correlation captured above |
| Rollback boundary | Revert `queryTelemetry.ts`, `catalog-query-telemetry.test.ts`, the telemetry propagation/call sites, and this evidence section; no database or deployed runtime state is part of this unit |

## DEV deployment telemetry recheck — 2026-09-03 UTC

### Scope and safety

- This was a read-only check of the already published `bibisaintwebpage-dev` Worker; no deploy, flag, secret, KV, database, or native-attempt mutation occurred.
- The raw tail output was discarded. No credentials, request headers, product data, IPs, or user-agent values were added to the evidence.

### Commands and result

```text
pnpm exec wrangler tail bibisaintwebpage-dev --format json --status ok
GET https://bibisaintwebpage-dev.franccesco-giordano11.workers.dev/api/catalog/products?pageSize=1&probe=telemetry-deployed-20260903c
```

The request returned HTTP `200` with `X-Edge-Cache: MISS`. Wrangler captured one successful invocation for Worker version `e128da0d-4fed-4e74-8435-231211ce08d5` with `cpuTime=4 ms` and `wallTime=89 ms`. Its structured log contained the existing `[catalog:edge-cache]` event (`route=products`, `hit=false`, `version=3`, `status=200`), but no `catalog query` event and no route/request/operation telemetry fields.

This confirms that the currently published DEV version does not provide evidence for the new application-level query telemetry. The local build and harness remain green; a DEV deployment would be required to validate the new logs remotely, and no deployment is performed in this apply boundary.

### Disposition

- Task `1.1` remains open: the deployed Worker still has no captured route-correlated application query events, and the available database statistics remain uncorrelated by request.
- No task checkbox was changed.

| Work-unit evidence | Result |
|---|---|
| Focused test command and exact result | `pnpm test:unit` → exit `0`; `127/127` passed, `0` failed |
| Runtime harness command/scenario and exact result | Read-only DEV tail plus one product API request → HTTP `200`, one Worker invocation, no `catalog query` event |
| Rollback boundary | Revert only this evidence section; no deployed or external runtime state is part of the change |

## DEV telemetry deployment preflight — 2026-09-03 UTC

The current build was prepared for the existing DEV deployment path without publishing it:

```text
rsync -a --delete dist/ dist-deploy/
printf '_worker.js\n' > dist-deploy/.assetsignore
pnpm exec wrangler deploy ./dist-deploy/_worker.js/index.js --assets ./dist-deploy --env dev --dry-run
```

Result: Wrangler `4.125.0` read `431` assets, calculated `3151.95 KiB` total upload (`618.11 KiB` gzip), resolved the expected `CATALOG_KV`, `SESSION`, `ASSETS`, `CATALOG_READ_MODEL=true`, and `ENABLE_CSV_FALLBACK=false` bindings, and exited at `--dry-run` without deployment. The direct `wrangler deploy --env dev --dry-run` form was not used because this project's deploy script intentionally targets `dist-deploy/` with `.assetsignore` to prevent uploading `_worker.js` as an asset.

No task checkbox was changed. Publishing this build to DEV is the remaining bounded step needed to re-run the remote telemetry check; production remains out of scope.

## Task 1.1 — DEV route-correlated telemetry after deployment — 2026-09-03 UTC

### Scope and safety

- The parent explicitly authorized this DEV-only deployment and completed no operation outside that scope.
- Worker: `bibisaintwebpage-dev`.
- Published version: `15674497-9218-4962-a099-57eae8a7c86e`.
- URL: `https://bibisaintwebpage-dev.franccesco-giordano11.workers.dev`.
- Runtime variables remained `CATALOG_READ_MODEL=true` and `ENABLE_CSV_FALLBACK=false`.
- No production Worker, production flag, secret, source database, KV, schema, migration, `impladmin` branch, native-attempt state, commit, or push was changed.

### Deployment and verification commands

```text
pnpm run deploy:dev
```

Result: Astro SSR/Cloudflare build completed successfully with existing non-blocking warnings. The DEV Worker published version `15674497-9218-4962-a099-57eae8a7c86e`.

Remote verification used:

```text
pnpm exec wrangler tail bibisaintwebpage-dev --format json --status ok --search "catalog query"
```

Four unique-key, read-only requests were sent to the published DEV URL. The `probe` values only forced distinct cache keys; no secrets or user data were included.

### Route and query correlation

All four requests returned HTTP `200`. Every matching tail event belonged to the published version, had `outcome=ok`, and had no exceptions. Each route had one request ID shared by all operations emitted for that route; every operation reported `query_count=1`.

| Route | Request shape | Request correlation | Query operations (`query_count=1`, duration) | Worker CPU / wall |
|---|---|---|---|---:|
| Products | `/api/catalog/products?pageSize=1&probe=telemetry-route-products-20260903f` | One shared request ID | `catalog_version=1 (647 ms)`; `catalog_products_page=1 (658 ms)` | `18 ms / 811 ms` |
| Categories | `/api/catalog/categories?probe=telemetry-route-categories-20260903f` | One shared request ID | `catalog_categories=1 (179 ms)`; `catalog_taxonomy=1 (180 ms)` | `18 ms / 229 ms` |
| Related | `/api/catalog/related?product_id=mdt-42302&probe=telemetry-route-related-20260903f` | One request ID | `product_related=1 (78 ms)` | `3 ms / 98 ms` |
| Search | `/api/search-products?q=bot&probe=telemetry-route-search-20260903f` | One shared request ID | `catalog_version=1 (175 ms)`; `catalog_products_page=1 (190 ms)` | `22 ms / 242 ms` |

This is route-correlated application-level evidence for the bounded read operations executed by the current DEV code path. It does not claim database-side request tracing, route-specific memory, production behavior, or newly invented acceptance thresholds. The previously recorded GraphQL memory measurements remain aggregate Worker quantiles only.

### Task disposition

- Task `1.1` is marked `[x]`: baseline payload/latency/cache evidence, Worker CPU/wall observations, and route-correlated query-operation counts/durations are now recorded for the published DEV code path.
- Task `6.1` remains `[ ]`: historical RED evidence cannot be reconstructed.
- Task `6.3` remains `[ ]`: existing 100,000-fixture evidence still has its documented route/threshold and cleanup-recovery limitations; no destructive load was repeated.
- Task `6.5` remains `[ ]`: no production authorization, agreed thresholds, rollback proof, or production activation was supplied or performed.

### Strict TDD cycle evidence — task 1.1 continuation

| Task | Test file / evidence | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1.1 | `tests/baseline-percentiles.test.ts` + DEV Worker tail | Unit + runtime evidence | ✅ `127/127` | N/A: measurement/evidence task | ✅ `4/4` HTTP 200 with matching query events | ✅ products, categories, related, and search routes | N/A: no production code changed in this continuation |

### Work-unit evidence — task 1.1 continuation

| Evidence | Result |
|---|---|
| Focused test command and exact result | `pnpm test:unit` → exit `0`; `127/127` passed, `0` failed |
| Runtime harness command/scenario and exact result | Published DEV Worker plus filtered Wrangler tail and four unique-key requests → `4/4` HTTP `200`; all matching events were the published version with `outcome=ok`, no exceptions, and route/request/operation correlation |
| Worker metrics | Per-route tail observations recorded above; no route-specific memory claim; prior GraphQL memory remains aggregate only |
| Rollback boundary | Revert the telemetry implementation/call-site changes and redeploy the prior DEV version if needed; remove only this evidence section and the task 1.1 verification note without touching unrelated worktree changes |

## Task 6.1 — maintainer-approved historical RED evidence waiver — 2026-09-03 UTC

### Scope and disposition

- This is a documentation-only closeout for task `6.1`; no production or runtime behavior was changed.
- The maintainer explicitly approved this minimal evidence waiver because the historical RED artifact is unrecoverable.
- Current tests are verified, but they prove current behavior only and do not establish the historical order in which tests and implementation were written.
- No historical RED output is fabricated, simulated, inferred, or relabeled.
- Task `6.1` is closed; tasks `6.3` and `6.5` remain unchecked and unchanged.

### Current test verification

```text
pnpm test:unit
```

Result: exit `0`; `127/127` passed, `0` failed, `0` skipped.

### Strict TDD Cycle Evidence — task 6.1

| Task | Test file / evidence | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 6.1 | `tests/catalog-contracts.test.ts`, `tests/catalog-queries.test.ts`, `tests/catalog-normalization.test.ts`, `tests/results-store.test.ts`, and `tests/integration/catalog-integration.test.ts` | Unit + previously recorded integration coverage | N/A — documentation-only closeout; no test files modified | Historical RED artifact is unrecoverable and covered by the explicit maintainer-approved waiver; no test was made to fail and no historical failure is fabricated | `pnpm test:unit` → exit `0`; `127/127` passed, `0` failed, `0` skipped | Existing coverage includes cursor/order, filter fingerprints, normalization, zero-count taxonomy, and client request deduplication | N/A — no runtime code changed |

### Work Unit Evidence — task 6.1

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm test:unit` → exit `0`; `127/127` passed, `0` failed, `0` skipped |
| Runtime harness command/scenario and exact result | `N/A` — this unit changes only OpenSpec task/evidence documentation; it does not cross a runtime boundary or change runtime behavior |
| Rollback boundary | Revert only the task `6.1` checkbox/note in `tasks.md`, this appended section, and the corresponding task `6.1` section in Engram apply-progress; leave prior evidence, other task checkboxes, source files, and runtime state untouched |

## Task 6.3 — isolated per-route window retry blocked at DEV visibility — 2026-09-03 UTC

### Scope and safety

- The only HTTP target was the published DEV Worker `https://bibisaintwebpage-dev.franccesco-giordano11.workers.dev` at version `15674497-9218-4962-a099-57eae8a7c86e`.
- The temporary fixture population was limited to `public.catalog_products`; no source products, aggregates, taxonomy, catalog version, flags, secrets, schema, migration, production Worker, or `impladmin` state was changed.
- The run used `100000` active fixtures in `200` batches of `500`, with collision checks and explicit product columns. The route harness was configured for `24` requests per route, concurrency `4`, unique cache keys, a `6000 ms` request timeout, and a `2000000` byte response limit.
- The visibility gate was intentionally evaluated before load traffic. Because the product-list visibility probe returned an upstream error, the harness sent no load requests and no per-route window was treated as valid.

### Operational report

The complete redacted report is retained outside the repository at:

`/var/folders/97/qsfjwqc17ql07t5vm56jgmk00000gq/T/opencode/catalog-load-dev-63-route-windows-20260903.json`

The filtered Wrangler tail and stderr are retained at:

- `/var/folders/97/qsfjwqc17ql07t5vm56jgmk00000gq/T/opencode/catalog-load-dev-63-route-windows-tail-20260903.jsonl`
- `/var/folders/97/qsfjwqc17ql07t5vm56jgmk00000gq/T/opencode/catalog-load-dev-63-route-windows-tail-20260903.stderr.log`

The report status is `BLOCKED` with load error `VISIBILITY_GATE_FAILED`:

| Phase / route | HTTP | Payload | Latency | Fixture IDs | Cache | Worker observation |
|---|---:|---:|---:|---:|---|---|
| Visibility / `products-name` | `502` | `79 B` | `5316 ms` | `0` | not exposed | CPU `23 ms`, wall `4739 ms`; body `UPSTREAM_ERROR` |
| Visibility / `search` | `200` | `23058 B` | `2270 ms` | `48` | `MISS` | CPU `6 ms`, wall `1689 ms`; catalog version `3` |

The Wrangler tail contained exactly two matching events, both for the expected Worker version, `outcome=ok`, and zero exceptions. The product event emitted successful application-level query observations for `catalog_version` (`1088 ms`) and `catalog_products_page` (`4175 ms`) before returning the `502`. The search event emitted `catalog_version` (`210 ms`) and `catalog_products_page` (`1619 ms`). These are visibility observations only, not a completed load-window result.

### Fixture lifecycle and cleanup

| Check | Result |
|---|---:|
| Run prefix | `loadtest:catalog-100k:20260903:route-window-581048554e3549d6b6aa293fc1756ac5` |
| Seed batches / rows | `200 / 100000` |
| Verified active and distinct fixture rows | `100000 / 100000` |
| Pre-test `catalog_products` rows / active | `918 / 420` |
| Pre-test `catalog_categories` / taxonomy / changes | `72 / 8 / 1497` |
| Pre-test catalog version | `3` |
| Load requests sent | `0`; route windows `[]` |
| Exact-prefix rows deleted | `100000` |
| Remaining exact-prefix rows | `0` |
| Post-test `catalog_products` rows / active | `918 / 420` |
| Post-test `catalog_categories` / taxonomy / changes | `72 / 8 / 1497` |
| Post-test catalog version | `3` |
| Existing-data hashes | All pre/post hashes matched, including source `products` |
| Cleanup verification | `true` |

The report confirms `existingDataUnchanged=true`; no fixture rows or temporary category data remain. Cloudflare GraphQL windows are empty because the load phase was correctly not started.

### Task 6.3 disposition

**BLOCKED — leave task `6.3` unchecked.** The `100000`-row fixture lifecycle was completed and fully restored, and search visibility succeeded. The product visibility request returned `502 UPSTREAM_ERROR`, so the safety gate prevented any load traffic. This run therefore supplies no valid route-window p50/p95/p99, payload, status/failure, or load-resource result. The existing earlier DEV retry remains the valid `120/120` load evidence, but its resource quantiles are script-level rather than route-correlated and the planning artifacts still contain no accepted thresholds. Task `6.5` remains untouched.

### Work-unit evidence — isolated route-window retry

| Evidence | Result |
|---|---|
| Focused test command and exact result | `pnpm test:unit` → exit `0`; `127/127` passed, `0` failed, `0` skipped |
| Runtime harness command/scenario and exact result | Temporary bounded DEV route-window harness → `100000` fixtures seeded; visibility `1x502` and `1x200`; load correctly not sent because `VISIBILITY_GATE_FAILED` |
| Worker metrics | Visibility tail exposed CPU/wall only; no load-window or GraphQL resource metrics were collected |
| Rollback boundary | Delete only `catalog_products.product_id LIKE 'loadtest:catalog-100k:20260903:route-window-581048554e3549d6b6aa293fc1756ac5%'`; exact-prefix cleanup removed `100000` rows and left `0` |

### Strict TDD cycle evidence — isolated route-window retry

| Task | Test file / evidence | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 6.3 | External temporary route-window report | Operational load/evidence | ✅ `127/127` | N/A: measurement-only task | ⚠️ fixture lifecycle green; product visibility gate blocked | N/A: no load was safely admissible | N/A: temporary harness removed |
