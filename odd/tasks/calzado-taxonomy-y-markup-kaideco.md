# Taxonomía de Calzado y markup de Kai Deco

## Objetivo
Configurar en Supabase el árbol visible de Calzado y verificar/corregir el markup efectivo de Kai Deco al consultar precios en vivo.

## Problema y por qué
Calzado necesita un nivel visual padre → hija sin una reescritura amplia del menú; Kai Deco aparentemente sigue aplicando un margen pese a que su precio web debería mostrarse sin aumento.

## Alcance autorizado
- Proyecto Supabase vinculado `bibisaint` (`deilsclvheqcrqswiafa`) mediante la sesión local autorizada por el usuario.
- Cambios incrementales de datos/esquema mediante migración y la mínima adaptación de código necesaria para filtrar grupos de Calzado.
- Commit y push al branch actual `impladmin` autorizados; no deploy.

## Restricciones
- Reutilizar la jerarquía existente codificada como `Padre - Hija`.
- Conservar RLS y migraciones incrementales.
- TDD: desactivado; no existe configuración explícita. Runner: `pnpm test:unit`.

## Tareas
- [x] CTK-1 — Inspeccionar el estado remoto: taxonomía, productos Calzado, migraciones y markup efectivo de Kai Deco.
  - Evidencia: el remoto no tenía la columna `provider_catalog_settings.markup`; por eso Kai Deco caía al default de código 1.2. Había 43 Botas y 3 Botines sin categoría padre Calzado.
  - Checks: consultas SQL remotas de solo lectura.
- [ ] CTK-2 — Aplicar y verificar la taxonomía Calzado y el ajuste de markup necesario.
  - Estado: Supabase aplicado y verificado. La migración dejó 29 hojas visibles, reclasificó 46 productos bajo Calzado, ejecutó `catalog_rebuild()` (versión 11) y fijó `kaideco.markup = 1.000`.
  - Evidencia local: test unitario completo 232/232, test focalizado de grupos Calzado y `pnpm build` exitosos.
  - Corrección visual pendiente de deploy: la flecha del submenú ahora tiene espacio fijo y la etiqueta puede truncarse sin ocultarla. El sidebar reconoce explícitamente los padres de Calzado y presenta sus hojas como acordeón, igual que Ropa.
  - Pendiente: desplegar el cambio de Header/filtros para que el menú público agrupe las hojas bajo Botas, Botines, etc.; no autorizado todavía.
- [x] CTK-3 — Diagnosticar la imagen ausente en `/producto/tal-21`.
  - Evidencia: el WebP existe, Supabase lo referencia y el servidor lo responde con HTTP 200. El proceso de desarrollo activo desde el 17 de septiembre tenía un bundle React/Vite inválido (`jsxDEV is not a function`) que desmontaba la galería al hidratar.
  - Resolución: se reinició el servidor local de Astro en el puerto 4321; la página vuelve a renderizar la imagen de producto.
  - Checks: verificación en navegador de `http://localhost:4321/producto/tal-21` tras el reinicio.
- [x] CTK-4 — Mostrar el FAB móvil de crear producto solo en el listado administrativo.
  - Criterio de aceptación: el botón flotante `+` abre la creación desde `/admin`, pero no se muestra dentro de `/admin/productos/nuevo` ni al editar un producto.
  - Evidencia: `AdminLayout` condiciona el FAB a las rutas exactas `/admin` y `/admin/`; por lo tanto no puede renderizarse en creación, edición ni proveedores.
  - Checks: `pnpm test:unit` (232/232) y `pnpm build` exitosos.
- [x] CTK-5 — Mostrar la jerarquía de subcategorías al crear productos desde el admin.
  - Problema verificado: el endpoint admin arma el selector solo con subcategorías ya asignadas a productos; por eso omite hojas de Calzado configuradas pero aún vacías.
  - Criterio de aceptación: para Ropa y Calzado, el formulario permite elegir categoría → grupo → subcategoría y conserva el valor almacenado como `Grupo - Hoja`.
  - Resolución: el endpoint integra `catalog_taxonomy` para incluir hojas visibles aunque tengan cero productos; el formulario muestra `Categoría → Grupo → Subcategoría` para Ropa y Calzado, y persiste `Grupo - Hoja`.
  - Checks: `pnpm test:unit` (233/233), `pnpm build` y verificación interactiva de Calzado → Botas → sus cinco hojas en el formulario.

## Progreso y siguiente paso
- Preparar el commit y push autorizados. El deploy sigue pendiente de autorización explícita; luego verificar visualmente el menú desplegado y una consulta live de Kai Deco.
