## Purpose

Reducir latencia y CPU mediante respuestas públicas pequeñas cacheadas en el edge, con versionado explícito para invalidar de forma segura después de cambios de catálogo.

## ADDED Requirements

### Requirement: Cache de respuestas públicas
Las respuestas GET públicas de categorías y páginas de catálogo SHALL poder servirse desde caché edge usando una clave que incluya ruta, filtros, orden, cursor y versión de catálogo. Las respuestas cacheadas SHALL tener TTL y política de stale definidos.

#### Scenario: Cache hit
- **WHEN** llega una solicitud con una clave cacheada vigente
- **THEN** el Worker responde sin consultar Supabase ni materializar productos adicionales

#### Scenario: Cache miss
- **WHEN** no existe una entrada vigente
- **THEN** el Worker ejecuta una única lectura paginada, devuelve la respuesta y almacena una copia cacheable sin bloquear innecesariamente la respuesta

### Requirement: Versionado e invalidación
El sistema SHALL mantener una versión de catálogo compartida entre isolates y SHALL cambiarla después de una sincronización o escritura administrativa que afecte lecturas públicas. Las claves de una versión anterior SHALL dejar de ser seleccionadas sin requerir purga global inmediata.

#### Scenario: Publicación de nueva versión
- **WHEN** termina correctamente una actualización de productos
- **THEN** las nuevas solicitudes usan la versión nueva y no reciben categorías o páginas de la versión anterior

#### Scenario: Fallo de actualización
- **WHEN** falla la reconstrucción del modelo de lectura
- **THEN** la versión anterior permanece servible y no se publica una versión parcial

### Requirement: Observabilidad del caché
El sistema SHALL registrar o exponer hit, miss, versión, tamaño de respuesta y duración de consulta para categorías y páginas de catálogo, sin registrar credenciales ni datos sensibles.

#### Scenario: Medición de latencia
- **WHEN** se sirve una respuesta pública
- **THEN** puede distinguirse si fue cache hit o miss y medirse su latencia de edge y de origen
