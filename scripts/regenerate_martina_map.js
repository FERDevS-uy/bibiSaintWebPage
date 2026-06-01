#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');

(async () => {
  try {
    const repoRoot = path.resolve(__dirname, '..');
    const rawDir = path.resolve(repoRoot, 'data', 'martina_raw');
    const productMap = {};

    const files = await fs.readdir(rawDir);
    for (const fname of files) {
      if (!/^[0-9]+\.json$/.test(fname)) continue;
      const code = fname.replace(/\.json$/, '');
      try {
        const content = await fs.readFile(path.resolve(rawDir, fname), 'utf-8');
        const arr = JSON.parse(content || '[]');
        if (!Array.isArray(arr)) continue;
        for (const entry of arr) {
          const candidateId = (entry && (entry.id ?? entry.productId ?? (entry.product && entry.product.id))) || '';
          const providerId = String(candidateId || '').trim();
          if (!providerId) continue;
          if (!productMap[providerId]) {
            productMap[providerId] = { code };
            if (entry?.productLineId) productMap[providerId].productLineId = String(entry.productLineId);
            else if (entry?.productLine && entry.productLine.id) productMap[providerId].productLineId = String(entry.productLine.id);
          }
        }
      } catch (e) {
        // ignorar archivos corruptos
      }
    }

    await fs.writeFile(path.resolve(rawDir, 'map.json'), JSON.stringify(productMap, null, 2));
    console.log('map.json regenerado. Entradas:', Object.keys(productMap).length);
  } catch (e) {
    console.error('Error regenerando map.json:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
