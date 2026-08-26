## Purpose

Permite sincronizar el catálogo de Nuvex desde el panel admin con un preview read-only de cambios, un apply firmado y revalidado, y manejo explícito de precios vacíos y productos ausentes, sin exponer credenciales al navegador.

## ADDED Requirements

### Requirement: Login y scraping de Nuvex exclusivamente server-side

El sistema SHALL ejecutar el login contra Nuvex y la obtención del catálogo exclusivamente en el servidor, usando credenciales server-only (`NUVEX_USER_EMAIL`, `NUVEX_USER_PASS`). El navegador SHALL NOT recibir credenciales, cookies ni HTML autenticado de Nuvex.

#### Scenario: Preview solicitado desde el panel
- **WHEN** un admin autenticado solicita el preview de Nuvex
- **THEN** el servidor hace login en Nuvex con secretos server-only
- **AND** el navegador recibe únicamente el plan de cambios y su resumen

#### Scenario: Credenciales faltantes
- **WHEN** el servidor no tiene configuradas las credenciales de Nuvex
- **THEN** el preview responde con error claro y no ejecuta login

### Requirement: Preview read-only contra Supabase

El sistema SHALL generar un preview que compare el catálogo de Nuvex contra `products` en Supabase y clasifique cada producto como nuevo, actualizado, sin cambios, ausente en Nuvex, o advertencia. El preview SHALL NOT escribir en Supabase.

#### Scenario: Catálogo comparado
- **WHEN** el preview obtiene el catálogo de Nuvex
- **THEN** cada producto se clasifica según su estado relativo a Supabase
- **AND** el preview no modifica ningún registro

#### Scenario: Producto con precio vacío
- **WHEN** un producto de Nuvex no expone precio (ej. `product_id=477` sin sesión o sin precio)
- **THEN** el producto aparece en el grupo de advertencias con su estado de identificación
- **AND** no se propone ningún cambio de precio sobre el registro existente

### Requirement: Identificación por ID con fallback por nombre

El sistema SHALL identificar productos Nuvex primero por su `product_id` numérico tal como existe en Supabase (sin prefijo `nuvex-`). Si no hay match por ID, SHALL proponer una sugerencia por nombre normalizado usando un algoritmo determinista con umbral mínimo de similitud y rechazo de empates. Toda coincidencia por nombre exige confirmación explícita antes de actualizar.

#### Scenario: Match por ID
- **WHEN** el `product_id` de Nuvex coincide con un producto de Supabase
- **THEN** el cambio se aplica sobre ese producto sin pasos adicionales

#### Scenario: Solo coincidencia por nombre
- **WHEN** no hay producto con ese `product_id` pero existe un producto con nombre similar
- **THEN** se muestra como "coincidencia inferida" con el producto candidato y su puntaje de similitud
- **AND** solo se actualiza si el admin confirma la coincidencia explícitamente

#### Scenario: Empate por nombre
- **WHEN** varios productos de Supabase superan el umbral de similitud para el mismo nombre de Nuvex
- **THEN** el sistema rechaza la coincidencia automática y pide elegir/confirmar manualmente
- **AND** no se aplica ninguna actualización automática sobre esos productos

### Requirement: Precio vacío no sobrescribe precio existente

El sistema SHALL conservar el precio actual de un producto cuando Nuvex devuelve precio vacío. El admin SHALL poder cargar un precio temporal que se persiste como precio actual y que el próximo precio válido de Nuvex puede reemplazar. Todo precio manual SHALL validarse en servidor como entero monetario positivo dentro de límites configurados.

#### Scenario: Producto existente sin precio nuevo
- **WHEN** Nuvex devuelve precio vacío para un producto que ya tiene precio
- **THEN** se mantiene el precio anterior
- **AND** el preview muestra la advertencia con el precio actual

#### Scenario: Precio manual temporal
- **WHEN** el admin carga un precio manual para un producto sin precio de Nuvex
- **THEN** el precio se valida en servidor (entero monetario positivo dentro de límites)
- **AND** se persiste como precio actual
- **AND** un precio válido posterior de Nuvex lo reemplaza en un nuevo apply

#### Scenario: Precio manual inválido
- **WHEN** el admin carga un precio no numérico, negativo, cero o fuera de los límites
- **THEN** el sistema rechaza el valor y lo marca como error en la UI sin aplicarlo

