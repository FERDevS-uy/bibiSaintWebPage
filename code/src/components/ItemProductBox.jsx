import React from "react";
import AddToCartButton from "./AddToCartButton.jsx";
import { withBasePath } from "../utils/basePath";
import { isTallBoot } from "../utils/isTallBoot";
import { formatPrice, parsePrice } from "../utils/price";
import "../styles/components/ItemProductBoxReact.css";

export default function ItemProductoBox({ producto: p }) {
  const image = Array.isArray(p.img) ? p.img[0] : p.img ?? "";
  const tall = isTallBoot(p.name, p.description, p.id);
  const productHref = withBasePath(`/producto/${p.id}`);

  return (
    <article className={`producto_card${tall ? " producto_card--tall" : ""}`}>
      <a href={productHref} className="card-img-link" title={p.name}>
        <img src={image} alt={p.name} className={tall ? "producto_card__img--tall" : undefined} />
      </a>

      <div className="card-info">
        <span className="p-name">{p.name}</span>
        <span className="p-price-row">
          {p.enOferta && p.originalPrice && (
            <span className="p-price-original">${formatPrice(parsePrice(p.originalPrice))}</span>
          )}
          <span className="p-price">${formatPrice(parsePrice(p.price))}</span>
        </span>
        <div className="add-btn-wrapper">
          <AddToCartButton producto={p} variant="full" />
        </div>
      </div>
    </article>
  );
}
