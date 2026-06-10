import React from "react";
import { config } from "../config";
import AddToCartButton from "./AddToCartButton.jsx";
import { isTallBoot } from "../utils/isTallBoot";
import "../styles/components/ItemProductBoxReact.css";

export default function ItemProductoBox({ producto: p }) {
  const image = Array.isArray(p.img) ? p.img[0] : p.img ?? "";
  const tall = isTallBoot(p.name, p.description, p.id);

  return (
    <article className={`producto_card${tall ? " producto_card--tall" : ""}`}>
      <a href={`${config.base}/producto/${p.id}`} className="card-img-link" title={p.name}>
        <img src={image} alt={p.name} className={tall ? "producto_card__img--tall" : undefined} />
      </a>

      <div className="card-info">
        <span className="p-name">{p.name}</span>
        <span className="p-price">${p.price}</span>
        <div className="add-btn-wrapper">
          <AddToCartButton producto={p} variant="full" />
        </div>
      </div>
    </article>
  );
}
