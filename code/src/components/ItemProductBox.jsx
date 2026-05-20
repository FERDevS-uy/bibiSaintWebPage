import React from "react";
import { config } from "../config";
// ❗ Si tenés AddToCartButton en React:
import AddToCartButton from "./AddToCartButton.jsx"; // Ajusta el path si es necesario
import "../styles/global.css"; 
export default function ItemProductoBox({ producto: p }) {
  return (
    <article className="producto_card">
      <div className="box-up">
        <img src={p.img[0]} alt={p.name} />
        <div className="img-info">
          <div className="info-inner">
            <span className="p-name">{p.name}</span>
            <span className="p-categories">
              {Array.isArray(p.categories) ? p.categories.join(" ") : ""}
            </span>
          </div>
        </div>
      </div>

      <div className="box-down">
        <div className="h-bg">
          <div className="h-bg-inner"></div>
        </div>

        <a
          href={`${config.base}/producto/${p.id}`}
          className="price-box"
          title="Ir a comprar"
        >
          <span className="price">${p.price}</span>
          <span className="go-to-product">
            <span className="txt">Comprar</span>
          </span>
        </a>
      </div>

      <div className="cart-box">
        {/* Si solo tenés AddToCartButton en Astro, reemplazalo por un botón común */}
        <AddToCartButton producto={p} />
      </div>
    </article>
  );
}
