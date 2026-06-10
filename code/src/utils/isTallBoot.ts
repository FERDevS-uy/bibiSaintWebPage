/**
 * Heurística simple para decidir si un producto corresponde a una bota
 * (o calzado) cuya foto de catálogo es claramente vertical y se recorta
 * cuando se muestra en un contenedor 1:1 con `object-fit: cover`.
 *
 * Devuelve true para:
 *   - cualquier producto del catálogo de botas local (id `tal-...`),
 *     porque todas sus fotos son verticales y se cortan,
 *   - productos cuyo nombre/descripción mencionan caña alta o bota larga
 *     (heurística por si entran productos nuevos sin id `tal-`).
 *
 * Cuando esta función devuelve true, los componentes (galería de
 * producto, tarjeta del listado, productos relacionados) aplican una
 * variante de estilo que evita el recorte (object-fit: contain).
 */
export function isTallBoot(
  name?: string | null,
  description?: string | null,
  id?: string | null,
): boolean {
  if (id && /^tal-\d/i.test(String(id).trim())) return true;

  const haystack = `${name ?? ""} ${description ?? ""}`.toLowerCase();
  if (!haystack.trim()) return false;
  return (
    haystack.includes("bota larga") ||
    haystack.includes("botas largas") ||
    haystack.includes("bota alta") ||
    haystack.includes("botas altas") ||
    haystack.includes("cana alta") ||
    haystack.includes("caña alta") ||
    haystack.includes("hasta la rodilla")
  );
}

export default isTallBoot;
