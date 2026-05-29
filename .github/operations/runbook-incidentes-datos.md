# Runbook de Incidentes de Datos

Aplicar cuando falle scraping, falte catalogo o exista inconsistencia grave de precio/stock.

## Severidad

- SEV-1: sitio caido o catalogo inutilizable.
- SEV-2: degradacion importante (proveedor clave sin datos, filtros/paginacion inutiles).
- SEV-3: inconsistencia menor sin impacto mayor en compra.

## Paso 0 - Contencion inmediata

- [ ] Frenar despliegues nuevos hasta estabilizar.
- [ ] Confirmar ultimo commit y ultimo deploy exitoso.
- [ ] Confirmar si el problema viene de datos o de frontend.

## Paso 1 - Diagnostico rapido

- [ ] Revisar ultimo workflow de deploy y sus logs.
- [ ] Validar integridad del CSV activo.
- [ ] Revisar cantidad total de productos vs baseline.
- [ ] Revisar cobertura por proveedor.
- [ ] Verificar que productos.json responde y contiene datos esperados.

## Paso 2 - Decision operativa

## Si el CSV nuevo esta corrupto o incompleto

- [ ] No usar CSV nuevo.
- [ ] Restaurar snapshot previo.
- [ ] Rebuild + deploy con snapshot restaurado.

## Si el CSV esta bien pero hay error de app

- [ ] Hacer rollback al commit anterior estable.
- [ ] Re-ejecutar deploy.

## Paso 3 - Verificacion de recuperacion

- [ ] Home, categoria, subcategoria, producto y carrito funcionales.
- [ ] Orden/filtro/paginacion funcionales.
- [ ] Sin errores criticos en consola.

## Paso 4 - Cierre

- [ ] Documentar causa raiz.
- [ ] Documentar tiempo de deteccion y recuperacion.
- [ ] Registrar accion preventiva para evitar recurrencia.

## Plantilla breve de postmortem

- Fecha incidente:
- Severidad:
- Impacto:
- Causa raiz:
- Contencion aplicada:
- Tiempo hasta recuperacion:
- Accion preventiva 1:
- Accion preventiva 2:
