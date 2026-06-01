import React from "react";
import { config } from "../config";
import AddToCartButton from "./AddToCartButton.jsx";
import "../styles/components/ItemProductBoxReact.css";

export default function ItemProductoBox({ producto: p }) {
  const image = Array.isArray(p.img) ? p.img[0] : p.img ?? "";

  return (
    <article className="producto_card">
      <a href={`${config.base}/producto/${p.id}`} className="card-img-link" title={p.name}>
        <img src={image} alt={p.name} />
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
