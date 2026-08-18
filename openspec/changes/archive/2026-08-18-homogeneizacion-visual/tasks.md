## 1. Flechas de carrusel de marca

- [x] 1.1 Cambiar el color de las flechas de `ProductCarousel.astro` a `var(--line-color)` (cubre los 3 carruseles del home: novedades, destacados, ofertas)
- [x] 1.2 Verificar en el home que las 3 flechas (izq/der) de cada carrusel usan el amarillo de marca, idéntico al banner

## 2. Eliminación del primer slide del banner

- [x] 2.1 Quitar `"banner1"` del array `images` en `HeroBannerCarousel.astro` (queda `banner2`..`banner5`)
- [x] 2.2 Verificar que el banner rota solo con los 4 slides restantes y que el índice activo no se desfasa

## 3. Eje único de alineación (referencia: menú de instrucciones)

- [x] 3.1 Definir el contenedor reutilizable único en `GlobalStyles.astro`: `width:100%; max-width:1000px; margin:0 auto; box-sizing:border-box` (ajustar `--max-width-container` a 1000px), con el padding interno contemplado dentro del ancho
- [x] 3.2 Corregir el box-model de `.headerContainer` en `Header.astro` para que el contenido real (logo y nav) coincida con los límites de `instrucciones-inner` (hoy el `padding-inline:1rem` lo desplaza 16px)
- [x] 3.3 Aplicar el contenedor único al menú de categorías (`.itemsBox`/`.categoryList`) en `Header.astro` con distribución equilibrada (p. ej. `space-between`/`space-around`), centradas y dentro del ancho de referencia
- [x] 3.4 Aplicar el contenedor único a `.carousel-container` en `ProductCarousel.astro` (hoy 1100px), manteniendo el padding de las flechas
- [x] 3.5 Alinear el contenido del footer (primera columna/logo) al eje de 1000px en `Footer.astro`, de modo que el logo inicie en la misma línea que `instrucciones-inner`
- [x] 3.6 Aplicar el contenedor de 1000px a la página de producto y al carrito (hoy 1200px) y a `RenderCategories`
- [x] 3.7 Verificar en el home (viewport 1440px) que header, categorías, carruseles, productos y footer coinciden con los límites de `instrucciones-inner` (220px/1220px) y que no existen `max-width`/padding propios por sección que desalineen
- [x] 3.8 Verificar que el banner mantiene sus dimensiones actuales y ocupa todo el viewport (sin cambios de alineación)
- [x] 3.9 Verificar que los fondos de sección quedan a full width

## 4. Comportamiento del carrusel de relacionados

- [x] 4.1 Reemplazar el motor rAF custom de `RelatedProductCarousel.astro` (click-to-center) por el `scrollBy` nativo con `behavior: "smooth"` del home (2 ítems por paso), conservando el scroll-snap
- [x] 4.2 Verificar en un producto que el avance por clic coincide con el de los carruseles del home en desktop y mobile

## 5. Formato canónico de precios

- [x] 5.1 Importar `parsePrice`/`formatPrice` de `src/utils/price.ts` en los 8 lugares de catálogo que hoy renderizan `$` + precio crudo
- [x] 5.2 Eliminar las definiciones locales duplicadas de `parsePrice` en `ListarProductos.astro`, `ListarProductos.jsx` y `pedido.astro`, reemplazándolas por el import canónico
- [x] 5.3 Verificar que precios de CSV (`1.199`) y Supabase se muestran con el mismo formato en home, categorías, búsqueda, ofertas y producto
- [x] 5.4 **Re-implementada por decisión del usuario (18/08)**: se volvió a aplicar `formatPrice(parsePrice(p.price))` en todos los renders. Formato canónico con punto de mil (`3.240`, `1.199`). Además se corrigió `parsePrice` en `price.ts` (y el duplicado `parseLoosePrice` en `stockService.ts`) para manejar `1,200.9` → `1.201` (detección de separador según posición). Verificado: buscador "j" muestra `$2.295/$1.250/$2.999/$2.210`, home `$3.240`, producto `$3.240`, ofertas con punto de mil

## 6. Orden de productos relacionados

- [x] 6.1 En `loadProducts.ts`, reordenar el resultado de `loadRelatedProducts` según el orden de aparición de los IDs en `relacionados` (CSV)
- [x] 6.2 Aplicar el mismo reordenamiento en JS para el caso Supabase (post-`.in()`), usando el array de IDs declarado
- [x] 6.3 Verificar en un producto con varios relacionados que el orden mostrado coincide con el declarado en los datos

## 7. Fallback de productos relacionados (nuevo)

- [x] 7.1 En `loadProducts.ts`, crear `loadRelatedProductsFallback` que busca por misma subcategoría + tokens compartidos del nombre cuando `relacionados` está vacío
- [x] 7.2 Usar el fallback en `[id].astro` solo cuando el producto no declara `relacionados`; con IDs declarados se mantiene la lógica existente
- [x] 7.3 Verificar: "Colcha Dohler Full" (sin relacionados) muestra otras colchas Dohler; "Almohada Flor De Algodon" muestra 10 almohadas ordenadas por relevancia