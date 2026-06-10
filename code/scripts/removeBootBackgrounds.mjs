#!/usr/bin/env node
/**
 * Eliminacion de fondo en batch para imagenes de botas.
 *
 * Usa `rembg` (biblioteca Python de codigo abierto, equivalente local a remove.bg)
 * con el modelo `birefnet-general`, el modelo mas avanzado disponible.
 * Calidad muy cercana a remove.bg, sin limites de API y totalmente local.
 *
 * Flags:
 *   --input=PATH            Carpeta con imagenes originales
 *   --output=PATH           Carpeta de salida
 *   --model=NOMBRE          Modelo de rembg (default: birefnet-general)
 *                           Otros: birefnet-general-lite, isnet-general-use, u2net
 *   --quality=N             Calidad WebP 1-100 (default: 92)
 *   --no-alpha-matting      Desactiva el refinamiento de bordes (mas rapido)
 *   --keep-png              Conserva el PNG intermedio para inspeccion
 *   --dry-run               Solo lista los archivos sin procesar
 */
import { readdir, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

const cwd = process.cwd();

const args = process.argv.slice(2);
const flags = new Set(args);

function getArgValue(name, fallback) {
  const pref = `${name}=`;
  const hit = args.find((a) => a.startsWith(pref));
  if (!hit) return fallback;
  return hit.slice(pref.length);
}

const inputDir = path.resolve(cwd, getArgValue("--input", "public/imagenes_catalogo_webp"));
const outputDir = path.resolve(
  cwd,
  getArgValue("--output", "public/imagenes_catalogo_webp_sin_fondo"),
);
const quality = Number(getArgValue("--quality", "92"));
const model = getArgValue("--model", "birefnet-general");
const dryRun = flags.has("--dry-run");
const keepPng = flags.has("--keep-png");
const useAlphaMatting = !flags.has("--no-alpha-matting");

const allowedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);

// Resolver el binario de rembg: preferir el del venv en la raiz del repo
const rembgBinary = (() => {
  const candidates = [
    path.resolve(cwd, "..", ".venv", "bin", "rembg"),
    path.resolve(cwd, ".venv", "bin", "rembg"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return "rembg";
})();

function runCommand(cmd, cmdArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolve();
        return;
      }
      reject(new Error(`${cmd} exited con codigo ${exitCode}\n${stderr.trim()}`));
    });
  });
}

async function findBootImages(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.toLowerCase().startsWith("tal-"))
    .filter((name) => allowedExtensions.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

function validateDependencies() {
  return new Promise((resolve, reject) => {
    const child = spawn(rembgBinary, ["--help"], {
      stdio: "ignore",
      shell: false,
    });

    child.on("error", () => {
      reject(
        new Error(
          `No encontre 'rembg' (busque en: ${rembgBinary}). Instala con: pip install "rembg[cpu,cli]"`,
        ),
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error("'rembg --help' fallo. Revisa la instalacion de rembg."));
    });
  });
}

function buildRembgArgs(input, output) {
  const a = ["i", "-m", model];
  if (useAlphaMatting) {
    // Parametros recomendados para refinar bordes de productos
    a.push(
      "-a",
      "-af", "240",  // foreground threshold
      "-ab", "20",   // background threshold
      "-ae", "10",   // erode size
    );
  }
  a.push(input, output);
  return a;
}

async function main() {
  if (!existsSync(inputDir)) {
    throw new Error(`No existe la carpeta de entrada: ${inputDir}`);
  }

  const files = await findBootImages(inputDir);
  if (files.length === 0) {
    console.log("No encontre imagenes de botas para procesar (prefijo tal-).");
    return;
  }

  await mkdir(outputDir, { recursive: true });

  console.log(`Imagenes encontradas: ${files.length}`);
  console.log(`Entrada: ${inputDir}`);
  console.log(`Salida:  ${outputDir}`);
  console.log(`Modelo:  ${model}${useAlphaMatting ? " (con alpha matting)" : ""}`);
  console.log(`rembg:   ${rembgBinary}`);

  if (dryRun) {
    files.forEach((file) => console.log(`- ${file}`));
    console.log("Dry run finalizado. No se procesaron archivos.");
    return;
  }

  await validateDependencies();

  let processed = 0;
  for (const file of files) {
    const inputPath = path.join(inputDir, file);
    const baseName = path.parse(file).name;
    const tempPngPath = path.join(outputDir, `${baseName}.png`);
    const finalWebpPath = path.join(outputDir, `${baseName}.webp`);

    process.stdout.write(`Procesando (${processed + 1}/${files.length}): ${file} ... `);
    await runCommand(rembgBinary, buildRembgArgs(inputPath, tempPngPath));

    await sharp(tempPngPath)
      .webp({ quality: Number.isFinite(quality) ? quality : 92, lossless: false })
      .toFile(finalWebpPath);

    if (!keepPng) {
      await rm(tempPngPath, { force: true });
    }

    process.stdout.write("listo\n");
    processed += 1;
  }

  console.log(`\nCompletado. Archivos procesados: ${processed}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
