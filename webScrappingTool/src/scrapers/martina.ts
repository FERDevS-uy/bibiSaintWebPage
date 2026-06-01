import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import { normalizeText, cleanDescription } from '../utils/text';
import { parsePrice } from '../utils/price';
import { delay } from '../utils/delay';
import { Product } from '../utils/product';

const MARTINA_STORE_PRODUCT_BASE = 'https://pol21.martinaditrento.com/mdt-services/resources/store/product';
const MARTINA_CONFIG_URL = 'https://pol21.martinaditrento.com/mdt-services/resources/ecommerce/config';
const MARTINA_IMAGE_BASE = 'https://pol21.martinaditrento.com/images/products/md/';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

function getMartinaColors(variation: any): string[] {
  if (!variation) return [];
  if (variation.id === 'color' && Array.isArray(variation.variationValues)) {
    return variation.variationValues.map((item: any) => String(item.description || '')).filter(Boolean);
  }
  if (Array.isArray(variation.variationValues)) {
    return variation.variationValues.flatMap((item: any) => getMartinaColors(item.variation));
  }
  return [];
}

/**
 * Recorre el árbol de variation del API de Martina y extrae los nodos de tipo "color".
 * Retorna [{id, hex, name, sizes: []}] por cada color encontrado.
 */
function extractMartinaColorNodes(
  variation: any,
): Array<{ id: number; hex: string; name: string; sizes: string[] }> {
  if (!variation) return [];
  if (variation.id === 'color' && Array.isArray(variation.variationValues)) {
    return variation.variationValues.map((c: any) => {
      const sizes: string[] = Array.isArray(c?.variation?.variationValues)
        ? c.variation.variationValues
            .map((sz: any) => String(sz?.description ?? '').trim())
            .filter(Boolean)
        : [];
      return {
        id: Number(c?.id),
        hex: String(c?.colorHex ?? '').trim() || '#cccccc',
        name: String(c?.description ?? '').trim(),
        sizes,
      };
    });
  }
  if (Array.isArray(variation.variationValues)) {
    return variation.variationValues.flatMap((item: any) =>
      extractMartinaColorNodes(item.variation),
    );
  }
  return [];
}

/**
 * Agrupa filenames de images por colorId según el patrón "{code}_{colorId}_*".
 */
function groupMartinaImagesByColor(
  images: string[],
  code: string,
): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  images.forEach((filename) => {
    const m = filename.match(new RegExp(`^${code}_(\\d+)_`));
    if (!m) return;
    const colorId = m[1];
    if (!grouped[colorId]) grouped[colorId] = [];
    grouped[colorId].push(`${MARTINA_IMAGE_BASE}${filename}`);
  });
  return grouped;
}

