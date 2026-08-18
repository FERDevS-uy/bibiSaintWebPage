## Context

Estado actual relevante (ver proposal.md - Why para la motivación):

- Los 3 carruseles del home (`novedades`, `destacados`, `ofertas`) son 3 instancias del mismo componente `ProductCarousel.astro` (index.astro:37-39). Sus flechas son negras (`#1a1a1a`); el banner usa `var(--line-color)` = `#f0b13e` (GlobalStyles.astro:26). Un solo cambio CSS corrige los 3.
- El carrusel del banner (`HeroBannerCarousel.astro`) define sus slides en un array: `const images = ["banner1", "banner2", "banner3", "banner4", "banner5"]` (línea 7). Es el único carrusel con imágenes definidas en código.
- Anchos hardcodeados hoy: 1000px (Header.astro:423, InstruccionesBar.astro:34, grillas/toolbar de categorías), 1100px (`--max-width-container` GlobalStyles.astro:14 — usado solo por carruseles y RenderCategories), 1200px (página de producto, carrito). Hay 3 ejes distintos.
- **Box-model real (medido en 1440px):** `instrucciones-inner` = `max-width:1000px`, padding 0 → contenido en 220px→1220px (REFERENCIA). `.headerContainer` = `max-width:1000px` **+ `padding-inline:1rem`** (Header.astro:429) → su caja está en 220px→1220px pero su contenido real (logo, nav) en 236px→1204px: **desfase de 16px** por el padding. `.itemsBox`/`.categoryList` (menú de categorías desktop) usa `justify-content:center; width:auto; max-width:none` → las categorías quedan **comprimidas en el centro** (268px→922px, 655px de ancho) en vez de aprovechar el ancho de referencia. `.carousel-container` = `max-width:1100px` con `margin:24px 170px` → 170px→1270px (50px fuera del eje a cada lado). Footer desktop centra sus columnas (`justify-content:center`) → logo en 146px (74px corrido).
- `RelatedProductCarousel.astro` usa un motor propio de scroll (rAF + easeOutCubic, líneas ~348-425) que avanza 1 ítem por clic (click-to-center). El home usa `track.scrollBy({ left: (itemWidth + 20) * 2, behavior: "smooth" })` (2 ítems). El banner NO es referencia de comportamiento.
- `src/utils/price.ts` ya exporta `parsePrice`/`formatPrice` canónicos, usados solo en carrito y pedido. El catálogo (8 lugares) renderiza `$` + `p.price` crudo. Hay `parsePrice` duplicado en ListarProductos.astro, ListarProductos.jsx y pedido.astro.
- `loadRelatedProducts` (loadProducts.ts:65) no preserva el orden de `relacionados`: en CSV filtra por orden de catálogo; en Supabase usa `.in()` sin ordenar.
- El proyecto usa Astro 5 SSR, View Transitions activas y el patrón de scripts cliente escuchando `astro:page-load`. Todos los cambios de CSS se aplican sin JS.

## Goals / Non-Goals

**Goals:**
- Un solo cambio de CSS en `ProductCarousel.astro` para las flechas de los 3 carruseles del home.
- Un único contenedor reutilizable (`width:100%; max-width:1000px; margin:0 auto; box-sizing:border-box`) que todas las secciones comparten, reemplazando los `max-width`/padding hardcodeados.
- Alinear el contenido real del header (corrigiendo el box-model del padding) con los límites del menú de instrucciones.
- Categorías centradas y distribuidas de forma equilibrada dentro del ancho de referencia.
- Reutilizar el scroll nativo del home en `RelatedProductCarousel.astro`, eliminando el motor rAF custom.
- Unificar el formato de precios en una sola función canónica.
- Preservar el orden de `relacionados` en ambos orígenes de datos.

**Non-Goals:**
- No se toca la arquitectura SSR, el dual-read Supabase/CSV, el cart client-side, el admin ni el buscador.
- No se cambia el color de marca ni se introduce diseño nuevo.
- La auditoría/corrección de la sincronización del admin (bug de `upsertProducts`) queda en un change separado.
- No se definen nuevos tokens de color; solo se reutiliza `--line-color` y `--max-width-container` existentes.

## Decisions

