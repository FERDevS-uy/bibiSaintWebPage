import { useState, useEffect, useRef } from "react";
import { isTallBoot } from "../utils/isTallBoot";
import "../styles/components/ProductGallery.css";

/**
 * Galeria de imagenes del producto, cargada como isla React (lazy).
 * - Imagen principal + miniaturas clickeables.
 * - loading="lazy" en todas las imagenes.
 * - Si TODAS las imagenes fallan al cargar, muestra un mensaje indicando
 *   que el producto puede no estar en venta.
 */
export default function ProductGallery({ images = [], name = "", description = "", id = "" }) {
  const initial = Array.isArray(images) ? images.filter(Boolean) : [];
  const [safeImages, setSafeImages] = useState(initial);
  const [activeIndex, setActiveIndex] = useState(0);
  const [brokenSet, setBrokenSet] = useState(() => new Set());
  const mainImgRef = useRef(null);

  // Escucha cambio de color para sustituir el set de imagenes en vivo.
  useEffect(() => {
    function onImageSet(ev) {
      const next = Array.isArray(ev?.detail?.images)
        ? ev.detail.images.filter(Boolean)
        : [];
      if (next.length === 0) return;
      setSafeImages(next);
      setActiveIndex(0);
      setBrokenSet(new Set());
    }
    window.addEventListener("product:image-set", onImageSet);
    return () => window.removeEventListener("product:image-set", onImageSet);
  }, []);

  const markBroken = (idx) =>
    setBrokenSet((prev) => {
      if (prev.has(idx)) return prev;
      const next = new Set(prev);
      next.add(idx);
      return next;
    });

  // Avanzar al primer indice no roto si el actual lo esta
  useEffect(() => {
    if (!brokenSet.has(activeIndex)) return;
    const nextValid = safeImages.findIndex((_, i) => !brokenSet.has(i));
    if (nextValid !== -1) setActiveIndex(nextValid);
  }, [brokenSet, activeIndex, safeImages]);

  const allBroken =
    safeImages.length > 0 && brokenSet.size >= safeImages.length;

  if (safeImages.length === 0 || allBroken) {
    return (
      <div className="gallery">
        <div className="mainImg gallery-unavailable" role="img" aria-label="Producto sin imagenes">
          <span className="gallery-unavailable-text">
            Este producto no esta disponible actualmente.
          </span>
        </div>
      </div>
    );
  }

  const activeSrc = safeImages[activeIndex];
  const tall = isTallBoot(name, description, id);

  return (
    <div className="gallery">
      <img
        ref={mainImgRef}
        className={`mainImg${tall ? " mainImg--tall" : ""}`}
        src={activeSrc}
        alt={name}
        loading="lazy"
        decoding="async"
        onError={() => markBroken(activeIndex)}
      />

      {safeImages.length > 1 && (
        <div className="thumbs">
          {safeImages.map((src, i) =>
            brokenSet.has(i) ? null : (
              <img
                key={`${src}-${i}`}
                src={src}
                alt=""
                className={`thumb${i === activeIndex ? " thumb-active" : ""}${tall ? " thumb--tall" : ""}`}
                loading="lazy"
                decoding="async"
                onClick={() => setActiveIndex(i)}
                onError={() => markBroken(i)}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
