import type { AstroGlobal } from "astro";
import type Product from "../../types/product";
import {
  getDisplayCategoryName,
  getDisplaySubcategories,
} from "@utils/categoryNormalization";
import { loadRelatedProducts } from "@server/catalog/facade";
import { fetchProductById } from "@server/products";
import { toCardProduct } from "@server/catalog/mappers";
import { getSupabase } from "@server/supabase";
import { catalogReadEnv } from "@server/catalog/http";
import { createCatalogQueryTelemetry } from "@server/catalog/queryTelemetry";
import { formatPrice, normalizeOfferOriginalPrice, parsePrice } from "@utils/price";

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

export async function getProductPageState(astro: AstroGlobal): Promise<ProductPageState | null> {
  const { id } = astro.params;
  if (!id) return null;

  const env = catalogReadEnv((astro.locals as { runtime?: { env?: Record<string, string | undefined> } }).runtime?.env);
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

  const relacionados = relacionadosIds && relacionadosIds.length > 0
    ? (await loadRelatedProducts(relacionadosIds, env, getSupabase, { telemetry })).map(toCardProduct)
    : [];

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
  const detailedSubcategory = displaySubcategories.find((sub) => sub.includes(" - "));
  const groupSubcategory = detailedSubcategory
    ? detailedSubcategory.split(" - ")[0]
    : displaySubcategories[0];
  const leafSubcategory = detailedSubcategory || displaySubcategories[0];

  const isRopa = displayCategoryName === "Ropa";
  const disableColorSelection = /^tal-/i.test(String(id || ""));
  const runtimeStockCheckEnabled = import.meta.env.PUBLIC_ENABLE_STOCK_CHECK !== "false";
  const primaryProviderLink = paymentLink?.[0]?.url ?? "";
  const isMartinaProduct = String(id).toLowerCase().startsWith("mdt-");
  const isKaiProduct = String(id).toLowerCase().startsWith("kai-") || primaryProviderLink.includes("kaideco.uy/products/");
  const isNuvexProduct = primaryProviderLink.includes("nuvex.uy");
  const isAlondraProduct =
    String(id).toLowerCase().startsWith("alo-")
    || primaryProviderLink.includes("alondra.com.uy")
    || primaryProviderLink.includes("alondra-ecommerce");
  const showRuntimeStockCheck =
    runtimeStockCheckEnabled
    && (isMartinaProduct || isKaiProduct || isNuvexProduct || isAlondraProduct);

  const pathname = astro.url.pathname;
  const priceValue = parsePrice(price);
  const validOriginalPrice = normalizeOfferOriginalPrice(originalPrice, priceValue);
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
