import {
  createOrderSnapshot,
  MAX_ORDER_COLOR_NAME_BYTES,
  MAX_ORDER_ID_BYTES,
  MAX_ORDER_LINES,
  MAX_ORDER_PRICE_BYTES,
  MAX_ORDER_QUANTITY,
  type PedidoItemInput,
  type PedidoItemSnapshot,
  type PedidoSnapshotV2,
} from "./orderContract.ts";

export const ORDER_TOKEN_PREFIX = "v2_";
export const ORDER_TOKEN_V3_PREFIX = "v3_";
// Keep a generous margin below the observed ~16 KiB request-line ceiling so
// the browser/server can reach /pedido and render a controlled error.
export const MAX_ORDER_TOKEN_LENGTH = 8 * 1024;
export const MAX_DECOMPRESSED_ORDER_PAYLOAD_BYTES = 48 * 1024;

const MAGIC_0 = 0x42; // B
const MAGIC_1 = 0x53; // S
const TOKEN_VERSION = 2;
const MAX_UINT16 = 0xffff;

class BinaryWriter {
  private readonly bytes: number[] = [];

  writeUint8(value: number): void {
    this.bytes.push(value & 0xff);
  }

  writeUint16(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > MAX_UINT16) {
      throw new Error("Campo binario fuera de rango");
    }
    this.bytes.push((value >>> 8) & 0xff, value & 0xff);
  }

  writeFloat64(value: number): void {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, value, false);
    this.bytes.push(...new Uint8Array(buffer));
  }

  writeBytes(value: Uint8Array): void {
    this.bytes.push(...value);
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

class BinaryReader {
  private position = 0;
  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  private ensure(length: number): void {
    if (length < 0 || this.position + length > this.bytes.length) {
      throw new Error("Token de pedido incompleto");
    }
  }

  readUint8(): number {
    this.ensure(1);
    return this.bytes[this.position++];
  }

  readUint16(): number {
    this.ensure(2);
    const value = (this.bytes[this.position] << 8) | this.bytes[this.position + 1];
    this.position += 2;
    return value;
  }

  readFloat64(): number {
    this.ensure(8);
    const value = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.position, 8).getFloat64(0, false);
    this.position += 8;
    return value;
  }

  readBytes(length: number): Uint8Array {
    this.ensure(length);
    const value = this.bytes.subarray(this.position, this.position + length);
    this.position += length;
    return value;
  }

  get remaining(): number {
    return this.bytes.length - this.position;
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    throw new Error("Token de pedido malformado");
  }

  let base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = base64.length % 4;
  if (remainder) base64 += "=".repeat(4 - remainder);

  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new Error("Token de pedido malformado");
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  if (base64UrlEncode(bytes) !== value) throw new Error("Token de pedido malformado");
  return bytes;
}

function writeString(writer: BinaryWriter, value: string, maxBytes: number, fieldName: string): void {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length > maxBytes || bytes.length > MAX_UINT16) {
    throw new Error(`${fieldName} supera el límite permitido`);
  }
  writer.writeUint16(bytes.length);
  writer.writeBytes(bytes);
}

function writeNullableString(
  writer: BinaryWriter,
  value: string | null,
  maxBytes: number,
  fieldName: string,
): void {
  if (value === null) {
    writer.writeUint8(0);
    return;
  }
  writer.writeUint8(1);
  writeString(writer, value, maxBytes, fieldName);
}

function readString(reader: BinaryReader, maxBytes: number, fieldName: string): string {
  const length = reader.readUint16();
  if (length > maxBytes) throw new Error(`${fieldName} supera el límite permitido`);
  const bytes = reader.readBytes(length);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Token de pedido contiene texto inválido");
  }
}

function readNullableString(
  reader: BinaryReader,
  maxBytes: number,
  fieldName: string,
): string | null {
  const present = reader.readUint8();
  if (present === 0) return null;
  if (present !== 1) throw new Error("Token de pedido malformado");
  return readString(reader, maxBytes, fieldName);
}

function encodeOrderPayloadV2(snapshot: PedidoSnapshotV2): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint8(MAGIC_0);
  writer.writeUint8(MAGIC_1);
  writer.writeUint8(TOKEN_VERSION);
  writer.writeUint8(snapshot.items.length);

  snapshot.items.forEach((item) => {
    writeString(writer, item.id, MAX_ORDER_ID_BYTES, "El id del producto");
    writer.writeFloat64(item.cantidad);
    writeNullableString(writer, item.price, MAX_ORDER_PRICE_BYTES, "El precio del producto");
    if (item.selectedColorId === null) {
      writer.writeUint8(0);
    } else {
      writer.writeUint8(1);
      writer.writeFloat64(item.selectedColorId);
    }
    writeNullableString(writer, item.selectedColorName, MAX_ORDER_COLOR_NAME_BYTES, "El nombre del color");
  });

  return writer.finish();
}

function encodeSnapshot(snapshot: PedidoSnapshotV2): string {
  const token = `${ORDER_TOKEN_PREFIX}${base64UrlEncode(encodeOrderPayloadV2(snapshot))}`;
  if (token.length > MAX_ORDER_TOKEN_LENGTH) {
    throw new Error("El pedido supera el límite de longitud del enlace");
  }
  return token;
}

