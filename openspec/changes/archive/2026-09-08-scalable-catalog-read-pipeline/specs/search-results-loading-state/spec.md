## MODIFIED Requirements

### Requirement: Loader durante la carga inicial del catálogo
La página de resultados de búsqueda SHALL mostrar un indicador de carga visible mientras solicita la primera página de resultados server-side. Durante ese estado, la página SHALL ocultar la grilla, el paginador y cualquier mensaje de lista vacía. El indicador SHALL permanecer visible tanto cuando la URL trae `?q=` como cuando no trae query.

#### Scenario: Carga inicial sin query
- **WHEN** el usuario ingresa a la página de resultados sin `?q=`
- **THEN** se muestra el indicador de carga mientras se solicita la primera página y no se muestra “sin productos” prematuramente

#### Scenario: Carga inicial con query
- **WHEN** el usuario ingresa a `/search/page/1/?q=<término>`
- **THEN** se muestra el indicador mientras se solicita la primera página filtrada

#### Scenario: Carga inicial con resultados
- **WHEN** la primera página server-side termina y contiene coincidencias
- **THEN** el indicador desaparece y se muestra la grilla con el estado de paginación recibido

#### Scenario: Carga inicial sin coincidencias
- **WHEN** la primera página server-side termina sin coincidencias
- **THEN** el indicador desaparece y se muestra el mensaje de resultados vacíos

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
