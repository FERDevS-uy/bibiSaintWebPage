import { hasTrustedOrigin } from './security/origin.ts';
import { validateContactInput } from '../utils/contactValidation.ts';

const MAX_BODY_BYTES = 12 * 1024;
const FORMSPREE_URL = 'https://formspree.io/f/mwvzalvq';
type HandlerOptions = { fetchImpl?: typeof fetch };

function json(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

async function readBoundedBody(request: Request): Promise<string | null> {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function createContactHandler({ fetchImpl = fetch }: HandlerOptions = {}) {
  return async function handleContact(request: Request): Promise<Response> {
    if (!hasTrustedOrigin(request)) return json({ message: 'Origen no permitido.' }, 403);
    if (request.method !== 'POST') return json({ message: 'Método no permitido.' }, 405);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ message: 'Se requiere contenido JSON.' }, 415);
    let text: string | null;
    try { text = await readBoundedBody(request); } catch { return json({ message: 'Solicitud JSON inválida.' }, 400); }
    if (text === null) return json({ message: 'La solicitud excede el tamaño permitido.' }, 413);
    let input: unknown;
    try { input = JSON.parse(text); } catch { return json({ message: 'Solicitud JSON inválida.' }, 400); }
    const validation = validateContactInput(input);
    if (!validation.ok) return json({ message: 'Revisá los campos señalados.', errors: validation.errors }, 422);
    const { name, email, phone, subject, message } = validation.data;
    try {
      const upstream = await fetchImpl(FORMSPREE_URL, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, phone, subject, message, _subject: 'Nuevo mensaje desde el formulario de contacto', _language: 'es' }),
        signal: AbortSignal.timeout(8000),
      });
      if (!upstream.ok) return json({ message: 'No pudimos enviar el mensaje. Intentá nuevamente.' }, 502);
      let result: unknown;
      try { result = await upstream.json(); } catch { return json({ message: 'No pudimos confirmar el envío. Intentá nuevamente.' }, 502); }
      if (!result || typeof result !== 'object' || !('ok' in result && result.ok === true) && !('success' in result && result.success === true)) return json({ message: 'No pudimos confirmar el envío. Intentá nuevamente.' }, 502);
      return json({ ok: true, message: 'Mensaje enviado.' }, 200);
    } catch (error) {
      return json({ message: error instanceof Error && error.name === 'TimeoutError' ? 'El envío tardó demasiado. Intentá nuevamente.' : 'No pudimos enviar el mensaje. Intentá nuevamente.' }, error instanceof Error && error.name === 'TimeoutError' ? 504 : 502);
    }
  };
}
