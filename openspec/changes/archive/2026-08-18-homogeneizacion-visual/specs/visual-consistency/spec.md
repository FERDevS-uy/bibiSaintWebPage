## Purpose

Define el comportamiento de presentación coherente del catálogo y la página principal: color de navegación de los carruseles, slides del banner, un único eje de alineación de contenido, comportamiento de desplazamiento de carruseles, formato canónico de precios y orden de los productos recomendados.

## ADDED Requirements

### Requirement: Flechas de carrusel de marca
Los carruseles de productos del home (novedades, destacados, ofertas) SHALL mostrar las flechas de navegación con el color definido por el token `--line-color`, de modo que el usuario perciba el mismo color de navegación que en el carrusel del banner.

#### Scenario: Carrusel de productos con flechas de marca
- **WHEN** el usuario ve cualquiera de los carruseles de productos del home
- **THEN** las flechas de navegación usan el color del token `--line-color` (amarillo de marca), idéntico al de las flechas del banner

### Requirement: Slides del carrusel del banner
El carrusel del banner SHALL mostrar solo los slides definidos en su conjunto de imágenes vigente. El primer slide (`banner1`) se elimina del array de imágenes, y no SHALL aparecer en ninguna rotación.

#### Scenario: Primer slide eliminado
- **WHEN** el carrusel del banner carga
- **THEN** el slide correspondiente a `banner1` no se muestra ni aparece en la secuencia de rotación

#### Scenario: Resto de slides intactos
- **WHEN** el carrusel del banner rota
- **THEN** los slides `banner2` a `banner5` se muestran en su orden original y sin alteraciones visuales

### Requirement: Eje único de alineación de contenido
El contenedor horizontal del menú de instrucciones (`instrucciones-inner`) SHALL ser la referencia de alineación de toda la página. Su borde izquierdo y su borde derecho SHALL definir los dos ejes verticales de contenido: todo el contenido principal que aparezca debajo del banner SHALL quedar contenido exactamente entre esos dos límites. Debe existir un único contenedor reutilizable (`width:100%; max-width:1000px; margin:0 auto; box-sizing:border-box`, con el padding interno contemplado dentro del ancho) y ningún componente SHALL definir un `max-width`, `padding` o ancho propio que genere desplazamientos horizontales. El header SHALL alinear su contenido real con los límites del menú de instrucciones (corrigiendo el box-model, no tapando el desplazamiento con padding visual). Las categorías SHALL usar el mismo contenedor, quedar centradas, distribuir sus elementos de forma equilibrada dentro del ancho de referencia y no comprimirse en el centro ni exceder esos límites. El carrusel del banner SHALL mantener sus dimensiones actuales y ocupar todo el ancho del viewport, sin limitarse al contenedor central.

#### Scenario: Contenido debajo del banner dentro de los límites
- **WHEN** el usuario ve el home en desktop
- **THEN** las secciones de productos (p. ej. "¡Novedades!", "¡Destacados!", "¡Ofertas!") y sus tarjetas quedan contenidas exactamente entre el borde izquierdo y el borde derecho del menú de instrucciones

#### Scenario: Header alineado con la referencia
- **WHEN** el usuario ve el header del home en desktop
- **THEN** el contenido real del header (logo y navegación) comienza y termina en los mismos límites que el menú de instrucciones, sin desfases provocados por padding del contenedor

#### Scenario: Categorías alineadas y distribuidas
- **WHEN** el usuario ve el menú de categorías del header en desktop
- **THEN** las categorías quedan centradas dentro del ancho de referencia, con sus elementos distribuidos de forma equilibrada, sin comprimirse en el centro ni extenderse más allá de los límites del menú de instrucciones

#### Scenario: Sin anchos propios por sección
- **WHEN** se inspeccionan los contenedores de las secciones alineadas
- **THEN** ninguno define un `max-width`, `padding` o ancho propio distinto del contenedor reutilizable que desplace su contenido del eje común

#### Scenario: Carruseles alineados al eje
- **WHEN** el usuario ve los carruseles de productos del home en desktop
- **THEN** los bordes de los carruseles coinciden con los límites del menú de instrucciones

#### Scenario: Logo del footer alineado
- **WHEN** el usuario ve el footer en desktop
- **THEN** el logo y la primera columna del footer inician sobre el mismo eje izquierdo del menú de instrucciones

#### Scenario: Banner a ancho completo sin limitar
- **WHEN** el usuario ve el carrusel del banner
- **THEN** ocupa todo el ancho del viewport y mantiene sus dimensiones y contenido actuales, sin verse limitado al contenedor central

#### Scenario: Fondos a full width
- **WHEN** una sección tiene un fondo visual (p. ej. menú de instrucciones)
- **THEN** el fondo se extiende al ancho completo del viewport mientras su contenido interno respeta el eje único

### Requirement: Comportamiento de desplazamiento de carruseles
El carrusel de productos relacionados SHALL desplazarse con el mismo comportamiento de navegación que los carruseles de productos del home: mismo número de ítems por paso y mismo motor de desplazamiento, de modo que la interacción sea idéntica en toda la web.

#### Scenario: Scroll de relacionados igual al home
- **WHEN** el usuario hace clic en una flecha del carrusel de productos relacionados
- **THEN** el carrusel avanza el mismo número de ítems y con la misma suavidad que los carruseles del home

### Requirement: Formato canónico de precios
Todos los precios mostrados en el catálogo, home, categorías, búsqueda, ofertas, producto y carrito SHALL formatearse con las funciones canónicas `formatPrice`/`parsePrice` de `src/utils/price.ts`. No SHALL existir implementaciones duplicadas de parseo ni renders con `$` concatenado a precio crudo.

#### Scenario: Precio formateado consistentemente
- **WHEN** el usuario ve un precio en cualquier página del catálogo
- **THEN** el precio se muestra con el formato canónico (mismos separadores y moneda) sin importar si el dato proviene de CSV o de Supabase

#### Scenario: Sin duplicación de lógica de parseo
- **WHEN** se busca en el código la lógica de parseo de precios
- **THEN** existe una única implementación canónica importada desde `src/utils/price.ts` y ningún archivo la redefine localmente

### Requirement: Orden de productos relacionados
La lista de productos recomendados de una página de producto SHALL mostrarse respetando el orden en que sus IDs aparecen en el campo `relacionados` del producto, tanto cuando los datos provienen de CSV como de Supabase.

#### Scenario: Orden respetado desde CSV
- **WHEN** los datos provienen del CSV y el producto declara `relacionados` como una secuencia de IDs
- **THEN** los productos relacionados se renderizan en ese mismo orden

#### Scenario: Orden respetado desde Supabase
- **WHEN** los datos provienen de Supabase y el producto tiene IDs relacionados
- **THEN** los productos relacionados se renderizan siguiendo el orden declarado y no el orden de catálogo ni un orden arbitrario de base de datos