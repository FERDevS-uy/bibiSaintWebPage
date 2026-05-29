import React from "react";

import "../styles/navpag.css";

const Chevron = ({ direction = "left" }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {direction === "left" ? (
      <polyline points="15 18 9 12 15 6" />
    ) : (
      <polyline points="9 18 15 12 9 6" />
    )}
  </svg>
);

export default function NavPag({ actualPage, totalPages, onChangePage }) {
  const isFirst = actualPage === 1;
  const isLast = actualPage === totalPages;

  return (
    <nav className="pagination" aria-label="Paginación">
      {isFirst ? (
        <span className="pag-arrow disabled" aria-hidden="true">
          <Chevron direction="left" />
        </span>
      ) : (
        <button
          type="button"
          className="pag-arrow"
          onClick={() => onChangePage(actualPage - 1)}
          aria-label="Página anterior"
        >
          <Chevron direction="left" />
        </button>
      )}

      <span className="pag-info">
        {actualPage} de {totalPages}
      </span>

      {isLast ? (
        <span className="pag-arrow disabled" aria-hidden="true">
          <Chevron direction="right" />
        </span>
      ) : (
        <button
          type="button"
          className="pag-arrow"
          onClick={() => onChangePage(actualPage + 1)}
          aria-label="Página siguiente"
        >
          <Chevron direction="right" />
        </button>
      )}
    </nav>
  );
}
