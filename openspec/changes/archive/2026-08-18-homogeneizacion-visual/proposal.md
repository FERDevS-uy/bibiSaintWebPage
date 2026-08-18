## Why

La página principal presenta inconsistencias visuales que rompen la percepción de marca y de orden: los 3 carruseles de productos usan flechas negras mientras el banner usa las amarillas de marca; no hay un único eje de alineación (1000px / 1100px / 1200px según la sección); el carrusel de productos relacionados se desplaza distinto al del home; el primer slide del banner es uno que ya no debería mostrarse; los precios se muestran con formatos mixtos; y los productos recomendados no respetan el orden definido en los datos. Todo esto hace que la web se perciba como "hecha a mano" en lugar de coherente.

## What Changes

- Los 3 carruseles de productos del home (novedades, destacados, ofertas) usan flechas de color de marca (`--line-color`), coherentes con el carrusel del banner. Un único cambio CSS en `ProductCarousel.astro` porque los 3 comparten el mismo componente.
- Se elimina el primer slide (`banner1`) del array de imágenes del carrusel del banner en `HeroBannerCarousel.astro`. Sin cambios de lógica ni hacks.
- Se corrige la alineación horizontal de la página tomando como **referencia el contenedor del menú de instrucciones** (`instrucciones-inner`): su borde izquierdo y su borde derecho son los dos ejes verticales de todo el contenido. Existe un **único contenedor reutilizable** (`width:100%; max-width:1000px; margin:0 auto; box-sizing:border-box`, padding interno dentro del ancho) usado por header, categorías, carruseles, grillas, footer, página de producto y carrito. Ninguna sección define su propio `max-width`/`padding`/ancho que genere desplazamientos. El header se corrige en el box-model (hoy su `padding-inline:1rem` corre el contenido 16px) y las categorías pasan a usar el contenedor con distribución equilibrada (hoy están comprimidas en el centro). El carrusel del banner **queda excluido**: ocupa todo el ancho del viewport y no se limita al contenedor central.
- El carrusel de productos relacionados adopta el mismo comportamiento de desplazamiento que los carruseles del home (mismo número de ítems por paso / mismo motor), eliminando la divergencia actual.
- Todos los precios visibles del catálogo se formatean con las funciones canónicas `formatPrice`/`parsePrice` de `src/utils/price.ts`, eliminando las 3 implementaciones duplicadas de `parsePrice` (ListarProductos.astro, ListarProductos.jsx, pedido.astro) y el uso de `$` + precio crudo en 8 lugares.
- Los productos recomendados se muestran respetando el orden definido en `relacionados` (tanto desde CSV como desde Supabase).
- No hay cambios breaking. No se modifica la arquitectura (SSR, dual-read Supabase/CSV, cart client-side, admin) ni la lógica de negocio salvo la corrección del orden de recomendados.

## Capabilities

### New Capabilities

- `visual-consistency`: comportamiento de presentación de la página principal y páginas de catálogo — color de flechas de carruseles, slides del banner, eje único de alineación, comportamiento de desplazamiento de carruseles, formato canónico de precios y orden de productos relacionados.

### Modified Capabilities

Ninguna — `openspec/specs/` no tiene especificaciones previas.

## Impact

**Código afectado:**
- `code/src/layouts/GlobalStyles.astro` — contenedor reutilizable único `--max-width-container` (1000px, `box-sizing:border-box`, `margin:0 auto`).
- `code/src/components/ProductCarousel.astro` — color de flechas; contenedor 1100px → 1000px (eje único).
- `code/src/components/HeroBannerCarousel.astro` — array de imágenes (quitar `banner1`). NO se tocan sus dimensiones ni el ancho full width.
- `code/src/layouts/Header.astro` — `.headerContainer`: corregir box-model (el `padding-inline:1rem` desplaza el contenido 16px del eje); alinear contenido con `instrucciones-inner`.
- `code/src/layouts/Header.astro` (`.itemsBox`/`.categoryList`) — categorías: usar el contenedor único y distribución equilibrada dentro del ancho de referencia.
- `code/src/components/InstruccionesBar.astro` — referencia horizontal (sin cambios funcionales, solo confirmar que usa el contenedor único).
- `code/src/layouts/Footer.astro` — contenido alineado al eje de 1000px (logo/primera columna).
- `code/src/components/RelatedProductCarousel.astro` — motor/scroll alineado con el home.
- Página de producto, carrito, grillas de categorías — sustitución de anchos hardcodeados por el contenedor compartido.
- `code/src/utils/price.ts` — fuente canónica de formato de precio.
- `code/src/components/admin/` y `code/src/utils/loadProducts.ts` / `loadCSV.ts` — callers de formato de precio y `loadRelatedProducts`.

**Fuera de alcance (change separado):** la auditoría y corrección de la sincronización del admin (bug de `upsertProducts` que salta productos con precio sin cambios) se mantiene deliberadamente separada de los cambios visuales.