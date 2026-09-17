# Search Results Loading State Specification

## Purpose

Define cómo la página de resultados de búsqueda presenta los estados transitorios de carga, error y resultados vacíos, garantizando que nunca se muestre "sin resultados" mientras el catálogo aún se está descargando.

## Requirements

### Requirement: Loader durante la carga inicial del catálogo
La página de resultados de búsqueda SHALL mostrar un indicador de carga visible mientras solicita la primera página de resultados server-side. Durante ese estado, la página SHALL ocultar la grilla, el paginador y cualquier mensaje de lista vacía. El indicador SHALL permanecer visible tanto cuando la URL trae `?q=` como cuando no trae query.

#### Scenario: Carga inicial sin query
- **WHEN** el usuario ingresa a la página de resultados sin `?q=`
- **THEN** se muestra el indicador de carga mientras se solicita la primera página y no se muestra "sin productos" prematuramente

#### Scenario: Carga inicial con query
- **WHEN** el usuario ingresa a `/search/page/1/?q=<término>`
- **THEN** se muestra el indicador mientras se solicita la primera página filtrada

#### Scenario: Carga inicial con resultados
- **WHEN** la primera página server-side termina y contiene coincidencias
- **THEN** el indicador desaparece y se muestra la grilla con el estado de paginación recibido

#### Scenario: Carga inicial sin coincidencias
- **WHEN** la primera página server-side termina sin coincidencias
- **THEN** el indicador desaparece y se muestra el mensaje de resultados vacíos

### Requirement: Loader con identidad visual de marca y accesible
El indicador de carga SHALL ser un anillo circular con los colores de marca (rojo primario con segmento de acento amarillo), centrado en el área de resultados, con un tamaño discreto y una animación de rotación suave y continua. El loader SHALL estar contenido en un área reservada con altura mínima para evitar saltos de layout al aparecer o desaparecer. La página SHALL anunciar el estado de carga a tecnologías asistivas mediante una región `aria-live` con un texto accesible legible, por ejemplo "Cargando productos". Cuando el usuario tenga `prefers-reduced-motion` activo, el anillo SHALL permanecer visible sin animación de rotación.

#### Scenario: Loader visible durante la carga
- **WHEN** el catálogo se está descargando
- **THEN** el usuario ve un anillo rojo con segmento amarillo rotando, centrado en un área reservada del mismo alto que el resultado de la carga

#### Scenario: Anuncio accesible de carga
- **WHEN** el indicador de carga aparece
- **THEN** una región con `aria-live` anuncia un texto alternativo legible, como "Cargando productos", sin depender solo del giro del anillo

#### Scenario: Movimiento reducido
- **WHEN** el usuario tiene `prefers-reduced-motion` activo y el catálogo se está descargando
- **THEN** el anillo se muestra visible pero sin animación de rotación

### Requirement: Estado de error con reintento
Si la consulta server-side falla, la página SHALL ocultar el indicador y mostrar un mensaje claro con reintento. El reintento SHALL volver a solicitar el mismo criterio sin duplicar peticiones concurrentes.

#### Scenario: Error de búsqueda
- **WHEN** falla la solicitud paginada
- **THEN** se muestra el error y un control de reintento

#### Scenario: Error de descarga del catálogo
- **WHEN** falla la solicitud de resultados server-side
- **THEN** el indicador de carga desaparece y se muestra un mensaje de error con un botón de reintento

#### Scenario: Reintento
- **WHEN** el usuario activa el reintento
- **THEN** se restaura el estado de carga y se repite una única solicitud para la misma clave

#### Scenario: Reintento tras error
- **WHEN** el usuario activa el control de reintento
- **THEN** se vuelve a mostrar el indicador de carga y se reintenta la consulta paginada

### Requirement: Mensajes de resultados vacíos solo tras carga exitosa
Los mensajes de estado vacío SHALL mostrarse únicamente después de una descarga exitosa del catálogo. Sin query y sin productos, la página SHALL mostrar el mensaje de "sin productos". Con query sin coincidencias, la página SHALL mostrar el mensaje de resultados no encontrados citando el término buscado. Ninguno de estos mensajes SHALL aparecer durante el estado de carga ni durante un error de descarga.

#### Scenario: Catálogo vacío sin query
- **WHEN** el catálogo se descarga exitosamente, no hay `?q=` y no hay productos
- **THEN** se muestra el mensaje de "sin productos"

#### Scenario: Query sin coincidencias
- **WHEN** el catálogo se descarga exitosamente y ningún producto coincide con el término buscado
- **THEN** se muestra el mensaje de resultados no encontrados citando el término

#### Scenario: Sin mensajes vacíos durante la carga
- **WHEN** el catálogo aún se está descargando, haya o no `?q=`
- **THEN** no se muestra ningún mensaje de "sin productos" ni de resultados no encontrados

### Requirement: Cache cliente de páginas
El cliente SHALL cachear páginas por combinación de query, filtros, orden y cursor, y SHALL reutilizar una solicitud en vuelo para la misma clave. No SHALL descargar ni indexar el catálogo completo en el navegador.

#### Scenario: Peticiones duplicadas
- **WHEN** dos componentes solicitan simultáneamente la misma página
- **THEN** comparten el mismo resultado y solo se ejecuta una solicitud de red

#### Scenario: Cambio de query
- **WHEN** cambia el término o filtro de búsqueda
- **THEN** se usa una nueva clave, se reinicia el cursor y no se mezclan resultados de la búsqueda anterior

#### Scenario: Tolerancia a tipeos
- **WHEN** el usuario introduce un término con un error ortográfico cercano
- **THEN** la interfaz muestra los resultados server-side relevantes sin construir un índice Fuse con el catálogo completo
