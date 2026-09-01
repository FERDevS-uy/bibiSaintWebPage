import React from "react";
import AddToCartButton from "./AddToCartButton.jsx";
import { withBasePath } from "../utils/basePath";
import { isTallBoot } from "../utils/isTallBoot";
import { formatPrice, parsePrice } from "../utils/price";
import "../styles/components/ItemProductBoxReact.css";

const PRODUCT_IMG_FALLBACK =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><rect width="640" height="640" fill="#f3f4f6"/><g fill="#9ca3af"><circle cx="250" cy="248" r="64"/><path d="M116 448l110-118 86 90 56-58 156 86v52H116z"/></g><text x="320" y="566" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" fill="#6b7280">Imagen no disponible</text></svg>',
  );

function applyImageFallback(event) {
  const image = event.currentTarget;
  if (!image || image.dataset.fallbackApplied === "true") return;
  image.dataset.fallbackApplied = "true";
  image.src = PRODUCT_IMG_FALLBACK;
}

function applyImageFallbackFromElement(image) {
  if (!image || image.dataset.fallbackApplied === "true") return;
  image.dataset.fallbackApplied = "true";
  image.src = PRODUCT_IMG_FALLBACK;
}

function bindImageTimeout(image) {
  if (!image || image.dataset.timeoutBound === "true") return;
  image.dataset.timeoutBound = "true";

  window.setTimeout(() => {
    if (!image.complete || image.naturalWidth === 0) {
      applyImageFallbackFromElement(image);
    }
  }, 3000);
}

export default function ItemProductoBox({ producto: p }) {
  const image = Array.isArray(p.img) ? p.img[0] : p.img ?? "";
  const tall = isTallBoot(p.name, p.description, p.id);
  const productHref = withBasePath(`/producto/${p.id}`);

  return (
    <article className={`producto_card${tall ? " producto_card--tall" : ""}`}>
      <a href={productHref} className="card-img-link" title={p.name}>
        <img
          src={image}
          alt={p.name}
          className={tall ? "producto_card__img--tall" : undefined}
          onError={applyImageFallback}
          ref={bindImageTimeout}
        />
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
