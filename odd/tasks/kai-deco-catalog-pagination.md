# Paginar el catálogo de Kai Deco

## Objetivo
Importar todas las páginas disponibles del catálogo público de Kai Deco, no solo la primera de 250 productos.

## Problema y por qué
`syncKaiDeco()` hace una sola consulta a `products.json?limit=250`. Shopify limita esa página a 250 filas; productos posteriores no llegan al read model de Bibi.

## Alcance autorizado
- Implementar paginación cursor-based de Shopify para Kai Deco.
- Mantener la normalización, márgenes y mapeo actuales.
- Añadir pruebas unitarias focalizadas para múltiples páginas y para el corte de paginación.

## Restricciones
- No modificar categorías, márgenes ni reglas de precio existentes.
- No realizar sincronizaciones remotas ni escrituras en Supabase durante la validación.
- TDD: desactivado; no existe una configuración explícita de TDD. Runner: `pnpm test:unit`.

## Tareas
- [x] KAI-1 — Crear una prueba determinista para la paginación y el corte al no haber `Link: rel="next"`.
  - Evidencia: RED observado por export ausente; GREEN en `pnpm test:unit`.
- [x] KAI-2 — Implementar lectura cursor-based de todas las páginas y verificar tipado/lint mediante pruebas unitarias.
  - Evidencia: 231/231 pruebas unitarias pasan; `pnpm build` pasa.

## Criterios de aceptación
- El adaptador solicita páginas posteriores mientras Shopify entregue un enlace `rel="next"`.
- Los productos de todas las páginas se normalizan una sola vez con la lógica actual.
- El proceso termina al agotarse el cursor y no entra en ciclos.
- Las pruebas unitarias focalizadas pasan.

## Progreso y evidencia
- Completado. `fetchKaiDecoCatalog()` sigue el header Shopify `Link: rel="next"`, acumula cada página y corta sin enlace siguiente o ante un cursor repetido.
- La prueba focalizada cubre dos páginas y el corte final.
- Verificaciones: `pnpm test:unit` (231/231) y `pnpm build` exitosos.

## Próximo paso
- Ejecutar una vista previa de proveedores desde el admin cuando se quiera observar el conteo real; no se ejecutó para evitar una escritura remota.