### D1. Flechas amarillas vía token existente
Cambiar el color de las flechas de `ProductCarousel.astro` a `var(--line-color)`. **Alternativas:** hardcodear `#f0b13e` (rechazada: duplica el valor y rompe la fuente única); introducir un token nuevo (innecesario, `--line-color` ya es el amarillo de marca). Como los 3 carruseles comparten el componente, una sola regla CSS los cubre.

### D2. Eje único = contenedor reutilizable de 1000px (referencia `instrucciones-inner`)
Medición real en viewport 1440px: `instrucciones-inner` es la REFERENCIA horizontal (contenido en 220px→1220px). Los desalineados son: (a) el **header**, cuyo `padding-inline:1rem` (Header.astro:429) desplaza su contenido real 16px (236px→1204px) aunque su caja coincide; (b) las **categorías**, comprimidas en el centro (268px→922px) porque `.itemsBox` usa `width:auto` + `justify-content:center`; (c) los **carruseles**, con `max-width:1100px` (170px→1270px); (d) el **footer**, con columnas centradas (logo en 146px). El banner queda EXPLÍCITAMENTE EXCLUIDO: ocupa todo el viewport y sus dimensiones actuales son correctas.
**Corrección:** crear un único contenedor reutilizable `width:100%; max-width:1000px; margin:0 auto; box-sizing:border-box` (token `--max-width-container` con valor 1000px) y aplicarlo a `.headerContainer`, `.itemsBox` (categorías con distribución equilibrada, p. ej. `space-between`/`space-around`), `.carousel-container`, footer, `RenderCategories`, página de producto y carrito. En el header se corrige el box-model para que el contenido real coincida con los límites (el padding no debe aumentar el ancho efectivo ni correr el contenido). Los fondos de sección se mantienen a full width. La alternativa de columna estrecha (~610px) quedó descartada: contradice el objetivo de cambios mínimos y rompería la grilla de 4 columnas.

### D3. Comportamiento del carrusel de relacionados = patrón del home
Reemplazar el motor rAF custom de `RelatedProductCarousel.astro` por el `scrollBy` nativo con `behavior: "smooth"` que usa el home (2 ítems por paso). **Alternativa considerada:** dejar el scroll custom (rechazada: es la divergencia que el usuario quiere eliminar). Se conservan el scroll-snap y la estructura HTML existentes.

### D4. Formato de precio con `formatPrice`/`parsePrice` canónicos
Importar `parsePrice`/`formatPrice` de `src/utils/price.ts` en todos los componentes de catálogo que hoy renderizan `$` + precio crudo, y eliminar las 3 definiciones locales duplicadas de `parsePrice` (ListarProductos.astro, ListarProductos.jsx, pedido.astro). `formatPrice` acepta el valor ya parseado y lo renderiza con separadores/moneda consistentes; `parsePrice` normaliza los formatos mixtos del CSV (`1.199` vs `5900`).

### D5. Orden de `relacionados` preservado
- **CSV** (`loadProducts`): después de filtrar el catálogo por los IDs de `relacionados`, reordenar el resultado según el orden de aparición en el string de IDs.
- **Supabase** (`loadRelatedProducts`): en vez de depender del orden arbitrario de `.in()`, aplicar el mismo reordenamiento en JS por el array de IDs declarado. Esto evita un `order by` CASE complejo en SQL y centraliza la lógica.

## Risks / Trade-offs

- **[Cambio visual de 1200px → 1000px en producto/carrito y 1100px → 1000px en carruseles]** → Mitigación: es un re-encuadre menor del contenido; los fondos siguen a full width. Reversible cambiando el valor del token. El banner no se toca.
- **[Quitar el motor rAF de relacionados]** → Mitigación: el scroll-snap del contenedor se mantiene, y el scroll nativo `smooth` es el mismo que el resto de carruseles; se valida en desktop y mobile.
- **[Cambiar el formato de precios puede alterar strings visibles]** → Mitigación: se usa exactamente la misma función canónica que ya usa el carrito/pedido, asegurando consistencia total de formato.
- **[Reordenar `relacionados` en Supabase puede destapar IDs inexistentes]** → Mitigación: los IDs no encontrados se omiten como hoy; solo cambia el orden de los presentes.