### Requirement: Productos ausentes no se desactivan automáticamente

El sistema SHALL listar los productos existentes que no aparecen en Nuvex en una sección separada y SHALL NOT desactivarlos. La desactivación (`active = false`) solo ocurre con confirmación grupal explícita, con límite máximo de desactivaciones por apply y umbral de caída anormal del catálogo que aborta el proceso.

#### Scenario: Producto ausente en Nuvex
- **WHEN** un producto de Supabase no aparece en el catálogo de Nuvex
- **THEN** aparece en la sección "Ausentes en Nuvex" con su estado actual
- **AND** no se cambia su `active`

#### Scenario: Confirmación grupal de desactivación
- **WHEN** el admin selecciona uno o más productos ausentes y confirma la desactivación
- **THEN** esos productos pasan a `active = false`
- **AND** el apply registra el resultado de la desactivación

#### Scenario: Caída anormal del catálogo
- **WHEN** la cantidad de productos detectados como ausentes supera un umbral configurable respecto del total de productos Nuvex conocidos
- **THEN** el preview/apply aborta y muestra un error
- **AND** no se realiza ninguna desactivación automática ni confirmada

### Requirement: Lectura autorizada de productos inactivos

El sistema SHALL leer el catálogo existente de Supabase (incluidos productos con `active = false`) de forma autorizada server-side, de modo que el preview pueda distinguir correctamente productos nuevos, existentes inactivos y ausentes. El preview SHALL NOT depender de la lectura pública con anon key para detectar productos inactivos.

#### Scenario: Producto previamente desactivado
- **WHEN** un producto existe en Supabase con `active = false` y vuelve a aparecer en Nuvex
- **THEN** el preview lo identifica como existente (reactivable/actualizable), no como nuevo
- **AND** el apply solo lo modifica si fue confirmado

#### Scenario: Lectura autorizada falla
- **WHEN** el servidor no puede leer el catálogo con privilegios autorizados
- **THEN** el preview responde con error y no genera un plan potencialmente incorrecto

### Requirement: Apply firmado y revalidado con decision set

El sistema SHALL aplicar cambios únicamente a partir de un preview firmado (HMAC), vigente (TTL) y revalidado contra Nuvex justo antes de escribir. El token SHALL cubrir un `decisionSet` (actualizaciones confirmadas, coincidencias por nombre, precios manuales temporales, desactivaciones) y el servidor SHALL validar estrictamente que cada decisión pertenece al plan generado. Si el catálogo de Nuvex cambió entre el preview y el apply, el apply SHALL abortar sin escribir.

#### Scenario: Apply válido
- **WHEN** el admin confirma un preview vigente, Nuvex no cambió y el `decisionSet` es consistente con el plan
- **THEN** se aplican los cambios confirmados y se devuelve el resumen

#### Scenario: Preview vencido o inválido
- **WHEN** el token del preview venció, no es válido o ya fue usado
- **THEN** el apply responde con error y no escribe nada

#### Scenario: Catálogo de Nuvex cambió entre preview y apply
- **WHEN** la revalidación detecta cambios en Nuvex respecto al preview
- **THEN** el apply responde con conflicto y exige generar un preview nuevo

#### Scenario: Decision set manipulado
- **WHEN** el cliente envía un `decisionSet` con IDs, precios o desactivaciones que no coinciden con el plan firmado
- **THEN** el servidor rechaza el apply sin escribir

#### Scenario: Reutilización del token
- **WHEN** el mismo token firmado se envía más de una vez
- **THEN** solo la primera aplicación procede y las siguientes se rechazan

### Requirement: Aplicación por grupos con decisiones explícitas

El apply SHALL aplicar en un solo paso todos los cambios normales confirmados (nombre, descripción, precio, oferta, imágenes, categorías, subcategorías, colores), de forma atómica y dentro de límites de tamaño. Los precios vacíos, coincidencias por nombre y desactivaciones SHALL requerir decisión explícita antes de aplicarse.

#### Scenario: Cambios normales confirmados
- **WHEN** el admin confirma el preview
- **THEN** todos los cambios normales se aplican juntos de forma atómica
- **AND** las excepciones (precios vacíos, coincidencias, bajas) se aplican solo si fueron confirmadas

