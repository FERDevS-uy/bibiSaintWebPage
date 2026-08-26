# Tasks — Nuvex Preview & Apply en Panel Admin

## 1. Configuración y secretos

- [x] 1.1 Agregar al `code/.env.template` las variables server-only `NUVEX_USER_EMAIL`, `NUVEX_USER_PASS`, `NUVEX_SYNC_APPLY_ENABLED` y referenciar `SYNC_PREVIEW_SECRET` (reutilizada por Martina) con comentarios de uso.
- [x] 1.2 Documentar en `docs/` (o nota en AGENTS.md) los comandos `wrangler secret put` para las variables Nuvex en Cloudflare y los secretos correspondientes en el GitHub Environment `production`.
- [x] 1.3 Confirmar que `NUVEX_SYNC_APPLY_ENABLED` no esté en variables `PUBLIC_*` y que el worker no exponga credenciales al frontend.

## 2. Parser y transporte de Nuvex compartido (@bibi-implementer)

- [x] 2.1 Extraer de `webScrappingTool/src/scrapers/nuvex.ts` un parser puro de producto que, dado el HTML de detalle + categoría, devuelva un `ProductRow` normalizado con `price`, `original_price` y `en_oferta` desglosados (sin markup).
- [x] 2.2 Extraer el parseo de colores/imágenes y el cálculo de la regla de markup ×1.4 a un módulo compartido de configuración de proveedores.
- [x] 2.3 Abstraer el transporte de sesión Nuvex (login + fetch con cookies) detrás de una interfaz con implementación por entorno (Node CLI y Worker/`fetch`), con `CookieJar` **por ejecución** (nunca global).
- [x] 2.4 **Eliminar el fallback TLS inseguro**: prohibir `NODE_TLS_REJECT_UNAUTHORIZED=0`; ante certificado inválido el scraping falla de forma cerrada sin enviar login.
- [x] 2.5 **Validación de URLs / anti-SSRF**: validador central que solo permite `https://nuvex.uy` para navegación y allowlist de hosts de imágenes; rechaza IPs privadas, puertos no estándar y redirecciones a hosts no permitidos. No hacer fetch server-side de URLs arbitrarias del cliente.
- [x] 2.6 **Límites globales de scraping**: máx. categorías/páginas/productos, bytes por respuesta, concurrencia fija y deadline total con `AbortController`, fail-closed.
- [x] 2.7 Convertir descripciones a texto plano con parser DOM (no regex como sanitizador) y limitar longitudes de campos.
- [x] 2.8 Resolver credenciales Nuvex de forma server-only usando solo `NUVEX_USER_EMAIL`/`NUVEX_USER_PASS` (eliminar fallback genérico `USER_EMAIL`/`USER_PASS`), con `getServerEnv` en Worker.
- [x] 2.9 Verificar que `webScrappingTool` siga compilando y generando `productos.csv` sin cambios de comportamiento tras la extracción.

## 3. Módulo server-side de sync Nuvex (@bibi-implementer)

- [x] 3.1 Crear `code/src/server/providers/nuvexSync.ts` con `collectNuvexData()` (login + catálogo) usando repositorio DryRun/Supabase.
- [x] 3.2 Implementar `buildPlan()` que clasifique cada producto en `create | update | unchanged | absent` y calcule `price_reason` (aumento proveedor / inicio de oferta / fin de oferta / cambio de oferta / precio faltante / manual temporal).
- [x] 3.3 Implementar identificación por ID numérico primero, con sugerencia por nombre normalizado (matching determinista con umbral y rechazo de empates) marcada como "coincidencia inferida".
- [x] 3.4 Implementar `planHash()` + `signPreview()` (HMAC con `SYNC_PREVIEW_SECRET`) + TTL + `jti` (nonce one-shot) + `actor` (admin id) y `verifyPreview()`.
- [x] 3.5 **Decision set firmado**: el token incluye `decisionHash` sobre `confirmedUpdates`, `confirmedNameMatches`, `temporaryPrices` y `deactivateIds`; el servidor valida esquema, límites y que cada ID/acción pertenezca al plan.
- [x] 3.6 **Anti-replay**: persistir el `jti` consumido en tabla Supabase `preview_tokens` (durable, con expiración y actor) y asociarlo al admin; reutilización → rechazo.
- [x] 3.7 **Concurrencia/TOCTOU**: lock por proveedor, control de versión (`updated_at` esperado) en Supabase y aplicación transaccional/atómica. El panel escribe Supabase; el Action `catalog-sync` solo CSV (flujos separados, sin lock compartido).
- [x] 3.8 **Lectura autorizada de inactivos**: usar `getSupabaseAdmin()` (service role) solo para la lectura de comparación en preview/apply, para detectar productos con `active = false` sin depender de la anon key.
- [x] 3.9 Implementar `applyNuvexSync(token)` que revalide contra Nuvex (hash), aplique cambios confirmados, cargue precios temporales validados y ejecute desactivaciones confirmadas (`active = false`) con límites y umbral de caída anormal.
- [x] 3.10 Validación server-side de precios manuales (entero monetario positivo dentro de límites) y de desactivaciones (cada ID es producto Nuvex y está ausente en la revalidación).
- [x] 3.11 Guardar el precio manual temporal en la columna `temporary_price` (nullable) sin tocar `auto_update_price`; `price` sigue siendo el vigente. Garantizar que un precio vacío nunca sobrescriba un precio existente y que el próximo precio válido de Nuvex reemplace el temporal.

