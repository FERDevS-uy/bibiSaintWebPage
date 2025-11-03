/////////////////////////
// Utilidades de texto //
/////////////////////////

// Aseguramos TextEncoder/TextDecoder en Node y navegador
const _TextEncoder = (typeof TextEncoder !== "undefined")
    ? TextEncoder
    : (() => {
        try { return require("util").TextEncoder; } catch { throw new Error("TextEncoder no disponible"); }
    })();

const _TextDecoder = (typeof TextDecoder !== "undefined")
    ? TextDecoder
    : (() => {
        try { return require("util").TextDecoder; } catch { throw new Error("TextDecoder no disponible"); }
    })();

const textEncoder = new _TextEncoder();
const textDecoder = new _TextDecoder();

/////////////////////////////
// Base64URL encode / decode
/////////////////////////////

function base64UrlEncode(bytes: Uint8Array): string {
    // Node: use Buffer
    if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
        const b64 = Buffer.from(bytes).toString("base64");
        return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }

    // Browser fallback using btoa
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes.subarray(i, i + chunk)));
    }
    const b64 = btoa(binary);
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(b64url: string): Uint8Array {
    // Normalize
    let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    if (pad) b64 += "=".repeat(4 - pad);

    // Node: use Buffer
    if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
        const buf = Buffer.from(b64, "base64");
        return new Uint8Array(buf);
    }

    // Browser fallback using atob
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

//////////////////
// PRNG: xorshift
//////////////////

/**
 * Crea un PRNG simple basado en xorshift (32-bit).
 * Devuelve una función que cada llamada retorna un uint32 (0..2^32-1).
 */
function makePRNG(seed: number): () => number {
    // asegure seed 32-bit no cero
    let x = (seed >>> 0) || 123456789;
    return function next() {
        // xorshift32
        x ^= (x << 13);
        x ^= (x >>> 17);
        x ^= (x << 5);
        return (x >>> 0);
    };
}

/**
 * Deriva una semilla 32-bit desde una cadena (password).
 * No es criptográficamente fuerte; es determinística.
 */
function seedFromPassword(pw: string): number {
    let h = 2166136261 >>> 0; // FNV offset basis
    for (let i = 0; i < pw.length; i++) {
        h ^= pw.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0; // FNV prime
    }
    // mezclar un poco más
    h = (h ^ (h >>> 16)) >>> 0;
    return h || 123456789;
}

/////////////////////////////////////
// Funciones principales: encriptar /
/////////////////////////////////////

/**
 * Encripta (ofusca) un array de IDs (strings) a un token URL-safe.
 * Reversible con la misma password.
 *
 * @param idsArray Array de identificadores (strings)
 * @param password Contraseña/llave para la ofuscación (string)
 * @returns token Base64URL-safe
 */
export function encryptIDs(idsArray: string[], password: string): string {
    if (!Array.isArray(idsArray)) throw new TypeError("idsArray debe ser un array de strings");
    const json = JSON.stringify(idsArray);
    const data = textEncoder.encode(json); // Uint8Array

    const seed = seedFromPassword(password);
    const prng = makePRNG(seed);

    const out = new Uint8Array(data.length);
    let val = 0;
    for (let i = 0; i < data.length; i++) {
        if (i % 4 === 0) val = prng();
        out[i] = data[i] ^ ((val >>> ((i % 4) * 8)) & 0xff);
    }

    return base64UrlEncode(out);
}

/**
 * Desencripta el token generado por `encryptIDs`.
 * @param token Token Base64URL generado por encryptIDs
 * @param password Misma password usada al encriptar
 * @returns Array original de IDs
 */
export function decryptIDs(token: string, password: string): string[] {
    if (typeof token !== "string") throw new TypeError("token debe ser una cadena");
    const data = base64UrlDecode(token);

    const seed = seedFromPassword(password);
    const prng = makePRNG(seed);

    const out = new Uint8Array(data.length);
    let val = 0;
    for (let i = 0; i < data.length; i++) {
        if (i % 4 === 0) val = prng();
        out[i] = data[i] ^ ((val >>> ((i % 4) * 8)) & 0xff);
    }

    const json = textDecoder.decode(out);
    return JSON.parse(json) as string[];
}