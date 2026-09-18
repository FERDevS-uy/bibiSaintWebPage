# Igualar tarjetas de búsqueda con categorías

## Objetivo
Hacer que las tarjetas de resultados de búsqueda usen la misma composición visible que las tarjetas de categorías, especialmente en móvil.

## Problema y por qué
La búsqueda usa `ItemProductBox.jsx` y una grilla propia, mientras las categorías usan `ItemProductoBox.astro` y `#products-list-grid`. Aunque ambas tarjetas comparten gran parte del diseño, la búsqueda conserva una grilla con padding extra y reglas CSS duplicadas. El ajuste anterior solo evitó que el CTA se partiera; no eliminó la diferencia de tamaño y composición señalada por el usuario.

## Alcance autorizado
- Igualar la estructura de grilla, proporción de imagen y alturas de tarjeta de búsqueda a categorías.
- Preservar contenido, comportamiento de búsqueda y carrito.
- No modificar el diseño desktop salvo donde la regla compartida lo requiera.

## Restricciones
- No cambiar textos ni datos de producto.
- TDD: desactivado; no existe configuración explícita. Runner: `pnpm test:unit`.

## Tareas
- [x] SEARCH-1 — Comparar las vistas reales y las implementaciones de búsqueda/categoría.
  - Evidencia: `/search?q=Buzo` renderiza `ListarProductos.jsx` con `<ul>` propio y padding horizontal; `/categories/Ropa` usa `ListarProductos.astro` con `#products-list-grid`. Las reglas de tarjeta están duplicadas.
- [x] SEARCH-2 — Hacer que la grilla y la tarjeta React adopten las dimensiones de la variante Astro.
  - Evidencia: la búsqueda ahora usa `#products-list-grid` sin padding extra; la tarjeta React adopta la relación de imagen y alturas de la tarjeta Astro.
- [x] SEARCH-3 — Construir y comprobar la paridad visual en móvil antes de desplegar.
  - Evidencia: `pnpm test:unit` (231/231), `pnpm build`, `git diff --check` y el despliegue dev completaron correctamente; la ruta desplegada contiene `#products-list-grid`, igual que categorías.
- [x] SEARCH-4 — Aplicar en React la variante `addToCartNeedsSize` usada por la tarjeta Astro.
  - Evidencia: se copiaron exactamente los estados amarillo y hover de `AddToCartButton.astro`; el CSS construido los contiene y dev se desplegó en la versión `c3f60fb9-53a0-40c5-b95b-e4e482f5aa4a`.
- [x] SEARCH-5 — Copiar la base `addToCart` de Astro al stylesheet React y eliminar el override móvil divergente.
  - Evidencia: Playwright local confirmó igualdad exacta del primer resultado de búsqueda y categoría: tarjeta `187px × 345.547px`; imagen `187px × 187px`; CTA amarillo `163px × 42px`, padding `10px 8px`, radio `4px`, display flex; grilla `#products-list-grid`, padding `0`, gap `16px`.

## Criterios de aceptación
- En móvil, las tarjetas de búsqueda y de categoría tienen la misma anchura útil, proporción de imagen, espaciado y CTA.
- El botón no domina visualmente la tarjeta ni cambia su comportamiento.
- Build y pruebas aplicables pasan.

## Progreso y evidencia
- Playwright confirmó paridad exacta entre la primera tarjeta móvil de `/search?q=Buzo` y `/categories/Ropa` en anchura, altura, imagen, CTA, color, espaciado y grilla.
- No se desplegó este último arreglo; el servidor local queda disponible para validación del usuario.

## Próximo paso
- Esperar validación del usuario en el enlace local. Desplegar una única vez solo si el usuario lo solicita.
