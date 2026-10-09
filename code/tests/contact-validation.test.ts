import assert from 'node:assert/strict';
import test from 'node:test';
import { contactSchema, validateContactInput } from '../src/utils/contactValidation.ts';

const spanish = 'Hola, quisiera consultar sobre uno de sus productos. ¿Podrían brindarme más información y ayudarme con los detalles? Muchas gracias por su atención.';
const base = { name: 'María Pérez', email: 'maria@gmail.com', phone: '099 123-456', subject: 'Consulta sobre productos', message: spanish };
const validate = (overrides: Record<string, unknown> = {}) => validateContactInput({ ...base, ...overrides });

test('accepts natural Spanish and canonicalizes the Uruguayan mobile number', () => {
  const result = validate();
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.phone, '+59899123456');
});

test('accepts international phone formatting and each local mobile prefix', () => {
  for (const phone of ['099123456', '091123456', '096123456', '+598 99 123 456']) {
    assert.equal(validate({ phone }).ok, true, phone);
  }
});

test('rejects malformed phones, extra national zero, and non-string input', () => {
  for (const phone of ['09912345', '+598099123456', '+1 99123456', '+598991234567', 99123456]) {
    assert.equal(validate({ phone }).ok, false, String(phone));
  }
  assert.equal(validateContactInput(null).ok, false);
});

test('email domain and dot-atom local part must be valid', () => {
  for (const email of ['x@gmail.com.evil', 'x@notgmail.com', 'x@gmail.co', 'x@outlook.com.evil', 'foo..bar@gmail.com', '.foo@gmail.com', 'foo.@gmail.com', 'foo..bar@outlook.com', '.foo@outlook.com', 'foo.@outlook.com', 'foo..bar@hotmail.com', '.foo@hotmail.com', 'foo.@hotmail.com', `${'a'.repeat(65)}@gmail.com`, `${'a'.repeat(245)}@gmail.com`, 'ü@gmail.com']) {
    assert.equal(validate({ email }).ok, false, email);
  }
  for (const email of ['x@GMAIL.COM', 'x@outlook.com', 'x@hotmail.com', 'firstname.lastname+tag@gmail.com']) assert.equal(validate({ email }).ok, true);
});

test('requires a plausible full name and meaningful subject', () => {
  for (const name of ['Ana', 'Ana 123', '<b>Ana Perez</b>', 'A1na Perez']) assert.equal(validate({ name }).ok, false, name);
  for (const name of ['Ana María', "Ana O'Neill", 'Ana-Paula Pérez']) assert.equal(validate({ name }).ok, true, name);
  for (const subject of ['abc', 'Gane https://spam.test ahora', 'Consulta\r\nBcc:x', 'Consulta válida\n', '\rConsulta válida', 'Consulta\tválida']) assert.equal(validate({ subject }).ok, false, subject);
});

test('validates messages only by trimmed string length from 100 to 4000', () => {
  for (const message of ['x'.repeat(99), ` ${'x'.repeat(100)} `, 'x'.repeat(4000), 'x'.repeat(4001)]) {
    assert.equal(validate({ message }).ok, message.trim().length >= 100 && message.trim().length <= 4000, `${message.length}`);
  }
  for (const message of ['x'.repeat(100), '界'.repeat(100), 'https://spam.example/'.repeat(6)]) {
    assert.equal(validate({ message }).ok, true, message.slice(0, 60));
  }
  for (const message of [99, null, ' '.repeat(100)]) assert.equal(validate({ message }).ok, false, String(message));
});

test('honeypot website must remain empty', () => {
  assert.equal(validate({ website: 'spam' }).ok, false);
});

test('exports the Zod schema and inferred data contract', () => {
  const parsed = contactSchema.safeParse({ ...base, website: '', extra: 'stripped' });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.deepEqual(Object.keys(parsed.data).sort(), ['email', 'message', 'name', 'phone', 'subject']);
    assert.equal(parsed.data.phone, '+59899123456');
  }
  assert.equal(contactSchema.safeParse({ ...base, website: 'spam' }).success, false);
  assert.equal(contactSchema.safeParse({ ...base, subject: 'Consulta\r\nBcc:x' }).success, false);
});
