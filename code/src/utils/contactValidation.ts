import { z } from 'zod';

export type ContactField = 'name' | 'email' | 'phone' | 'subject' | 'message' | 'website';

const inputString = (message: string) => z.preprocess(
  (value) => value === undefined ? '' : value,
  z.string({ error: message }).trim(),
);

const subjectInputString = z.preprocess(
  (value) => value === undefined ? '' : value,
  z.string({ error: 'Ingresá un asunto válido.' })
    .refine((value) => !/[\r\n\x00-\x1f]/.test(value), 'Ingresá un asunto válido.')
    .trim(),
);

const NAME_PART = /^\p{L}+(?:['’\-]\p{L}+)*$/u;
const EMAIL_LOCAL_PART = /^[A-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;
const ALLOWED_EMAIL_DOMAIN = /^(?:gmail\.com|outlook\.com|hotmail\.com)$/i;
const PHONE_FORMATTING = /[ -]/g;
const MEANINGFUL_TEXT = /\p{L}/u;
const REPEATED_CHARACTER = /(.)\1{7,}/u;
const SUBJECT_UNSAFE = /https?:\/\/|www\.|(.)\1{7,}/iu;

const nameSchema = inputString('Ingresá nombre y apellido válidos.')
  .transform((value) => value.replace(/\s+/g, ' '))
  .refine((value) => {
    const parts = value.split(' ');
    return value.length >= 2 && value.length <= 120 && parts.length >= 2 && parts.every((part) => NAME_PART.test(part));
  }, 'Ingresá nombre y apellido válidos.');

const emailSchema = inputString('Ingresá un correo Gmail, Outlook o Hotmail válido.')
  .refine((value) => {
    const [localPart, domain, ...extra] = value.split('@');
    return value.length <= 254 && extra.length === 0 && localPart.length <= 64 && EMAIL_LOCAL_PART.test(localPart) && ALLOWED_EMAIL_DOMAIN.test(domain ?? '');
  }, 'Ingresá un correo Gmail, Outlook o Hotmail válido.');

const phoneSchema = inputString('Ingresá un celular uruguayo válido.')
  .transform((value) => value.replace(PHONE_FORMATTING, ''))
  .transform((value) => /^09[0-9]{7}$/.test(value) ? `+598${value.slice(1)}` : value)
  .refine((value) => /^\+5989[0-9]{7}$/.test(value), 'Ingresá un celular uruguayo válido.');

const subjectSchema = subjectInputString
  .refine((value) => {
    const hasValidLength = value.length >= 5 && value.length <= 180;
    const hasMeaningfulText = MEANINGFUL_TEXT.test(value);
    const hasUnsafeContent = REPEATED_CHARACTER.test(value) || SUBJECT_UNSAFE.test(value);
    return hasValidLength && hasMeaningfulText && !hasUnsafeContent;
  }, 'Ingresá un asunto válido.')
  .transform((value) => value.replace(/\s+/g, ' '));

const messageSchema = inputString('Ingresá un mensaje entre 100 y 4000 caracteres.')
  .refine((value) => value.length >= 100 && value.length <= 4000, 'Ingresá un mensaje entre 100 y 4000 caracteres.');

const websiteSchema = z.preprocess((value) => value === undefined ? '' : value, z.unknown())
  .refine((value) => typeof value !== 'string' || value.trim() === '', 'Envío inválido.');

const contactObjectSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  subject: subjectSchema,
  message: messageSchema,
  website: websiteSchema,
});

export const contactSchema = contactObjectSchema.transform(({ website: _website, ...data }) => data);

export type ContactData = z.infer<typeof contactSchema>;
export type ContactValidationResult =
  | { ok: true; data: ContactData }
  | { ok: false; errors: Partial<Record<ContactField, string>> };

export function validateContactInput(input: unknown): ContactValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: { message: 'Datos inválidos.' } };

  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Partial<Record<ContactField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && ['name', 'email', 'phone', 'subject', 'message', 'website'].includes(field) && !(field in errors)) {
        errors[field as ContactField] = issue.message;
      }
    }
    return { ok: false, errors };
  }

  return { ok: true, data: parsed.data };
}
