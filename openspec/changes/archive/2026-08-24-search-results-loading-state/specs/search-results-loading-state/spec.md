## Purpose

Define cómo la página de resultados de búsqueda presenta los estados transitorios de carga, error y resultados vacíos, garantizando que nunca se muestre “sin resultados” mientras el catálogo aún se está descargando.

## ADDED Requirements

### Requirement: Loader durante la carga inicial del catálogo
La página de resultados de búsqueda SHALL mostrar un indicador de carga visible en cuanto se monta, mientras se descarga el catálogo de productos. Durante ese estado, la página SHALL ocultar la grilla de resultados, el paginador y cualquier mensaje de lista vacía o de resultados no encontrados. El indicador SHALL permanecer visible tanto cuando la URL trae `?q=` como cuando no trae query.

#### Scenario: Carga inicial sin query
- **WHEN** el usuario ingresa a la página de resultados de búsqueda sin `?q=`
- **THEN** se muestra el indicador de carga y no se muestra ningún mensaje de “sin productos” hasta que el catálogo termina de descargarse

#### Scenario: Carga inicial con query
- **WHEN** el usuario ingresa a `/search/page/1/?q=<término>`
- **THEN** se muestra el indicador de carga y no se muestra el mensaje de resultados vacíos hasta que el catálogo termina de descargarse

#### Scenario: Carga inicial con resultados
- **WHEN** el catálogo termina de descargarse y hay productos que coinciden con la búsqueda
- **THEN** el indicador de carga desaparece y se muestra la grilla de resultados

#### Scenario: Carga inicial sin coincidencias
- **WHEN** el catálogo termina de descargarse y ningún producto coincide con la búsqueda
- **THEN** el indicador de carga desaparece y se muestra el mensaje de resultados vacíos

### Requirement: Loader con identidad visual de marca y accesible
El indicador de carga SHALL ser un anillo circular con los colores de marca (rojo primario con segmento de acento amarillo), centrado en el área de resultados, con un tamaño discreto y una animación de rotación suave y continua. El loader SHALL estar contenido en un área reservada con altura mínima para evitar saltos de layout al aparecer o desaparecer. La página SHALL anunciar el estado de carga a tecnologías asistivas mediante una región `aria-live` con un texto accesible legible, por ejemplo “Cargando productos”. Cuando el usuario tenga `prefers-reduced-motion` activo, el anillo SHALL permanecer visible sin animación de rotación.

#### Scenario: Loader visible durante la carga
- **WHEN** el catálogo se está descargando
- **THEN** el usuario ve un anillo rojo con segmento amarillo rotando, centrado en un área reservada del mismo alto que el resultado de la carga

#### Scenario: Anuncio accesible de carga
- **WHEN** el indicador de carga aparece
- **THEN** una región con `aria-live` anuncia un texto alternativo legible, como “Cargando productos”, sin depender solo del giro del anillo

#### Scenario: Movimiento reducido
- **WHEN** el usuario tiene `prefers-reduced-motion` activo y el catálogo se está descargando
- **THEN** el anillo se muestra visible pero sin animación de rotación

### Requirement: Estado de error con reintento
Si la descarga del catálogo falla, la página de resultados de búsqueda SHALL ocultar el indicador de carga y mostrar un mensaje de error claro con un control para reintentar. Al activar el reintento, la página SHALL volver a entrar en el estado de carga y repetir la descarga. El mensaje de error no SHALL mostrarse en ninguna otra circunstancia.

#### Scenario: Error de descarga del catálogo
- **WHEN** la descarga de `productos.json` falla
- **THEN** el indicador de carga desaparece y se muestra un mensaje de error con un botón de reintento

#### Scenario: Reintento tras error
- **WHEN** el usuario activa el control de reintento
- **THEN** se vuelve a mostrar el indicador de carga y se reintenta la descarga del catálogo

### Requirement: Mensajes de resultados vacíos solo tras carga exitosa
Los mensajes de estado vacío SHALL mostrarse únicamente después de una descarga exitosa del catálogo. Sin query y sin productos, la página SHALL mostrar el mensaje de “sin productos”. Con query sin coincidencias, la página SHALL mostrar el mensaje de resultados no encontrados citando el término buscado. Ninguno de estos mensajes SHALL aparecer durante el estado de carga ni durante un error de descarga.

#### Scenario: Catálogo vacío sin query
- **WHEN** el catálogo se descarga exitosamente, no hay `?q=` y no hay productos
- **THEN** se muestra el mensaje de “sin productos”

#### Scenario: Query sin coincidencias
- **WHEN** el catálogo se descarga exitosamente y ningún producto coincide con el término buscado
- **THEN** se muestra el mensaje de resultados no encontrados citando el término

#### Scenario: Sin mensajes vacíos durante la carga
- **WHEN** el catálogo aún se está descargando, haya o no `?q=`
- **THEN** no se muestra ningún mensaje de “sin productos” ni de resultados no encontrados