import type { AstroGlobal } from "astro";
import type Product from "../../types/product";
import {
  getDisplayCategoryName,
  getDisplaySubcategories,
  productMatchesCategory,
  productMatchesSubcategory,
} from "@utils/categoryNormalization";
import { loadRelatedProducts } from "@server/catalog/facade";
import { fetchCategoryProducts, fetchProductById } from "@server/products";
import { toCardProduct } from "@server/catalog/mappers";
import { loadProducts } from "@utils/loadProducts";
import { getSupabase } from "@server/supabase";
import { catalogReadEnv } from "@server/catalog/http";
import { createCatalogQueryTelemetry } from "@server/catalog/queryTelemetry";
import {
  formatPrice,
  normalizeOfferOriginalPrice,
  parsePrice,
} from "@utils/price";

export interface ProductPageState {
  product: Product;
  relacionados: ReturnType<typeof toCardProduct>[];
  displayCategoryName: string;
  displaySubcategories: string[];
  groupSubcategory: string;
  leafSubcategory: string;
  isRopa: boolean;
  disableColorSelection: boolean;
  runtimeStockCheckEnabled: boolean;
  primaryProviderLink: string;
  isMartinaProduct: boolean;
  isKaiProduct: boolean;
  isNuvexProduct: boolean;
  isAlondraProduct: boolean;
  showRuntimeStockCheck: boolean;
  pathname: string;
  priceValue: number;
  validOriginalPrice: number | null;
  hasValidOffer: boolean;
}

