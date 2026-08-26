# Estados de carga, vacío y error en resultados de búsqueda

## Why

La página `/search/page/1/?q=<término>` hidrata `ListarProductos.jsx` con `productos=[]`; durante ese primer render `paginated` también está vacío y el componente muestra “Sin Productos” (o el mensaje de resultados vacíos) antes de que termine `fetch("/productos.json")`. Ese destello engaña al usuario: le dice que no hay resultados cuando todavía está cargando.

## What Changes

- Estado de carga inicial explícito en `ListarProductos.jsx`: mientras se descarga el catálogo, se muestra un loader y se ocultan grilla, paginador y mensajes vacíos.
- El loader se muestra también cuando no hay `?q=` (evita el “Sin Productos” falso en cualquier entrada a `/search`).
- Estado de error con reintento: si falla `fetch("/productos.json")`, se muestra un mensaje claro y un botón para volver a intentar (regresando al estado de carga).
- Los mensajes vacíos actuales (`Sin Productos`, `No se encontraron resultados para "<q>"`) se conservan y solo se muestran después de una carga exitosa.
- Loader con identidad de marca (anillo rojo con segmento amarillo), centrado en un área reservada para evitar saltos de layout, accesible (`aria-live="polite"` + texto oculto) y respetuoso de `prefers-reduced-motion`.
- No se modifica el autocomplete del header (`SearchInput.astro`) ni la página `/search/index.astro`.
- **BREAKING**: ninguno. Cambia solo el comportamiento visual de estados transitorios.

## Capabilities

### New Capabilities

- `search-results-loading-state`: comportamiento de presentación de la página de resultados de búsqueda durante la carga inicial del catálogo, ante errores de descarga y al mostrar resultados vacíos (nunca presentar “sin resultados” como estado de carga).

### Modified Capabilities

Ninguna — no cambian requisitos de `openspec/specs/visual-consistency/spec.md`.

## Impact

**Código afectado:**
- `code/src/components/ListarProductos.jsx` — nuevo estado `loading`/`error`, render condicional del loader/error/mensajes vacíos/grilla, y estilos locales para el spinner. Único archivo de la implementación.

**Dependencias/sistemas tocados:**
- `productos.json` (asset estático del build; no cambia).
- Ningún endpoint, API o configuración se modifica.

**Riesgos:**
- **Breve parpadeo al reintentar**: mitigado volviendo al estado `loading` antes de re-fetch.
- **Espacio reservado demasiado alto/bajo**: se dimensiona con una altura mínima razonable para una pantalla corta y se revisa en móvil.
- **Regresión del sort/paginación**: el ordenamiento y la paginación actuales siguen operando sobre los mismos datos una vez cargados; se verifica por criterios de aceptación.