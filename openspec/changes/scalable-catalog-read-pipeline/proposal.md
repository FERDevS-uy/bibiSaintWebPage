## Why

El SSR de Astro está provocando errores 1102/1110 porque el Worker descarga, deserializa y recorre el catálogo completo para categorías, homepage, ofertas, búsqueda, paginación y productos relacionados. Este patrón no puede escalar a 100.000 productos ni ofrecer latencia estable en Workers Free; la corrección debe mover el filtrado, ordenamiento, conteos y normalización al read path de PostgreSQL y cachear respuestas pequeñas en el edge.

## What Changes

- Introducir un read model de catálogo normalizado para categorías, subcategorías, orden estable y precio numérico.
- Introducir endpoints de lectura paginados con keyset/cursor pagination y proyección mínima para grillas.
- Eliminar del camino SSR las cargas completas de `loadProducts()` y los fallbacks que recorren todos los productos.
- Reemplazar la inferencia runtime de categorías display de Martina y Tecno por datos normalizados durante la sincronización.
- Mantener una taxonomía explícita de categorías visibles, incluyendo categorías Tecno configuradas aunque temporalmente no tengan productos.
- Usar trigger SQL liviano para marcar/upsertar cambios individuales y reconstrucción asíncrona por lote para agregados, búsqueda y publicación de versión.
- Introducir una tabla agregada de categorías/subcategorías con conteos precalculados.
- Cachear categorías y páginas públicas mediante Cloudflare Cache API, usando KV para versionado e invalidación distribuida.
- Cambiar búsqueda de catálogo completo + Fuse a búsqueda server-side paginada, manteniendo NanoStores para cachear páginas y deduplicar requests en vuelo.
- Cambiar búsqueda a estrategia híbrida `pg_trgm` + `tsvector`: trigramas para tolerancia a tipeos y FTS para consultas multi-palabra/ranking.
- Mantener la tabla `products` como modelo transaccional y aislar el fallback CSV detrás de `ENABLE_CSV_FALLBACK=false` por defecto en producción; no activarlo automáticamente ante errores de Supabase.
- **BREAKING**: Cambiar los contratos internos de lectura que actualmente devuelven el catálogo completo por respuestas paginadas o colecciones acotadas.

## Capabilities

### New Capabilities

- `catalog-read-api`: Lecturas de productos, categorías, ofertas, relacionados y búsqueda mediante consultas acotadas, proyecciones mínimas y cursores estables.
- `catalog-edge-cache`: Cache distribuida de respuestas públicas y versionado e invalidación lógica tras sincronizaciones o cambios administrativos.

### Modified Capabilities

- `search-results-loading-state`: La búsqueda deja de descargar el catálogo completo y pasa a consumir resultados paginados server-side.

## Impact

- **Supabase**: nuevas tablas/read models, funciones RPC o consultas equivalentes, índices compuestos parciales y proceso de sincronización desde `products`.
- **Cloudflare**: nuevo binding KV, uso explícito de Cache API y propagación de versión de catálogo.
- **Astro SSR**: `loadProducts.ts`, `server/products.ts`, `sidebarCategories.ts`, `Layout.astro`, páginas de homepage/categorías/ofertas/paginación y endpoints públicos.
- **Cliente**: NanoStores para páginas de catálogo, cursores, estados de carga y deduplicación; eliminación del índice Fuse sobre el catálogo completo.
- **Administración/sincronizadores**: cada escritura que modifique categorías, estado, precio u orden debe actualizar el read model o invalidar una reconstrucción controlada.
- **Operación**: medir cache hit ratio, consultas Supabase, duración CPU del Worker, tamaño de payload y latencia p50/p95/p99 antes y después.
