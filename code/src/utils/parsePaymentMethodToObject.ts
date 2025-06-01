import type { PaymentMethod } from "../types/paymentMethod";

type Codes = Record<string, string>;
const codes: Codes = {
  mp: "Mercado Pago",
  ws: "Whatsapp",
};

export function parsePaymentMethodToObject(
  link: string,
  product: string
): PaymentMethod[] {
  return link
    .trim()
    .split(" ")
    .map((par) => {
      const [rawId, rawUrl] = par.split("=");
      const id = codes[rawId];
      const url =
        rawId == "ws" ? buildWhatsappMessage(rawUrl, product) : rawUrl;

      return { id, url };
    })
    .filter((item) => item.id && item.url); // Filtra si alguna equivalencia no existe
}

function buildWhatsappMessage(number: string, product: string): string {
  const whatsappMessage = "https://wa.me/<number>?text=<encodeMessage>";
  const message = `Hola\nMe gustaría comprar ${product}`;

  return whatsappMessage
    .replace("<number>", number)
    .replace("<encodeMessage>", encodeURIComponent(message));
}
