import axios from 'axios';
import { normalizeText, cleanDescription, getUniqueColors, appendColorsToName, inferSubcategory } from '../utils/text';
import { parsePrice } from '../utils/price';
import { Product } from '../utils/product';

const KAI_JSON_URL = 'https://kaideco.uy/products.json?limit=250';

export async function scrapKaiDeco(): Promise<Product[]> {
  console.log('Iniciando scraping de Kai Deco...');
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'es-ES,es;q=0.9',
      Referer: 'https://kaideco.uy/',
      'X-Requested-With': 'XMLHttpRequest',
    };
    const { data } = await axios.get(KAI_JSON_URL, { headers });
    const products = data?.products ?? [];
    console.log(`Kai Deco: se encontraron ${products.length} productos.`);
    return products.map((product: any) => {
      const baseName = normalizeText(product.title || '');
      const colorCandidates = [product.title, ...(product.variants?.map((v: any) => v.option1 || v.title || '') ?? [])].join(' ');
      const colors = getUniqueColors(colorCandidates);
      const name = appendColorsToName(baseName, colors);
      const description = cleanDescription(product.body_html || '');
      const primaryVariant = product.variants?.[0] ?? {};
      const precio = parsePrice(primaryVariant.price ?? '');
      const oferta = primaryVariant.compare_at_price ? 'true' : '';
      const imagen = (product.image?.src || product.images?.[0]?.src || '').replace(/\s+/g, '');
      const subcategorias = inferSubcategory(name, 'Hogar');
      return {
        id: `kai-${product.id}`,
        relacionados: '',
        name,
        description,
        precio,
        imagen,
        categorias: 'Hogar',
        linkPago: product.handle ? `https://kaideco.uy/products/${product.handle}` : '',
        subcategorias,
        oferta,
      };
    });
  } catch (err: any) {
    console.error('Error al scrapear Kai Deco:', err.message);
    return [];
  }
}
