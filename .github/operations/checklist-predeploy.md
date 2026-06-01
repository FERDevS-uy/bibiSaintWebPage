# Checklist Predeploy

Usar esta lista antes de publicar en GitHub Pages.

## 1) Datos (CSV y scraping)

- [ ] Existe snapshot/backup del catalogo vigente.
- [ ] El CSV nuevo fue generado en staging (no en lugar del activo).
- [ ] El CSV nuevo tiene encabezados esperados.
- [ ] No hay IDs duplicados.
- [ ] No faltan campos criticos: id, name, precio, imagen, categorias.
- [ ] La cantidad total de productos no cae de forma anomala vs baseline.
- [ ] La cantidad por proveedor no cae de forma anomala vs baseline.

## 2) Integridad tecnica

- [ ] Parseo CSV sin errores.
- [ ] Formato de precio consistente.
- [ ] URLs de imagen con formato valido.
- [ ] Subcategorias y categorias coherentes.

## 3) Aplicacion

- [ ] Build local de Astro exitoso.
- [ ] Navegacion de categorias funcional.
- [ ] Orden por precio/nombre funcional.
- [ ] Filtro por color funcional.
- [ ] Paginacion conserva query params de filtros/orden.

## 4) Criterio Go/No-Go

## Go

- [ ] Todo lo critico arriba en verde.
- [ ] No hay regresiones visibles en home/categorias/producto/carrito.

## No-Go

- [ ] Error de parseo CSV o duplicados de ID.
- [ ] Caida de cobertura de datos por debajo del umbral del equipo.
- [ ] Build fallida o filtros/paginacion rotos.

## 5) Si es No-Go

- [ ] No promover CSV nuevo.
- [ ] Mantener dataset activo anterior.
- [ ] Registrar incidente con causa y proveedor afectado.