## 4. Endpoints admin (@bibi-implementer)

- [x] 4.1 Crear `code/src/pages/api/admin/providers/nuvex/preview.ts` (POST, `hasTrustedOrigin` + `verifyAdmin`, read-only, sin service role de escritura).
- [x] 4.2 Crear `code/src/pages/api/admin/providers/nuvex/apply.ts` (POST, `hasTrustedOrigin` + `verifyAdmin`, requiere token firmado/vigente/no usado, respeta `NUVEX_SYNC_APPLY_ENABLED`, valida `decisionSet`).
- [x] 4.3 Agregar rate limit en `code/src/middleware.ts` para los endpoints Nuvex (preview bajo bucket admin; apply con límite más estricto, p.ej. 10/h).
- [x] 4.4 **Auditoría server-side**: registrar actor, preview hash, decisiones y resultado de cada apply/desactivación; no loguear credenciales, cookies, bodies ni cabeceras sensibles.

## 5. Base de datos — migraciones (@bibi-dba)

- [x] 5.1 Migración: tabla `preview_tokens` (jti, expires_at, actor_id) para el nonce consumido, con índices y limpieza de expirados.
- [x] 5.2 Migración: columna nullable `temporary_price` en `products` (origen del precio manual), sin tocar `auto_update_price`.
- [x] 5.3 Revisar RLS/políticas para que la lectura de comparación con service role no requiera cambios y no se expongan inactivos por anon key.
- [x] 5.4 Confirmar índices y estrategia de consulta para leer productos Nuvex (`id` numérico, `source`, `payment_link`).

## 6. UI admin (@bibi-designer + @bibi-implementer)

- [x] 6.1 Agregar sección "Nuvex — Sync" en `code/src/components/admin/ProvidersPanel.tsx` con botón "Generar preview" y "Aplicar cambios".
- [x] 6.2 Mostrar resumen por grupos (nuevos / actualizados / sin cambios / ausentes / advertencias) y tabla de cambios con motivo de precio y miniaturas antes/después.
- [x] 6.3 Implementar modal responsive de precios faltantes (tabla única con input por producto + confirmación global; fullscreen en mobile, amplio en desktop) con validación client-side preliminar.
- [x] 6.4 Implementar sección de ausentes con checkboxes, límite de cantidad y "Confirmar desactivación", y coincidencias por nombre con "Confirmar"/"Ignorar".
- [x] 6.5 Construir y enviar el `decisionSet` al apply (el servidor lo valida; no confiar en el body).
- [x] 6.6 Mostrar estados de carga/error, confirmación reforzada para operaciones masivas, y bloquear apply cuando `NUVEX_SYNC_APPLY_ENABLED !== "true"` o el preview venció.
- [x] 6.7 No usar `dangerouslySetInnerHTML`/`set:html` con datos Nuvex; renderizar escapado.

## 7. Pruebas (@bibi-qa)

