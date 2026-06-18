/**
 * Migración CSV → Supabase.
 * Lee productos.csv + productos_catalogo.csv y los inserta en Supabase.
 *
 * Uso:
 *   node scripts/migrateToSupabase.mjs
 *
 * Requisitos:
 *   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY en .env o variables de entorno
 *   - Migración SQL 001_initial_schema.sql ya ejecutada en Supabase
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import Papa from "papaparse";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Leer .env manualmente (sin dotenv)
function loadEnv() {
  const envPath = resolve(__dirname, "..", ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// Utilidades de transformación (copiadas de loadCSV.ts pero simplificadas)
function parseImageList(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return [];
  const urlMatches = trimmed.match(/https?:\/\/.*?(?=https?:\/\/|$)/g);
  if (urlMatches?.length > 0) return urlMatches.filter(Boolean);
  return trimmed.split(/\s+/).filter(Boolean);
}

function parseSubcategories(rawSubcategories, category) {
  const trimmed = String(rawSubcategories ?? "").trim();
  if (trimmed) return trimmed.split("|").map((s) => ({ name: s.trim(), count: 0 }));
  return [];
}

function parseColors(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((c) => ({
        id: Number(c.id),
        hex: String(c.hex ?? "#cccccc"),
        name: String(c.name ?? ""),
        images: Array.isArray(c.images) ? c.images.map((i) => String(i)) : [],
        sizes: Array.isArray(c.sizes) ? c.sizes.map((s) => String(s).toUpperCase()) : undefined,
      })).filter((c) => Number.isFinite(c.id) && c.name);
    }
  } catch {}
  return [];
}

function parseProductsFromCsv(csvPath) {
  if (!existsSync(csvPath)) return [];
  const file = readFileSync(csvPath, "utf8");
  const res = Papa.parse(file, { header: true, skipEmptyLines: true });
  if (res.errors.length > 0) console.error("Errores CSV:", res.errors);

  return res.data.map((d) => {
    const images = parseImageList(d.imagen);
    const paymentLinks = parseImageList(d.linkPago).map((lp, i) => ({ id: `${i}`, url: lp }));
    return {
      id: d.id?.trim() ?? "",
      name: d.name?.trim() ?? "",
      description: d.description?.trim() ?? "",
      price: d.precio?.trim() ?? "0",
      img: images,
      payment_link: paymentLinks,
      en_oferta: (d.oferta ?? "").toLowerCase() === "true",
      relacionados: d.relacionados?.trim() ? d.relacionados.trim().split(/\s+/) : [],
      categories: {
        name: d.categorias?.trim() ?? "",
        subcategories: parseSubcategories(d.subcategorias, d.categorias),
      },
      colors: parseColors(d.colores),
    };
  });
}

async function migrate() {
  const dataDir = resolve(__dirname, "..", "src", "data");
  const productosBase = parseProductsFromCsv(resolve(dataDir, "productos.csv"));
  const productosCatalogo = parseProductsFromCsv(resolve(dataDir, "productos_catalogo.csv"));
  const allProducts = [...productosBase, ...productosCatalogo];

  console.log(`Total productos: ${allProducts.length}`);

  // Limpiar datos existentes
  console.log("Limpiando datos existentes...");
  await supabase.from("product_images").delete().neq("product_id", "__dummy__");
  await supabase.from("product_related").delete().neq("product_id", "__dummy__");
  await supabase.from("products").delete().neq("id", "__dummy__");

  // 1. Insertar productos
  const BATCH_SIZE = 50;
  let inserted = 0;
  let errors = 0;

  console.log("Insertando productos...");

  for (let i = 0; i < allProducts.length; i += BATCH_SIZE) {
    const batch = allProducts.slice(i, i + BATCH_SIZE).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      img: p.img,
      categories: p.categories,
      payment_link: p.payment_link,
      relacionados: p.relacionados,
      en_oferta: p.en_oferta,
      source: "scraper",
      active: true,
      auto_update_price: false,
      colors: p.colors,
    }));

    const { error } = await supabase.from("products").upsert(batch, {
      onConflict: "id",
      ignoreDuplicates: false,
    });

    if (error) {
      console.error(`Batch ${i / BATCH_SIZE} error:`, error.message);
      errors++;
    } else {
      inserted += batch.length;
      process.stdout.write(`\r${inserted}/${allProducts.length}`);
    }
  }

  console.log(`\n✓ Productos: ${inserted} insertados/actualizados`);
  if (errors) console.error(`  ${errors} batches con error`);

  // 2. Relaciones bidireccionales (batch)
  console.log("Procesando relaciones...");
  await supabase.from("product_related").delete().neq("product_id", "__dummy__");

  const productIds = new Set(allProducts.map((p) => p.id));
  const pairs = new Set();

  for (const row of allProducts) {
    if (!row.relacionados?.length) continue;
    for (const relId of row.relacionados) {
      if (!productIds.has(relId)) continue;
      const key = [row.id, relId].sort().join("::");
      if (pairs.has(key)) continue;
      pairs.add(key);
    }
  }

  const allPairEntries = [...pairs].map((key) => {
    const [a, b] = key.split("::");
    return { product_id: a, related_id: b, position: 0 };
  });

  console.log(`  ${allPairEntries.length} relaciones únicas para insertar...`);

  let relatedCount = 0;
  for (let i = 0; i < allPairEntries.length; i += BATCH_SIZE) {
    const batch = allPairEntries.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("product_related").upsert(batch, {
      onConflict: "product_id, related_id",
    });
    if (!error) relatedCount += batch.length;
  }

  console.log(`✓ Relaciones: ${relatedCount} creadas`);

  // 3. Imágenes (batch)
  console.log("Registrando imágenes...");
  const allImages = [];
  for (const row of allProducts) {
    if (!row.img.length) continue;
    for (let idx = 0; idx < row.img.length; idx++) {
      allImages.push({ product_id: row.id, url: row.img[idx], position: idx });
    }
  }

  let imageCount = 0;
  for (let i = 0; i < allImages.length; i += BATCH_SIZE) {
    const batch = allImages.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("product_images").upsert(batch, { onConflict: undefined });
    if (!error) imageCount += batch.length;
  }

  console.log(`✓ Imágenes: ${imageCount} registradas`);
  console.log("\n✅ Migración completada.");
}

migrate().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
