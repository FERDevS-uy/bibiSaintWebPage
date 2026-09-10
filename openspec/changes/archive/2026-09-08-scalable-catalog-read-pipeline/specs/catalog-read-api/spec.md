## Purpose

Proporcionar lecturas públicas de catálogo acotadas y predecibles, capaces de servir un catálogo grande sin materializarlo completo en el Worker ni en el navegador.

## ADDED Requirements

### Requirement: Lectura paginada de productos
La API pública SHALL devolver como máximo el tamaño de página solicitado dentro de límites configurados y SHALL soportar un cursor opaco para continuar desde el último elemento. El orden SHALL ser estable y determinista mediante una clave de orden y un identificador de desempate.

#### Scenario: Primera página
- **WHEN** se solicita una categoría sin cursor
- **THEN** la respuesta devuelve solo la primera página, `hasMore` y un `nextCursor` cuando existan más resultados

#### Scenario: Página siguiente
- **WHEN** se solicita una categoría con un cursor válido
- **THEN** la respuesta continúa después del elemento representado por el cursor sin repetir ni saltar elementos bajo un snapshot lógico estable

#### Scenario: Cursor inválido
- **WHEN** se presenta un cursor malformado, expirado o incompatible con los filtros
- **THEN** la API responde con un error de cliente y no ejecuta una consulta sin límites

### Requirement: Filtros y proyección acotados
Las lecturas de listado SHALL aplicar categoría, subcategoría, estado, oferta, búsqueda y ordenamiento en el origen de datos. La respuesta de listado SHALL incluir únicamente los campos necesarios para renderizar la grilla y SHALL excluir campos pesados no solicitados.

#### Scenario: Filtro por categoría
- **WHEN** se solicita una categoría o subcategoría
- **THEN** todos los elementos devueltos cumplen el filtro y ningún producto fuera del filtro se procesa en el Worker

#### Scenario: Proyección de grilla
- **WHEN** se solicita una página para una grilla
- **THEN** la respuesta contiene el resumen de producto requerido y no descarga el catálogo completo, descripciones innecesarias ni relaciones no solicitadas

### Requirement: Categorías y conteos precalculados
La API de categorías SHALL devolver categorías, subcategorías y conteos desde un modelo de lectura actualizado por sincronización. Los nombres visuales y reglas de normalización SHALL estar resueltos antes de la lectura pública.

#### Scenario: Categorías disponibles
- **WHEN** se solicita el manifiesto de categorías
- **THEN** se devuelve una colección acotada con conteos consistentes y subcategorías visuales, sin iterar productos en el Worker

#### Scenario: Actualización de catálogo
- **WHEN** una sincronización modifica productos, categorías o estado activo
- **THEN** el modelo de categorías se actualiza antes de publicar una nueva versión de lectura

### Requirement: Taxonomía visible explícita
El sistema SHALL permitir definir categorías y subcategorías visibles independientemente de que tengan productos activos, con nombre, orden y estado de visibilidad persistidos. La proyección de productos SHALL asignar la taxonomía display durante la sincronización y no mediante inferencia por request.

#### Scenario: Categoría Tecno configurada
- **WHEN** se consulta la taxonomía y una subcategoría Tecno está configurada como visible
- **THEN** se devuelve en el orden definido aunque su conteo sea cero

#### Scenario: Producto Tecno sincronizado
- **WHEN** un producto Tecno cambia de nombre o categoría de origen
- **THEN** su subcategoría display se resuelve durante la proyección y las lecturas posteriores no ejecutan regex de inferencia en el Worker

### Requirement: Búsqueda tolerante y paginada
La búsqueda SHALL ejecutarse en el origen de datos sobre texto normalizado, SHALL tolerar errores ortográficos razonables y SHALL devolver resultados paginados con ranking determinista. La API SHALL aplicar límites estrictos y no SHALL devolver el catálogo completo.

#### Scenario: Error ortográfico
- **WHEN** el usuario busca un término con una variación ortográfica cercana al nombre de un producto
- **THEN** productos relevantes pueden aparecer en los primeros resultados sin descargar ni indexar el catálogo completo en el navegador

#### Scenario: Consulta de múltiples palabras
- **WHEN** el usuario busca varias palabras del nombre o descripción
- **THEN** la respuesta prioriza documentos que contienen los términos relevantes y mantiene el cursor/ranking estable

#### Scenario: Término demasiado corto
- **WHEN** la consulta tiene menos de tres caracteres
- **THEN** la API aplica la política definida para prefijo/mínimo y nunca ejecuta una búsqueda ilimitada

### Requirement: Fallback seguro y acotado
Un fallo del modelo de lectura SHALL producir un error observable o un fallback explícitamente limitado. El fallback CSV SHALL estar deshabilitado por defecto en producción mediante `ENABLE_CSV_FALLBACK=false` y SHALL NOT activarse automáticamente por un fallo puntual de Supabase. Ningún fallback SHALL descargar ni recorrer el catálogo completo dentro de una petición pública de producción.

#### Scenario: Read model no disponible
- **WHEN** el modelo de lectura no puede consultarse
- **THEN** la API responde con error temporal o utiliza una fuente alternativa paginada y limitada, sin ejecutar un scan completo en JavaScript

#### Scenario: Fallback CSV explícito
- **WHEN** un operador activa `ENABLE_CSV_FALLBACK=true` en un entorno autorizado
- **THEN** la ruta de recuperación queda disponible con límites y observabilidad explícitos, sin cambiar el valor por defecto de producción
