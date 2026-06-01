// Esta ruta API funciona solo en un servidor Node.js (Vercel/Netlify/Railway/etc.).
// En GitHub Pages el sitio es estático y el formulario debe usar un servicio externo como Formspree.
import nodemailer from 'nodemailer';

const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL || 'bibisventasysserviciosonline@gmail.com';
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER || process.env.USER_EMAIL;
const SMTP_PASS = process.env.SMTP_PASS || process.env.USER_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

function getRecipient(subject: string) {
  const normalized = subject?.toLowerCase() || '';

  if (normalized.includes('codificación') || normalized.includes('codificacion') || normalized.includes('biológica') || normalized.includes('biologica')) {
    return CONTACT_TO_EMAIL;
  }

  if (normalized.includes('numerológica') || normalized.includes('numerologica')) {
    return CONTACT_TO_EMAIL;
  }

  return CONTACT_TO_EMAIL;
}

function formatMessage({ name, email, phone, subject, message }: Record<string, string>) {
  return `Nuevo mensaje desde el formulario de contacto:\n\nNombre: ${name}\nEmail: ${email}\nTeléfono: ${phone}\nAsunto: ${subject}\n\nMensaje:\n${message}`;
}

export async function POST({ request }: { request: Request }) {
  try {
    const data = await request.json();
    const { name, email, phone, subject, message } = data || {};

    if (!name || !email || !phone || !subject || !message) {
      return new Response(JSON.stringify({ message: 'Todos los campos son obligatorios.' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const recipient = getRecipient(subject);
    const bodyText = formatMessage({ name, email, phone, subject, message });

    if (!SMTP_USER || !SMTP_PASS) {
      return new Response(JSON.stringify({ message: 'SMTP no configurado.', code: 'SMTP_NOT_CONFIGURED' }), {
        status: 501,
        headers: { 'content-type': 'application/json' },
      });
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: SMTP_FROM,
      to: recipient,
      subject: `Contacto desde Bibi Saint Web - ${subject}`,
      text: bodyText,
      html: `<p>Nuevo mensaje desde el formulario de contacto.</p>
        <p><strong>Nombre:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Teléfono:</strong> ${phone}</p>
        <p><strong>Asunto:</strong> ${subject}</p>
        <p><strong>Mensaje:</strong></p>
        <p>${message.replace(/\n/g, '<br/>')}</p>`,
    });

    return new Response(JSON.stringify({ message: 'Correo enviado correctamente.' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ message: 'Error interno del servidor.' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
