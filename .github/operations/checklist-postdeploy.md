# Checklist Postdeploy

Usar esta lista dentro de los primeros 15 minutos luego de deploy.

## 1) Disponibilidad y rutas

- [ ] El sitio abre correctamente en GitHub Pages.
- [ ] Home carga sin errores visuales criticos.
- [ ] Una categoria abre y pagina correctamente.
- [ ] Una subcategoria abre y pagina correctamente.
- [ ] Una pagina de producto abre correctamente.

## 2) Funcionalidad clave

- [ ] Orden por precio/nombre funciona.
- [ ] Filtro por color funciona.
- [ ] Los filtros/orden se mantienen al cambiar de pagina.
- [ ] Carrito agrega/elimina productos.
- [ ] Pedido puede cargar productos desde productos.json.

## 3) Datos y coherencia

- [ ] No se observan productos vacios o precios invalidos.
- [ ] No hay categoria principal sin productos esperados.
- [ ] La cobertura por proveedor luce normal.

## 4) Observabilidad minima

- [ ] Sin errores JS criticos en consola.
- [ ] Sin errores 404/500 en recursos principales.

## 5) Accion segun resultado

## Si todo OK

- [ ] Marcar release como estable.

## Si hay incidente

- [ ] Iniciar runbook-incidentes-datos.md.
- [ ] Evaluar rollback a snapshot/commit previo.
