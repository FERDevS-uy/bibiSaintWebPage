import React, { useState } from "react";
import addToCart from "@utils/addToCart";
import { withBasePath } from "../utils/basePath";
import cartSVG from "../assets/add-one-cart.svg?raw";

const checkCart = `
<svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
  <path d='M21 5L19 12H7.37671M20 16H8L6 3H3M11 6L13 8L17 4M9 20C9 20.5523 8.55228 21 8 21C7.44772 21 7 20.5523 7 20C7 19.4477 7.44772 19 8 19C8.55228 19 9 19.4477 9 20ZM20 20C20 20.5523 19.5523 21 19 21C18.4477 21 18 20.5523 18 20C18 19.4477 18.4477 19 19 19C19.5523 19 20 19.4477 20 20Z'
    stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'
  />
</svg>`;

export default function AddToCartButton({ producto: p, variant = "icon" }) {
  const [checked, setChecked] = useState(false);
  const categoryName = String(p?.categories?.name ?? "").toUpperCase();
  const productHref = withBasePath(`/producto/${p.id}`);
  const requiresSizeSelection =
    String(p?.id ?? "").toLowerCase().startsWith("mdt-") ||
    categoryName === "ROPA" ||
    categoryName === "MUJER" ||
    categoryName === "HOMBRE";

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    addToCart(p.id, p.name, p.price, undefined, p.img);

    setChecked(true);
    setTimeout(() => setChecked(false), 1500);
  };

  if (requiresSizeSelection) {
    return (
      <a
        className={`addToCart ${variant === "full" ? "addToCartFull addToCartNeedsSize" : "addToCartNeedsSizeIcon"}`}
        href={productHref}
        title="Elegir talle antes de agregar"
        onClick={(e) => e.stopPropagation()}
      >
        {variant === "full" ? "ELEGIR TALLE" : <span dangerouslySetInnerHTML={{ __html: cartSVG }} />}
      </a>
    );
  }

  if (variant === "full") {
    return (
      <button
        className="addToCart addToCartFull"
        title="Agregar al carrito"
        onClick={handleClick}
        disabled={checked}
      >
        {checked ? "✓ AGREGADO" : "AÑADIR AL CARRITO"}
      </button>
    );
  }

  return (
    <button
      className="addToCart"
      title="Agregar uno al carrito"
      onClick={handleClick}
      disabled={checked}
      dangerouslySetInnerHTML={{ __html: checked ? checkCart : cartSVG }}
    />
  );
}
