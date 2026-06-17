// En Cloudflare el sitio se sirve en la raíz del worker, sin prefijo de path.
// Si querés deployar de nuevo bajo un subpath (ej. GitHub Pages), cambiá
// `base` a "/bibiSaintWebPage" y `site` en consecuencia.
const url = import.meta.env.SITE || "https://bibisaintwebpage.pages.dev/";

const pageData = {
  site: url,
  base: "",
  pageTitle: "Bibi's Ventasonline",
  pagesSubTitle: "Hogar & Deco",
  postPerPage: 10,
  description: "Descripción temporal"
};

export { pageData as config };