#### Scenario: Apply concurrente
- **WHEN** se intenta ejecutar más de un apply de Nuvex a la vez
- **THEN** el sistema bloquea el segundo y devuelve conflicto
- **AND** no se producen escrituras duplicadas ni inconsistentes

### Requirement: Motivos de cambio de precio

El preview SHALL mostrar el motivo del cambio de precio para cada producto, distinguiendo: aumento normal del proveedor (markup ×1.4), inicio de oferta, fin de oferta, cambio de precio de oferta, precio faltante y precio manual temporal.

#### Scenario: Cambio de precio etiquetado
- **WHEN** el preview compara un precio de Nuvex con el precio de Supabase
- **THEN** el motivo del cambio se muestra de forma legible en el plan

### Requirement: Regla de markup de Nuvex centralizada

El sistema SHALL calcular el precio final de Nuvex con una única regla centralizada (`precio proveedor × 1.4`) y SHALL extraer por separado precio normal y precio de oferta original (sin markup) para explicar los cambios.

#### Scenario: Markup aplicado consistentemente
- **WHEN** se calcula el precio de un producto Nuvex
- **THEN** el precio final usa la regla centralizada de markup
- **AND** el precio original y el precio de oferta se derivan de los precios del proveedor

### Requirement: Cambios de imagen comparados

El sistema SHALL mostrar comparación visual (imagen actual vs. nueva) cuando cambien las imágenes de un producto, y SHALL aplicar las imágenes nuevas junto con el resto de los cambios confirmados. Las URLs de imágenes SHALL validarse contra una allowlist de hosts permitidos.

#### Scenario: Imágenes modificadas
- **WHEN** un producto cambia sus imágenes
- **THEN** el preview muestra miniatura anterior y nueva
- **AND** el apply actualiza las imágenes al confirmar

### Requirement: Validación de URLs y anti-SSRF

El sistema SHALL restringir el scraping a URLs HTTPS del host `nuvex.uy` y validar las URLs de imágenes contra una allowlist, rechazando esquemas no HTTPS, IPs privadas, puertos no estándar y redirecciones a hosts no permitidos. El sistema SHALL NOT hacer fetch server-side de URLs arbitrarias provenientes del cliente.

#### Scenario: URL no permitida
- **WHEN** una URL extraída o provista no pertenece a un host permitido o no es HTTPS
- **THEN** el sistema la rechaza y no la solicita ni la persiste

#### Scenario: Redirección a host no permitido
- **WHEN** una URL permitida redirige a un host fuera de la allowlist
- **THEN** el sistema aborta la solicitud sin seguir la redirección

### Requirement: Límites de recursos del scraping

El sistema SHALL aplicar límites globales de scraping: número máximo de categorías, páginas, productos, bytes por respuesta, concurrencia y duración total (deadline), con `AbortController`. Al exceder un límite, el scraping SHALL abortar de forma fail-closed sin generar un plan incompleto.

#### Scenario: Deadline superado
- **WHEN** la recolección de Nuvex supera la duración máxima permitida
- **THEN** el preview aborta y devuelve un error de timeout
- **AND** no se genera ni aplica ningún plan

#### Scenario: Catálogo excesivo
- **WHEN** el número de productos o el tamaño de una respuesta supera los límites configurados
- **THEN** el scraping se interrumpe y el preview falla de forma controlada

### Requirement: Auditoría de acciones administrativas

El sistema SHALL registrar server-side un log de auditoría de cada apply y desactivación con actor (admin), preview hash, decisiones aplicadas y resultado. El sistema SHALL NOT loguear credenciales, cookies, bodies, ni cabeceras sensibles.

#### Scenario: Apply auditado
- **WHEN** un admin aplica un preview o confirma desactivaciones
- **THEN** se registra el actor, el preview hash, las decisiones y el resultado en el log de auditoría
- **AND** no se registran credenciales ni datos sensibles de sesión

### Requirement: TLS estricto en el transporte Nuvex

El sistema SHALL conectarse a Nuvex validando certificados TLS y SHALL NOT desactivar la verificación de certificados bajo ninguna condición.

#### Scenario: Certificado inválido
- **WHEN** el certificado de Nuvex no es verificable
- **THEN** el scraping falla de forma cerrada y no continúa
- **AND** nunca se envía un login ni se desactiva la verificación TLS
