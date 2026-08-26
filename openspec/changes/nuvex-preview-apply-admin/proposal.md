# Nuvex Preview & Apply en Panel Admin

## Why

Hoy el panel admin **no sincroniza Nuvex**: `/api/admin/providers/sync` solo ejecuta Martina, Kai Deco y Alondra, mientras Nuvex se scrapea únicamente desde `webScrappingTool` (workflow `catalog-sync`) generando `productos.csv` sin un diff revisable. Como consecuencia, productos nuevos o cambios de precio de Nuvex pueden no reflejarse nunca en Supabase, y casos como `product_id=477` (nombre e imágenes disponibles pero precio vacío si no hay sesión de Nuvex) pasan desapercibidos o se descartan silenciosamente.

## What Changes

- Nuevo flujo de **preview read-only** de Nuvex en el panel admin: el servidor hace login contra Nuvex con credenciales server-side, obtiene el catálogo, lo compara contra Supabase y muestra un plan detallado (nuevos / actualizados / sin cambios / ausentes / advertencias).
- Nuevo flujo de **apply** que aplica un preview firmado, vigente y revalidado contra Nuvex antes de persistir (mismo patrón HMAC + TTL que el sync de Martina).
- **Decisiones del admin vinculadas al preview**: el token firmado incluye un `decisionSet` (IDs a desactivar, precios manuales temporales, coincidencias por nombre confirmadas, actualizaciones aprobadas) que el servidor valida estrictamente contra el plan generado, para que el apply solo ejecute lo que se revisó en pantalla.
- **Anti-replay y control de concurrencia**: el preview usa un nonce (`jti`) de un solo uso ligado al admin, con bloqueo por proveedor para evitar applies concurrentes y reutilización del token dentro del TTL.
- **Identificación por ID**: los productos Nuvex se comparan por su `product_id` numérico (sin prefijo `nuvex-`); si no hay match por ID, se ofrece sugerencia por nombre normalizado (matching determinista con umbral) que requiere confirmación explícita antes de actualizar.
- **Precios vacíos** (`precio proveedor no disponible`): se muestran como advertencia, nunca se sobrescriben precios existentes con vacío, y el admin puede cargar un precio **temporal** (persistido como precio actual; el próximo precio válido de Nuvex lo reemplaza). Todo precio manual se valida en servidor (entero monetario positivo dentro de límites).
- **Productos ausentes** en Nuvex: se listan en una sección dedicada y solo se desactivan (`active = false`) con confirmación grupal explícita y límites de cantidad. Nunca se desactivan automáticamente y la lectura de productos inactivos se hace de forma autorizada server-side.
- El preview distingue el **motivo** de cada cambio de precio: aumento normal del proveedor / inicio de oferta / fin de oferta / cambio de precio de oferta / precio faltante / precio manual temporal.
- Regla de markup de Nuvex centralizada (`precio proveedor × 1.4`) y extracción correcta de `precio original` + `precio de oferta` (hoy el scraper no conserva el precio anterior).
- **UI admin**: sección "Nuvex — Sync" en `ProvidersPanel` con resumen por grupos, tabla de cambios con motivo, comparación de imágenes cuando cambian, modal responsive de precios faltantes (carga en tabla única con confirmación) y confirmación de desactivaciones.
- **Hardening del scraping**: eliminación del fallback TLS inseguro (`NODE_TLS_REJECT_UNAUTHORIZED=0`), `CookieJar` por ejecución (no global), allowlist estricta anti-SSRF (solo `https://nuvex.uy` + hosts de imágenes), y límites globales de categorías/páginas/productos/bytes/concurrencia/tiempo con `AbortController`.
- **Auditoría de acciones administrativas**: log server-side con actor, preview hash, decisiones y resultado de cada apply/desactivación; sin loguear credenciales, cookies, bodies ni cabeceras sensibles.
- Se **mantiene** el sync del CSV vía GitHub Actions (fallback), pero se documenta explícitamente como flujo independiente del panel. No se unifica la ejecución CLI/Worker para no agrandar la complejidad. Se elimina el fallback genérico `USER_EMAIL`/`USER_PASS` en favor de `NUVEX_USER_EMAIL`/`NUVEX_USER_PASS` y no se inyectan secretos en jobs que no los requieren.
- **BREAKING**: ninguno. Se agrega capacidad nueva sin modificar comportamiento de sync existente.

## Capabilities

### New Capabilities

- `nuvex-sync`: sincronización de catálogo de Nuvex desde el panel admin — preview read-only contra Supabase, apply firmado/revalidado, identificación por ID con fallback por nombre, manejo de precios vacíos (temporales), desactivación confirmada de ausentes y regla de markup centralizada.

### Modified Capabilities

Ninguna — `openspec/specs/` no tiene especificaciones previas de sync de proveedores.

## Impact

**Código afectado:**
- `webScrappingTool/src/scrapers/nuvex.ts` — extracción de precio original/oferta, factorización de la fase de recolección/parseo para reutilizarla server-side, `CookieJar` por ejecución (no global) si se integra en Worker.
- Nuevos endpoints server-side en `code/src/`:
  - `code/src/server/providers/nuvexSync.ts` — planner de cambios, firma HMAC + TTL, revalidación, repositorio Supabase/DryRun (patrón de `martinaSync.ts`).
  - `code/src/pages/api/admin/providers/nuvex/preview.ts` — POST autenticado, read-only, sin service role para escritura.
  - `code/src/pages/api/admin/providers/nuvex/apply.ts` — POST autenticado, token firmado + revalidación.
- `code/src/components/admin/ProvidersPanel.tsx` — nueva sección Nuvex con preview/apply, modal de precios, desactivación grupal.
- `code/src/middleware.ts` — rate limit para los nuevos endpoints `/api/admin/providers/nuvex/*`.
- `code/.env.template` — nuevas variables server-only: `NUVEX_USER_EMAIL`, `NUVEX_USER_PASS`, `NUVEX_SYNC_APPLY_ENABLED`, `SYNC_PREVIEW_SECRET` (reutilizada).
- `.github/workflows/catalog-sync.yml` — sin cambios funcionales; documentación de que el CSV es flujo independiente. Se revisa para no inyectar secretos en jobs que no los requieren y usar solo `NUVEX_*`.
- Eliminación del fallback genérico `USER_EMAIL`/`USER_PASS` en el transporte Nuvex en favor de `NUVEX_USER_EMAIL`/`NUVEX_USER_PASS`.
- Auditoría server-side de apply/desactivaciones (actor + preview hash + decisiones + resultado).
- Migraciones Supabase: tabla `preview_tokens` (nonce consumido) y columna nullable `temporary_price` en `products` (origen del precio manual).

**Secretos requeridos** (Cloudflare Worker + GitHub, nunca `PUBLIC_*`):
- `NUVEX_USER_EMAIL`, `NUVEX_USER_PASS`
- `NUVEX_SYNC_APPLY_ENABLED="true"` para habilitar escritura
- `SYNC_PREVIEW_SECRET` (ya usada por Martina)

**Dependencias/sistemas tocados:**
- Supabase `products` (lectura para comparar, upsert al aplicar).
- Nuvex (login autenticado, catálogo por categorías, detalle por producto).
- No se tocan las reglas de markup de Martina/Kai/Alondra en este change. Se registra como pendiente la inconsistencia Alondra (sync `1.3` vs live `1.22`) para un change separado.
