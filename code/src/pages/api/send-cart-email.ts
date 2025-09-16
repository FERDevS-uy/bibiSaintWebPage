import type { APIRoute } from 'astro';
import { Resend } from 'resend';
export const prerender = false;

// Inicializa Resend con tu API key
const resend = new Resend(import.meta.env.RESEND_API_KEY);

// Define el manejador para el método POST
export const POST: APIRoute = async ({ request }) => {
  try {
    // Parsea el cuerpo de la solicitud como JSON
    const data = await request.json();
    const { cart, total } = data;

    // Asegúrate de que los datos existen antes de continuar
    if (!cart || !total) {
      return new Response(JSON.stringify({
        ok: false,
        error: "Faltan datos del carrito o del total."
      }), { status: 400 });
    }

    // Construye el contenido del email en HTML
    const cartItemsHtml = cart.map(p => `<li>${p.name} x${p.cantidad} ($${p.price})</li>`).join('');
    const emailHtml = `
      <p>¡Nuevo pedido recibido!</p>
      <p>Detalles del pedido:</p>
      <ul>${cartItemsHtml}</ul>
      <p><strong>Total: $${total}</strong></p>
    `;

    // Envía el email a través de la API de Resend
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: 'franccesco.giordano11@gmail.com',
      subject: 'Nuevo pedido desde el carrito',
      html: emailHtml
    });

    // Si todo sale bien, devuelve una respuesta de éxito
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err: unknown) {
    // Si hay un error, captura el mensaje y devuelve una respuesta de error
    const errorMessage = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: errorMessage }), { status: 500 });
  }
};