import React from "react";
import ProductImage from "./ProductImage.jsx";
import AddToCartButton from "./AddToCartButton.jsx";
import { withBasePath } from "../utils/basePath";
import { isFootwearProduct, isTallBoot } from "../utils/isTallBoot";
import {
  formatPrice,
  normalizeOfferOriginalPrice,
  parsePrice,
} from "../utils/price";
import "../styles/components/ItemProductBoxReact.css";

export default function ItemProductoBox({ producto: p }) {
  const image = Array.isArray(p.img) ? p.img[0] : (p.img ?? "");
  const tallBoot = isTallBoot(p.name, p.description, p.id);
  const bottomFootwear = !tallBoot && isFootwearProduct(
    p.name,
    p.description,
    p.id,
    p.categories?.name,
    p.categories?.subcategories?.map((subcategory) => subcategory.name),
  );
  const productHref = withBasePath(`/producto/${p.id}`);
  const priceValue = parsePrice(p.price);
  const validOriginalPrice = normalizeOfferOriginalPrice(
    p.originalPrice,
    priceValue,
  );

  return (
    <article className={`producto_card${bottomFootwear ? " producto_card--footwear" : ""}${tallBoot ? " producto_card--tall" : ""}`}>
      <a href={productHref} className="card-img-link" title={p.name}>
        <ProductImage
          src={image}
          alt={p.name}
          className={bottomFootwear ? "producto_card__img--footwear" : tallBoot ? "producto_card__img--tall" : undefined}
        />
      </a>

      <div className="card-info">
        <span className="p-name">{p.name}</span>
        <span className="p-price-row">
          {p.enOferta && validOriginalPrice !== null && (
            <span className="p-price-original">
              ${formatPrice(validOriginalPrice)}
            </span>
          )}
          <span className="p-price">${formatPrice(priceValue)}</span>
        </span>
        <div className="add-btn-wrapper">
          <AddToCartButton producto={p} variant="full" />
        </div>
      </div>
    </article>
  );
}
