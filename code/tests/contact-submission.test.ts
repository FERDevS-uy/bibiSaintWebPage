import assert from 'node:assert/strict';
import test from 'node:test';
import { createContactHandler } from '../src/server/contactSubmission.ts';

const message = 'Hola, quisiera consultar sobre uno de sus productos. ¿Podrían brindarme más información y ayudarme con los detalles? Muchas gracias por su atención. También quisiera conocer los medios de pago disponibles. Quedo atento a su respuesta.';
const input = { name: 'María Pérez', email: 'maria@gmail.com', phone: '099 123-456', subject: 'Consulta sobre productos', message };
const makeRequest = (body: unknown = input, headers: Record<string, string> = {}) => new Request('https://tienda.example/api/contact', { method: 'POST', headers: { origin: 'https://tienda.example', 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const payload = (body: unknown = input) => ({ ...input, ...(body as object) });

test('rejects an untrusted origin before reading or forwarding the body', async () => {
  let calls = 0;
  const handler = createContactHandler({ fetchImpl: async () => { calls++; return new Response('{}'); } });
  const response = await handler(makeRequest(input, { origin: 'https://evil.example' }));
  assert.equal(response.status, 403);
  assert.equal(calls, 0);
});

test('enforces method, JSON content type, parsing, byte limit, and shared validation', async () => {
  const handler = createContactHandler({ fetchImpl: async () => { throw new Error('must not fetch'); } });
  assert.equal((await handler(new Request('https://tienda.example/api/contact', { method: 'GET', headers: { origin: 'https://tienda.example' } }))).status, 405);
  assert.equal((await handler(makeRequest(input, { 'content-type': 'text/plain' }))).status, 415);
  assert.equal((await handler(makeRequest('{'))).status, 400);
  assert.equal((await handler(makeRequest('x'.repeat(12_289)))).status, 413);
  for (const overrides of [{ phone: '123' }, { name: 'Ana' }, { email: 'x@example.com' }, { message: 'x'.repeat(99) }, { message: 'x'.repeat(99) }, { subject: '!!!' }, { website: 'bot' }]) {
    assert.equal((await handler(makeRequest(payload(overrides)))).status, 422, JSON.stringify(overrides));
  }
});

test('forwards only validated canonical fields to the fixed Formspree endpoint', async () => {
  let observed: { url: string; init: RequestInit } | undefined;
  const handler = createContactHandler({ fetchImpl: async (url, init) => { observed = { url: String(url), init }; return Response.json({ ok: true }); } });
  const response = await handler(makeRequest({ ...input, phone: '099123456', extra: 'secret', _subject: 'junk', website: '' }));
  assert.equal(response.status, 200);
  assert.equal(observed?.url, 'https://formspree.io/f/mwvzalvq');
  assert.deepEqual(JSON.parse(String(observed?.init.body)), { name: input.name, email: input.email, phone: '+59899123456', subject: input.subject, message, _subject: 'Nuevo mensaje desde el formulario de contacto', _language: 'es' });
  assert.equal((await handler(makeRequest(payload()))).status, 200);
  assert.equal((await handler(makeRequest(payload({ message: 'English message accepted. '.repeat(5) })))).status, 200);
});

test('does not report upstream failures, invalid success bodies, network errors, or timeout as success', async () => {
  for (const fetchImpl of [
    async () => new Response('no', { status: 429 }),
    async () => new Response('<html>ok</html>', { status: 200 }),
    async () => Response.json({ ok: false }),
    async () => new Response('{}', { status: 200 }),
    async () => { throw new Error('network'); },
    async () => { const error = new Error('timeout'); error.name = 'TimeoutError'; throw error; },
  ]) {
    const response = await createContactHandler({ fetchImpl })(makeRequest());
    assert.ok(response.status >= 400, String(response.status));
    assert.notEqual(response.status, 200);
  }
  const success = await createContactHandler({ fetchImpl: async () => Response.json({ success: true }) })(makeRequest());
  assert.equal(success.status, 200);
});