export async function getProductPageState(
  astro: AstroGlobal,
): Promise<ProductPageState | null> {
  const { id } = astro.params;
  if (!id) return null;

  const env = catalogReadEnv(
    (astro.locals as { runtime?: { env?: Record<string, string | undefined> } })
      .runtime?.env,
  );
  const telemetry = createCatalogQueryTelemetry("product");
  const product = await fetchProductById(id);
  if (!product) return null;

  const {
    name,
    img,
    price,
    categories,
    paymentLink,
    description,
    colors,
    enOferta,
    originalPrice,
    relacionados: relacionadosIds,
  } = product;

  const productForCategoryPath: Product = {
    id,
    name,
    description,
    price,
    img,
    categories,
    paymentLink,
    enOferta: false,
    relacionados: [],
  };

  const displayCategoryName = getDisplayCategoryName(productForCategoryPath);
  const displaySubcategories = getDisplaySubcategories(productForCategoryPath);
  const detailedSubcategory = displaySubcategories.find((sub) =>
    sub.includes(" - "),
  );
  const groupSubcategory = detailedSubcategory
    ? detailedSubcategory.split(" - ")[0]
    : displaySubcategories[0];
  const leafSubcategory = detailedSubcategory || displaySubcategories[0];

  let relacionados =
    relacionadosIds && relacionadosIds.length > 0
      ? (
          await loadRelatedProducts(relacionadosIds, env, getSupabase, {
            telemetry,
          })
        ).map(toCardProduct)
      : [];

  // Algunos proveedores no persisten IDs explícitos en `relacionados`. En ese
  // caso (o si esos IDs ya no están activos), la relación por taxonomía mantiene
  // útil el carrusel sin volver al scan legacy del catálogo completo.
  if (relacionados.length === 0) {
    try {
      // The read model can lag behind the authoritative `products` table
      // (for example while a category is still being backfilled). Query the
      // bounded category slice directly so existing products still get a
      // useful related carousel instead of an empty one.
      let taxonomyRelated = await fetchCategoryProducts({
        category: displayCategoryName,
        subcategory: leafSubcategory,
        page: 1,
        pageSize: 12,
      });
      if (taxonomyRelated.products.length === 0 && leafSubcategory) {
        taxonomyRelated = await fetchCategoryProducts({
          category: displayCategoryName,
          page: 1,
          pageSize: 12,
        });
      }
      let relatedProducts = taxonomyRelated.products;
      if (relatedProducts.length === 0 && displayCategoryName === "Ropa") {
        // Martina stores Ropa under the source categories MUJER/HOMBRE and
        // without the normalized "Mujer - " prefix used by the UI.
        const sourceCategory = product.categories?.name?.trim();
        const sourceSubcategory =
          product.categories?.subcategories?.[0]?.name?.trim();
        if (sourceCategory) {
          relatedProducts = (
            await fetchCategoryProducts({
              category: sourceCategory,
              subcategory: sourceSubcategory,
              page: 1,
              pageSize: 12,
            })
          ).products;
          if (relatedProducts.length === 0) {
            relatedProducts = (
              await fetchCategoryProducts({
                category: sourceCategory,
                page: 1,
                pageSize: 12,
              })
            ).products;
          }
        }
      }
      // Martina products are stored as `MUJER` in the source table but are
      // displayed under the normalized `Ropa` taxonomy, so the SQL category
      // filter cannot match them. Reuse the normalization helpers as a final
      // bounded fallback before giving up.
      if (relatedProducts.length === 0) {
        const allProducts = await loadProducts();
        const sameSubcategory = leafSubcategory
          ? allProducts.filter((candidate) =>
              productMatchesSubcategory(
                candidate,
                displayCategoryName,
                leafSubcategory,
              ),
            )
          : [];
        relatedProducts = (
          sameSubcategory.length > 0
            ? sameSubcategory
            : allProducts.filter((candidate) =>
                productMatchesCategory(candidate, displayCategoryName),
              )
        ).slice(0, 12);
      }
      const selectedRelatedProducts = relatedProducts
        .filter((candidate) => candidate.id !== product.id)
        .slice(0, 10);
      // Keep the full product payload (especially its image array) when the
      // category query returns a projection with missing media fields.
      const hydratedRelated = await Promise.all(
        selectedRelatedProducts.map(async (candidate) => {
          if (candidate.img?.[0]) return candidate;
          return (await fetchProductById(candidate.id)) ?? candidate;
        }),
      );
      relacionados = hydratedRelated;
    } catch {
      // La ficha sigue disponible si el read model de relacionados se degrada.
    }
  }

  const isRopa = displayCategoryName === "Ropa";
  const disableColorSelection = /^tal-/i.test(String(id || ""));
  const runtimeStockCheckEnabled =
    import.meta.env.PUBLIC_ENABLE_STOCK_CHECK !== "false";
  const primaryProviderLink = paymentLink?.[0]?.url ?? "";
  const isMartinaProduct = String(id).toLowerCase().startsWith("mdt-");
  const isKaiProduct =
    String(id).toLowerCase().startsWith("kai-") ||
    primaryProviderLink.includes("kaideco.uy/products/");
  const isNuvexProduct = primaryProviderLink.includes("nuvex.uy");
  const isAlondraProduct =
    String(id).toLowerCase().startsWith("alo-") ||
    primaryProviderLink.includes("alondra.com.uy") ||
    primaryProviderLink.includes("alondra-ecommerce");
  const showRuntimeStockCheck =
    runtimeStockCheckEnabled &&
    (isMartinaProduct || isKaiProduct || isNuvexProduct || isAlondraProduct);

  const pathname = astro.url.pathname;
  const priceValue = parsePrice(price);
  const validOriginalPrice = normalizeOfferOriginalPrice(
    originalPrice,
    priceValue,
  );
  const hasValidOffer = Boolean(enOferta) && validOriginalPrice !== null;

  return {
    product,
    relacionados,
    displayCategoryName,
    displaySubcategories,
    groupSubcategory,
    leafSubcategory,
    isRopa,
    disableColorSelection,
    runtimeStockCheckEnabled,
    primaryProviderLink,
    isMartinaProduct,
    isKaiProduct,
    isNuvexProduct,
    isAlondraProduct,
    showRuntimeStockCheck,
    pathname,
    priceValue,
    validOriginalPrice,
    hasValidOffer,
  };
}