export async function scrapMartinaDiTrento(): Promise<Product[]> {
  console.log('Iniciando scraping de Martina di Trento...');
  try {
    const headers = { accept: 'application/json, text/plain, */*', Referer: 'https://tienda.martinaditrento.com/' };

    const countryId = process.env.MARTINA_COUNTRY_ID || '598';
    // intentar descubrir códigos de campaña desde el endpoint de config
    async function fetchMartinaConfig(country: string): Promise<string[]> {
      try {
        const { data } = await axios.get(`${MARTINA_CONFIG_URL}?countryId=${country}`, {
          headers,
          httpsAgent,
          timeout: 20000,
        });
        const payload = data && data.data ? data.data : data || {};

        // heurística: buscar arreglos con objetos que tengan la propiedad "code"
        const found: Set<string> = new Set();
        const walk = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;
          if (Array.isArray(obj)) {
            // si es un array de objetos con 'code'
            const sample = obj.find((it: any) => it && (it.code || it.codigo || it?.id));
            if (sample && (sample.code || sample.codigo)) {
              obj.forEach((it: any) => {
                const c = it.code || it.codigo || (it.id && String(it.id));
                if (c) found.add(String(c));
              });
              return;
            }
            for (const item of obj) walk(item);
            return;
          }
          for (const k of Object.keys(obj)) {
            const val = obj[k];
            if (k.toLowerCase().includes('campaign') && Array.isArray(val)) {
              val.forEach((it: any) => {
                const c = it.code || it.codigo || (it.id && String(it.id));
                if (c) found.add(String(c));
              });
            }
            walk(val);
          }
        };
        walk(payload);
        return Array.from(found);
      } catch (e: any) {
        console.warn('No se pudo obtener config de Martina:', e.message || e);
        return [];
      }
    }

    async function fetchStoreProductForCode(country: string, code: string): Promise<any[]> {
      const url = `${MARTINA_STORE_PRODUCT_BASE}?countryId=${country}&code=${encodeURIComponent(code)}`;
      try {
        const { data } = await axios.get(url, { headers, httpsAgent, timeout: 30000 });
        // intentar varios lugares comunes del payload
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (Array.isArray(data.data)) return data.data;
        if (Array.isArray(data.products)) return data.products;
        if (Array.isArray(data.result)) return data.result;
        // si viene dentro de un objeto profundo, buscar el primer array de objetos
        const walkFindArray = (o: any): any[] | null => {
          if (!o || typeof o !== 'object') return null;
          if (Array.isArray(o) && o.length > 0 && typeof o[0] === 'object') return o;
          for (const k of Object.keys(o)) {
            const res = walkFindArray(o[k]);
            if (res) return res;
          }
          return null;
        };
        const fallback = walkFindArray(data);
        return fallback || [];
      } catch (e: any) {
        console.warn(`Error consultando store/product code=${code}:`, e.message || e);
        return [];
      }
    }

    // Consulta el endpoint de store/product usando productLineId + category (catálogo por línea)
    async function fetchStoreProductByProductLine(
      country: string,
      code: string,
      productLineId: string | number,
      category: string,
    ): Promise<any[]> {
      const url = `${MARTINA_STORE_PRODUCT_BASE}?countryId=${country}&code=${encodeURIComponent(
        String(code),
      )}&productLineId=${encodeURIComponent(String(productLineId))}&category=${encodeURIComponent(
        String(category || ''),
      )}`;
      try {
        const { data } = await axios.get(url, { headers, httpsAgent, timeout: 30000 });
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (Array.isArray(data.data)) return data.data;
        if (Array.isArray(data.products)) return data.products;
        if (Array.isArray(data.result)) return data.result;
        const walkFindArray = (o: any): any[] | null => {
          if (!o || typeof o !== 'object') return null;
          if (Array.isArray(o) && o.length > 0 && typeof o[0] === 'object') return o;
          for (const k of Object.keys(o)) {
            const res = walkFindArray(o[k]);
            if (res) return res;
          }
          return null;
        };
        const fallback = walkFindArray(data);
        return fallback || [];
      } catch (e: any) {
        console.warn(`Error consultando store/product by productLine=${productLineId} category=${category}:`, e.message || e);
        return [];
      }
    }

    // concurrency y whitelist
    const country = countryId;
    let codes: string[] = [];
    try {
      codes = await fetchMartinaConfig(country);
    } catch (e) {
      codes = [];
    }

    // permitir lista blanca por env (coma-separada)
    const whitelistRaw = process.env.MARTINA_CODE_WHITELIST || '';
    const whitelist = whitelistRaw.split(',').map((s) => s.trim()).filter(Boolean);
    if (whitelist.length > 0) {
      codes = codes.filter((c) => whitelist.includes(c));
    }

    const allFetchedItems: any[] = [];

    // helper: intentar extraer código real desde filenames de imagen
    const detectCodeFromEntry = (entry: any): string | null => {
      if (!entry || typeof entry !== 'object') return null;
      if (entry.code) return String(entry.code);
      if (entry.codigo) return String(entry.codigo);
      if (entry.productCode) return String(entry.productCode);
      if (Array.isArray(entry.images)) {
        for (const im of entry.images) {
          const fname = String(im || '');
          const m = fname.match(/^(\d+)_/);
          if (m) return m[1];
          const m2 = fname.match(/(?:\/)?(\d+)_\d+_\d+/);
          if (m2) return m2[1];
        }
      }
      return null;
    };

    if (codes.length > 0) {
      console.log(`Martina: se detectaron ${codes.length} codes para country=${country}: ${codes.join(', ')}`);
      const concurrency = Math.max(1, parseInt(String(process.env.MARTINA_CONCURRENCY || '3'), 10));
      const batches: string[][] = [];
      for (let i = 0; i < codes.length; i += concurrency) batches.push(codes.slice(i, i + concurrency));

      for (const batch of batches) {
        const results = await Promise.all(batch.map((code) => fetchStoreProductForCode(country, code)));
        results.forEach((arr, idx) => {
          if (!Array.isArray(arr)) return;
          // anotar code en cada item para referencia
          const code = batch[idx];
          arr.forEach((it) => {
            if (it && typeof it === 'object') it.code = it.code || code;
            allFetchedItems.push(it);
          });
        });
        // pequeña pausa entre batches
        await delay(150 + Math.floor(Math.random() * 200));
      }
    } else {
      // Fallback robusto: usar los endpoints de catálogo por productLine (HOMBRE/MUJER)
      const codeToUse = process.env.PUBLIC_MARTINA_CODE || '202605';
      const productLineEnv = process.env.MARTINA_PRODUCT_LINE_LIST || '';
      let productLines: { productLineId: string; category: string }[] = [];
      if (productLineEnv) {
        // formato esperado: '3325:HOMBRE,3324:MUJER'
        productLines = productLineEnv.split(':').map((pair) => {
          const [pl, cat] = pair.split(':').map((s) => s.trim());
          return { productLineId: pl || '', category: cat || '' };
        }).filter((p) => p.productLineId);
      }
      if (productLines.length === 0) {
        productLines = [
          { productLineId: '3325', category: 'HOMBRE' },
          { productLineId: '3324', category: 'MUJER' },
        ];
      }

      console.log(`Martina: no se detectaron codes, consultando catálogos por productLine usando code=${codeToUse}`);
      const concurrencyPL = Math.max(1, parseInt(String(process.env.MARTINA_CONCURRENCY || '3'), 10));
      // iterar productLines (normalmente 2) y recolectar resultados
      for (const pl of productLines) {
        try {
          const arr = await fetchStoreProductByProductLine(country, codeToUse, pl.productLineId, pl.category);
          if (!Array.isArray(arr)) continue;
          arr.forEach((it) => {
            if (it && typeof it === 'object') {
              const detected = detectCodeFromEntry(it);
              if (!it.code && detected) it.code = detected;
              it.code = it.code || codeToUse;
              (it as any).productLineId = pl.productLineId;
              allFetchedItems.push(it);
            }
          });
        } catch (err) {
          console.warn('Error consultando productLine', pl, err && (err as any).message ? (err as any).message : err);
        }
        await delay(150 + Math.floor(Math.random() * 200));
      }
    }

    console.log(`Martina di Trento: se recuperaron ${allFetchedItems.length} items desde los endpoints.`);

    // Agrupar por code (un mismo "Adriano Boxer" trae N items, uno por color)
    const byCode = new Map<string, any[]>();
    allFetchedItems.forEach((p: any) => {
      const code = String(p?.code ?? p?.id ?? '').trim();
      if (!code) return;
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code)!.push(p);
    });

    console.log(`Martina di Trento: ${byCode.size} productos únicos (agrupados por code).`);
    // Guardar respuestas crudas por code para inspección
    const rawDir = path.resolve(__dirname, '../../data/martina_raw');
    try {
      await fs.mkdir(rawDir, { recursive: true });
      await fs.writeFile(path.resolve(rawDir, 'allFetchedItems.json'), JSON.stringify(allFetchedItems, null, 2));
      for (const [c, arr] of byCode.entries()) {
        try {
          await fs.writeFile(path.resolve(rawDir, `${c}.json`), JSON.stringify(arr, null, 2));
        } catch (err: any) {
          console.warn(`No se pudo guardar raw ${c}:`, err.message || err);
        }
      }
      // generar mapping productId -> code/productLineId para uso en runtime
      try {
        const productMap: Record<string, { code?: string; productLineId?: string }> = {};
        // Mapear TODOS los providerIds disponibles por cada code (no solo el primero)
        for (const [c, arr] of byCode.entries()) {
          for (const entry of arr) {
            // intentar obtener id del proveedor desde distintas propiedades
            const candidateId =
              (entry && (entry.id ?? entry.productId ?? (entry.product && entry.product.id))) || '';
            const providerId = String(candidateId || c).trim();
            if (!providerId) continue;
            if (!productMap[providerId]) productMap[providerId] = { code: c };
            else productMap[providerId].code = productMap[providerId].code || c;

            if (entry?.productLineId) productMap[providerId].productLineId = String(entry.productLineId);
            else if (entry?.productLine && typeof entry.productLine === 'object' && entry.productLine.id)
              productMap[providerId].productLineId = String(entry.productLine.id);
          }
        }
        // Intentar fusionar mappings desde archivos raw ya existentes para no perder providerIds
        try {
          const files = await fs.readdir(rawDir);
          for (const fname of files) {
            if (!/^[0-9]+\.json$/.test(fname)) continue;
            const codeFromFile = fname.replace(/\.json$/, '');
            try {
              const content = await fs.readFile(path.resolve(rawDir, fname), 'utf-8');
              const arr = JSON.parse(content || '[]');
              if (!Array.isArray(arr)) continue;
              for (const entry of arr) {
                const candidateId = (entry && (entry.id ?? entry.productId ?? (entry.product && entry.product.id))) || '';
                const providerId = String(candidateId || '').trim();
                if (!providerId) continue;
                if (!productMap[providerId]) productMap[providerId] = { code: codeFromFile };
              }
            } catch (err) {
              // noop: si un archivo raw está corrupto lo saltamos
            }
          }
        } catch (err: any) {
          console.warn('No se pudo leer/mergear archivos raw existentes:', err.message || err);
        }

        await fs.writeFile(path.resolve(rawDir, 'map.json'), JSON.stringify(productMap, null, 2));
      } catch (err: any) {
        console.warn('No se pudo guardar map.json:', err.message || err);
      }
    } catch (err: any) {
      console.warn('No se pudo crear directorio raw:', err.message || err);
    }

    const result: Product[] = [];

    byCode.forEach((entries, code) => {
      const first = entries[0];
      const name = normalizeText(first?.name || '');
      const description = cleanDescription(
        [first?.description, first?.description2, first?.description3]
          .filter(Boolean)
          .join(' '),
      );
      const precio = parsePrice(first?.price ?? '');
      const oferta =
        first?.price1 && parseFloat(String(first.price1)) > parseFloat(String(first.price ?? 0))
          ? 'true'
          : '';

      const categoryName = String(
        first?.productLine?.parent?.name || first?.productLine?.name || 'Ropa',
      );
      const subcategoria = String(first?.productLine?.name || '');

      // Unión de colores extraídos del árbol de variaciones de todos los items
      const colorById = new Map<number, { id: number; hex: string; name: string; sizes: string[]; images: string[] }>();
      entries.forEach((entry) => {
        const colorNodes = extractMartinaColorNodes(entry?.variation);
        const imagesByColor = groupMartinaImagesByColor(
          Array.isArray(entry?.images) ? entry.images : [],
          code,
        );
        colorNodes.forEach((c) => {
          if (!Number.isFinite(c.id)) return;
          if (!colorById.has(c.id)) {
            colorById.set(c.id, { ...c, images: imagesByColor[String(c.id)] || [] });
          } else {
            const existing = colorById.get(c.id)!;
            // mergear sizes
            const merged = new Set([...existing.sizes, ...c.sizes]);
            existing.sizes = Array.from(merged);
            // mergear images
            const extra = imagesByColor[String(c.id)] || [];
            const seen = new Set(existing.images);
            extra.forEach((img) => {
              if (!seen.has(img)) {
                existing.images.push(img);
                seen.add(img);
              }
            });
          }
        });
      });

      const colors = Array.from(colorById.values());

      // Lista plana de TODAS las imágenes (ordenadas: por color, en el orden del color array)
      const allImages: string[] = [];
      const seenImg = new Set<string>();
      colors.forEach((c) => {
        c.images.forEach((img) => {
          if (!seenImg.has(img)) {
            allImages.push(img);
            seenImg.add(img);
          }
        });
      });

      // Si no encontramos imágenes por color (fallback), usar mainImage del primero
      if (allImages.length === 0 && first?.mainImage) {
        allImages.push(`${MARTINA_IMAGE_BASE}${first.mainImage}`);
      }

      // Colores con datos mínimos para el CSV (omito sizes/images pesados si quieres,
      // pero el usuario pidió tener colores con sus fotos => incluimos todo).
      const coloresSerialized = JSON.stringify(
        colors.map((c) => ({
          id: c.id,
          hex: c.hex,
          name: c.name,
          images: c.images,
        })),
      );

      const subcategorias = subcategoria && subcategoria !== categoryName ? subcategoria : '';

      const providerId = String(first?.id ?? code).trim();

      result.push({
        id: `mdt-${providerId}`,
        relacionados: '',
        name, // limpio, sin sufijo de color
        description,
        precio,
        imagen: allImages.join(' '), // separado por espacio igual que el resto
        categorias: categoryName,
        linkPago: '',
        subcategorias,
        oferta,
        colores: coloresSerialized,
      });
    });

    return result;
  } catch (err: any) {
    console.error('Error al scrapear Martina di Trento:', err.message);
    return [];
  }
}