function decodeOrderPayloadV2(bytes: Uint8Array): PedidoSnapshotV2 {
  if (bytes.byteLength > MAX_DECOMPRESSED_ORDER_PAYLOAD_BYTES) {
    throw new Error("El contenido descomprimido supera el límite permitido");
  }
  const reader = new BinaryReader(bytes);
  if (reader.readUint8() !== MAGIC_0 || reader.readUint8() !== MAGIC_1) {
    throw new Error("Token de pedido malformado");
  }
  if (reader.readUint8() !== TOKEN_VERSION) {
    throw new Error("Versión de token de pedido no compatible");
  }

  const count = reader.readUint8();
  if (count < 1 || count > MAX_ORDER_LINES) throw new Error("Cantidad de productos no válida");

  const items: PedidoItemSnapshot[] = [];
  for (let index = 0; index < count; index += 1) {
    const id = readString(reader, MAX_ORDER_ID_BYTES, "El id del producto");
    const cantidad = reader.readFloat64();
    if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > MAX_ORDER_QUANTITY) {
      throw new Error("La cantidad del pedido no es válida");
    }

    const price = readNullableString(reader, MAX_ORDER_PRICE_BYTES, "El precio del producto");
    const colorPresent = reader.readUint8();
    let selectedColorId: number | null = null;
    if (colorPresent === 1) {
      selectedColorId = reader.readFloat64();
      if (!Number.isSafeInteger(selectedColorId) || selectedColorId < 0) {
        throw new Error("El color del pedido no es válido");
      }
    } else if (colorPresent !== 0) {
      throw new Error("Token de pedido malformado");
    }
    const selectedColorName = readNullableString(reader, MAX_ORDER_COLOR_NAME_BYTES, "El nombre del color");
    items.push({ id, cantidad, price, selectedColorId, selectedColorName });
  }

  if (reader.remaining !== 0) throw new Error("Token de pedido malformado");
  return createOrderSnapshot(items);
}

function decodeSnapshot(token: string): PedidoSnapshotV2 {
  const payload = token.slice(ORDER_TOKEN_PREFIX.length);
  return decodeOrderPayloadV2(base64UrlDecode(payload));
}

async function collectStreamBytes(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
  limitMessage: string,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const chunk = result.value as Uint8Array;
      total += chunk.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch { /* best effort */ }
        throw new Error(limitMessage);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function gzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") {
    throw new Error("CompressionStream no está disponible");
  }

  try {
    // Let pipeThrough coordinate the producer/consumer backpressure. Writing
    // the whole payload before consuming the readable side can deadlock in
    // Chromium when the transform's internal queue fills.
    const compressed = new Blob([bytes])
      .stream()
      .pipeThrough(new CompressionStream("gzip"));
    return await collectStreamBytes(
      compressed,
      MAX_ORDER_TOKEN_LENGTH,
      "El contenido comprimido supera el límite permitido",
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("supera el límite")) throw error;
    throw new Error("No se pudo comprimir el pedido");
  }
}

async function gunzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("DecompressionStream no está disponible");
  }

  try {
    const decompressed = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    return await collectStreamBytes(
      decompressed,
      MAX_DECOMPRESSED_ORDER_PAYLOAD_BYTES,
      "El contenido descomprimido supera el límite permitido",
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("supera el límite")) throw error;
    throw new Error("El token v3 no es un gzip válido");
  }
}

export function encodeOrderTokenV2(items: PedidoSnapshotV2 | readonly PedidoItemInput[]): string {
  const snapshot = Array.isArray(items) ? createOrderSnapshot(items) : createOrderSnapshot(items.items);
  return encodeSnapshot(snapshot);
}

export function decodeOrderTokenV2(token: string): PedidoSnapshotV2 {
  if (typeof token !== "string" || token.length > MAX_ORDER_TOKEN_LENGTH || !token.startsWith(ORDER_TOKEN_PREFIX)) {
    throw new Error("Token de pedido malformado");
  }
  return decodeSnapshot(token);
}

export function isOrderTokenV2(token: string): boolean {
  return typeof token === "string" && token.startsWith(ORDER_TOKEN_PREFIX);
}

export async function encodeOrderTokenV3(items: PedidoSnapshotV2 | readonly PedidoItemInput[]): Promise<string> {
  const snapshot = Array.isArray(items) ? createOrderSnapshot(items) : createOrderSnapshot(items.items);
  const compressed = await gzipBytes(encodeOrderPayloadV2(snapshot));
  const token = `${ORDER_TOKEN_V3_PREFIX}${base64UrlEncode(compressed)}`;
  if (token.length > MAX_ORDER_TOKEN_LENGTH) {
    throw new Error("El pedido supera el límite de longitud del enlace");
  }
  return token;
}

export async function decodeOrderTokenV3(token: string): Promise<PedidoSnapshotV2> {
  if (typeof token !== "string" || token.length > MAX_ORDER_TOKEN_LENGTH || !token.startsWith(ORDER_TOKEN_V3_PREFIX)) {
    throw new Error("Token de pedido malformado");
  }
  const compressed = base64UrlDecode(token.slice(ORDER_TOKEN_V3_PREFIX.length));
  return decodeOrderPayloadV2(await gunzipBytes(compressed));
}

export function isOrderTokenV3(token: string): boolean {
  return typeof token === "string" && token.startsWith(ORDER_TOKEN_V3_PREFIX);
}
