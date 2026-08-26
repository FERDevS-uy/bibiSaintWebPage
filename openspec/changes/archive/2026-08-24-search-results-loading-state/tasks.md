## 1. Estados de carga y error en ListarProductos

- [x] 1.1 Extraer la descarga de `productos.json` a una función reutilizable (`loadCatalog`) con `then/catch`, y setear estados `loading`/`error` (`loading` inicial en `true`)
- [x] 1.2 Agregar el estado `error` y el render condicional que prioriza `loading` → loader, `error` → mensaje + botón reintento, success → grilla/mensajes vacíos actuales
- [x] 1.3 Implementar el reintento: al pulsar el botón, volver a `loading=true`/`error=false` y re-ejecutar `loadCatalog`

## 2. Loader de marca y accesibilidad

- [x] 2.1 Crear el spinner (anillo ~42px, borde rojo `#c11010` con segmento amarillo `#f0b13e`, rotación con `@keyframes`) centrado en el eje de contenido
- [x] 2.2 Reservar el área del loader con altura mínima para evitar saltos de layout al aparecer/desaparecer
- [x] 2.3 Envolver el loader en un contenedor `role="status"`/`aria-live="polite"` con texto alternativo legible “Cargando productos” (clase sr-only)
- [x] 2.4 Agregar `@media (prefers-reduced-motion: reduce)` para detener la rotación del anillo

## 3. Verificación

- [x] 3.1 Probar en `pnpm dev`: `/search/page/1/?q=a` nunca muestra “Sin Productos” ni el mensaje vacío durante la carga
- [x] 3.2 Probar entrada sin `?q=` con catálogo vacío: muestra loader y luego el mensaje de “sin productos” solo tras la carga
- [x] 3.3 Probar el estado de error (DevTools → Offline) y que el reintento vuelve al loader y completa la descarga
- [x] 3.4 Confirmar que sort y paginación siguen funcionando tras la carga
- [x] 3.5 Ejecutar `pnpm build` y confirmar que no hay errores