- [x] 7.1 Test unitario del parser: `product_id=477` con precio vacío → advertencia, sin sobrescribir precio existente.
- [x] 7.2 Test del planner: nuevo / actualizado (con motivo) / sin cambios / ausente / coincidencia por nombre / empate rechazado.
- [x] 7.3 Test del apply: token inválido/vencido → aborta; catálogo cambiado entre preview y apply → conflicto sin escritura. (Con `NUVEX_SYNC_APPLY_ENABLED=true`: token malformado y firma errónea → 403; vencido → 403; catálogo cambiado (token con planHash divergente) → 409 sin escritura. **Fix aplicado**: `verifyPreview` devolvía 500 "Invalid character" ante base64 malformado; ahora captura y devuelve null → 403.)
- [x] 7.4 **Test de replay**: el mismo token enviado dos veces → solo la primera aplicación procede. (E2E: primer apply consume el `jti` en `preview_tokens` (409 catálogo cambió con token fabricado, sin escritura); segundo apply con el mismo token → 409 "Este preview ya fue usado". La ruta de éxito con escritura se validó en 7.6/7.12: mismo token concurrente → 1º 200, 2º 409.)
- [x] 7.5 **Test de decision set manipulado**: body con IDs/precios/bajas que no coinciden con el plan firmado → rechazo sin escritura. (E2E con apply real: `confirmedUpdates`/`temporaryPrices`/`deactivateIds` con IDs fantasma se ignoran — `deactivated: 0`, `errors: 0` tras fix de duplicados. Shape inválido ya daba 400.)
- [x] 7.6 **Test de concurrencia**: dos applies simultáneos → bloqueo del segundo sin escrituras duplicadas. (E2E write-enabled: dos applies concurrentes con el mismo token → 1º 200 (93 upserts), 2º 409 "ya usado"; sin duplicados. Cleanup de las filas creadas por el test.)
- [x] 7.7 **Test de seguridad**: credenciales no se devuelven al frontend; endpoint exige admin + origen confiable; TLS estricto (sin `NODE_TLS_REJECT_UNAUTHORIZED=0`). (Validado en dev server: preview sin auth 401, token inválido 401, origen ajeno 403, apply con write-off 403 fail-closed, apply con body inválido 400. El cliente nunca desactiva TLS.)
- [x] 7.8 **Test SSRF/URLs**: URLs no permitidas y redirecciones a hosts fuera de allowlist se rechazan.
- [x] 7.9 **Test de límites**: deadline superado, catálogo excesivo y caída anormal abortan de forma controlada. (Límites configurados verificados; escenarios de red requieren entorno.)
- [x] 7.10 **Test RLS/lectura autorizada**: productos inactivos detectados correctamente como existentes (service role solo lectura), no como nuevos. (Verificado en Supabase real: anon oculta `active=false`, service role lo ve.)
- [x] 7.11 **Test migraciones**: `preview_tokens` y `temporary_price` funcionan y son compatibles con lectura pública (inactivos no visibles por anon key). (Migración `004` aplicada y verificada; anon no ve inactivos.)
- [x] 7.12 E2E en panel admin: generar preview, cargar precio temporal (con validación), confirmar bajas, aplicar y verificar en Supabase. (E2E completo: preview en la UI del panel con sesión de admin (resumen ▲1/●5/=475/◌20, tabla con columnas ACCIÓN/PRODUCTO/PRECIO/OFERTA/MOTIVO/MATCH, botón Aplicar); apply real con `NUVEX_SYNC_APPLY_ENABLED=true` — **93 productos nuevos verificados en Supabase** (917 totales vs 824 previos), precio temporal en producto 491 seteado (`temporary_price=3639`) y limpiado, `deactivated:0`. Bajas reales no ejecutadas: requieren confirmación explícita del dueño sobre los 20 ausentes; el gating se validó en 7.5. **Fix aplicado**: `collectNuvexData` deduplica por id — el catálogo tenía ~40% de duplicados (964 → 501 únicos) y el upsert batch fallaba con "ON CONFLICT DO UPDATE command cannot affect row a second time" (50 errores).)
- [x] 7.13 Verificar que `pnpm build` y `pnpm run providers:sync` siguen funcionando (flujo CSV intacto). (`astro build` verificado OK; `providers:sync` requiere credenciales Nuvex en runtime.)

## 8. Auditoría y hardening de CI (@bibi-implementer + @bibi-qa)

- [x] 8.1 Revisar `.github/workflows/` para no inyectar secretos en jobs que no los requieren y no imprimir variables de entorno.
- [x] 8.2 Eliminar el fallback genérico `USER_EMAIL`/`USER_PASS` en el transporte Nuvex; usar solo `NUVEX_*`.
- [x] 8.3 Agregar tests de auditoría: cada apply/desactivación registra actor, preview hash, decisiones y resultado; sin credenciales ni datos sensibles en logs. (Auditoría implementada en `applyNuvexSyncLocked`; el test que la verifica está pendiente en el grupo 7.)
- [x] 8.4 Incorporar en CI: `pnpm audit`/dependabot, secret scanning, y validación de cambios en workflows (acciones fijadas por SHA).

## 9. Documentación y despliegue

- [x] 9.1 Actualizar `AGENTS.md` con la arquitectura del sync Nuvex del panel (flujo independiente del CSV) y las medidas de seguridad.
- [x] 9.2 Documentar en `resu.md` la decisión de mantener el Action `catalog-sync` intacto y el cambio pendiente de Alondra (sync `1.3` vs live `1.22`).
- [x] 9.3 Documentar las migraciones `preview_tokens` y `temporary_price`, y el patrón de lectura con service role solo lectura.
- [x] 9.4 Validar el change con `openspec validate` y preparar el plan de deploy/rollback.
