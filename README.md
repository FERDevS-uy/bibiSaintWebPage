# Bibis ventas

Template de tienda digital estática, donde no es necesaria la ejecución de código del lado del servidor, toda la lógica se implementa del lado del cliente.

## Comenzando

Una vez descargado el repositorio hay que instalar las dependencias con el comando

```sh
npm install
```

Y una vez instaladas ejecutar el modo desarrollo

```sh
npm run dev
```

## Despliegue

Para el despliegue se utiliza el comando que genera el sitio estático:

```sh
npm run build
```

## Sincronizacion de proveedores (prebuild)

Para mantener compatibilidad con GitHub Pages, los proveedores que no permiten verificacion en vivo desde navegador se actualizan antes del build.

Desde la carpeta `code`:

```sh
pnpm run providers:sync
```

Este comando ejecuta el scraper unificado en `webScrappingTool` y actualiza `code/src/data/productos.csv`.

Si quieres hacer sync y build en un solo paso:

```sh
pnpm run build:with-sync
```

## Forks

Lista de implementaciones:

- [Test static ecommerce](https://github.com/FERDevS-uy/Test-static-ecommerce)
