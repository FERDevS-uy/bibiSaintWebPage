import fs from 'fs/promises';
import path from 'path';
import Papa from 'papaparse';
import dotenv from "dotenv";

import { scrapNuvexProducts } from './scrapers/nuvex';
import { scrapKaiDeco } from './scrapers/kaideco';
import { scrapMartinaDiTrento } from './scrapers/martina';
import { searchSimilarity, Product } from './utils/product';
import { stringSimilarity } from 'string-similarity-js';

dotenv.config();

const csvFilePath = path.resolve(__dirname, '../../code/src/data/productos.csv');

async function compareWithCopy(newProducts: Product[]) {
  const copyCsvPath = path.resolve(__dirname, '../../code/src/data/productos copy.csv');
  try {
    const content = await fs.readFile(copyCsvPath, 'utf-8');
    const parsed = Papa.parse(content, { header: true, skipEmptyLines: true }) as any;
    const copyArr: any[] = Array.isArray(parsed.data) ? parsed.data : [];
    if (copyArr.length === 0) {
      console.warn('CSV de copia vacío o no encontrado en:', copyCsvPath);
      return;
    }
    const threshold = 0.85;
    const matchedNew: Array<{ newId: string; copyIndex: number; score: number }> = [];
    const unmatchedNew: Product[] = [];
    const copyMatchedFlags = new Array(copyArr.length).fill(false);
    for (const p of newProducts) {
      let bestScore = 0;
      let bestIdx = -1;
      for (let i = 0; i < copyArr.length; i++) {
        const cpName = String(copyArr[i].name || copyArr[i]['name'] || '');
        const s = stringSimilarity(p.name, cpName);
        if (s > bestScore) {
          bestScore = s;
          bestIdx = i;
        }
      }
      if (bestScore >= threshold && bestIdx !== -1) {
        matchedNew.push({ newId: p.id, copyIndex: bestIdx, score: bestScore });
        copyMatchedFlags[bestIdx] = true;
      } else {
        unmatchedNew.push(p);
      }
    }
    const missingInNew = copyArr.filter((_cp: any, idx: number) => !copyMatchedFlags[idx]);
    const report = {
      totalNew: newProducts.length,
      totalCopy: copyArr.length,
      matched: matchedNew.length,
      unmatchedNew: unmatchedNew.length,
      missingInNew: missingInNew.length,
      unmatchedSample: unmatchedNew.slice(0, 30).map((p) => ({ id: p.id, name: p.name })),
      missingSample: missingInNew.slice(0, 30).map((cp: any) => ({ id: cp.id, name: cp.name || cp['name'] })),
    };
    const rawDir = path.resolve(__dirname, '../../data/martina_raw');
    try {
      await fs.mkdir(rawDir, { recursive: true });
      await fs.writeFile(path.resolve(rawDir, 'compare_report.json'), JSON.stringify(report, null, 2));
      console.log('Comparación completa:', `matched ${report.matched}, unmatched new ${report.unmatchedNew}, missing in new ${report.missingInNew}. Report guardado en ${path.resolve(rawDir, 'compare_report.json')}`);
    } catch (err: any) {
      console.warn('No se pudo guardar informe de comparación:', err.message || err);
    }
  } catch (err: any) {
    console.warn('No se pudo leer o parsear CSV copia:', err.message || err);
  }
}

async function scrapAllProducts() {
  console.log('=== Iniciando scraping unificado de Nuvex, Kai Deco y Martina di Trento ===');
  const [nuvexProducts, kaiProducts, martinaProducts] = await Promise.all([
    scrapNuvexProducts(),
    scrapKaiDeco(),
    scrapMartinaDiTrento(),
  ]);
  const allProducts = [...nuvexProducts, ...kaiProducts, ...martinaProducts];
  console.log(`Total de productos unificados antes de similitud: ${allProducts.length}`);
  const parsedProducts = searchSimilarity(allProducts);
  console.log(`Scraping finalizado. ${parsedProducts.length} productos generados.`);
  const finalCsv = Papa.unparse(parsedProducts, {
    columns: ['id', 'relacionados', 'name', 'description', 'precio', 'imagen', 'categorias', 'linkPago', 'subcategorias', 'oferta', 'colores'],
  });
  await fs.writeFile(csvFilePath, finalCsv);
  console.log('¡Todo guardado correctamente en productos.csv!');
  try {
    await compareWithCopy(parsedProducts);
  } catch (e: any) {
    console.warn('Error durante comparación con CSV copia:', e.message || e);
  }
}

// Permitir ejecutar solo Martina para pruebas rápidas con `ONLY_MARTINA=1`
if (process.env.ONLY_MARTINA === '1' || process.env.ONLY_MARTINA === 'true') {
  (async () => {
    console.log('=== Ejecutando SOLO Martina di Trento ===');
    const martinaProducts = await scrapMartinaDiTrento();
    const parsedProducts = searchSimilarity(martinaProducts);
    console.log(`Martina-only: ${parsedProducts.length} productos generados.`);
    const finalCsv = Papa.unparse(parsedProducts, {
      columns: ['id', 'relacionados', 'name', 'description', 'precio', 'imagen', 'categorias', 'linkPago', 'subcategorias', 'oferta', 'colores'],
    });
    try {
      await fs.writeFile(csvFilePath, finalCsv);
      console.log('Martina-only CSV guardado en', csvFilePath);
    } catch (e: any) {
      console.warn('No se pudo guardar CSV Martina-only:', e.message || e);
    }
    try {
      await compareWithCopy(parsedProducts);
    } catch (e: any) {
      console.warn('Error durante compareWithCopy:', e.message || e);
    }
  })();
} else {
  scrapAllProducts();
}
