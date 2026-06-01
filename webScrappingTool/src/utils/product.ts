import { stringSimilarity } from 'string-similarity-js';

export interface Product {
  id: string;
  relacionados: string | string[];
  name: string;
  description: string;
  precio: string;
  imagen: string;
  categorias: string;
  linkPago: string;
  subcategorias: string;
  oferta: string;
  /** JSON string con [{id, hex, name, images}] cuando el proveedor lo expone (Martina) */
  colores?: string;
}

const THRESHOLD = 0.7;

export function searchSimilarity(productos: Product[]) {
  return productos.map((producto) => {
    const relacionados = productos
      .filter((p) => producto.id !== p.id)
      .filter((p) => stringSimilarity(producto.name, p.name) > THRESHOLD)
      .map((p) => p.id);
    return {
      ...producto,
      relacionados: relacionados.join(' '),
    };
  });
}
