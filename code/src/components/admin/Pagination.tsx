import React from "react";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  // Build page numbers to show (max 7)
  const pages: number[] = [];
  if (totalPages <= 7) {
    for (let i = 0; i < totalPages; i++) pages.push(i);
  } else if (page < 3) {
    for (let i = 0; i < 7; i++) pages.push(i);
  } else if (page > totalPages - 4) {
    for (let i = totalPages - 7; i < totalPages; i++) pages.push(i);
  } else {
    for (let i = page - 3; i <= page + 3; i++) pages.push(i);
  }

  return (
    <nav aria-label="Paginación" style={wrap}>
      <button
        className="admin-btn admin-btn-ghost"
        onClick={() => onPageChange(0)}
        disabled={page === 0}
        style={{ ...btn, opacity: page === 0 ? 0.35 : 1 }}
        aria-label="Primera página"
      >
        «
      </button>
      <button
        className="admin-btn admin-btn-ghost"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 0}
        style={{ ...btn, opacity: page === 0 ? 0.35 : 1 }}
        aria-label="Página anterior"
      >
        ‹
      </button>

      {pages.map((p) => (
        <button
          key={p}
          className={`admin-btn ${p === page ? "admin-btn-primary" : "admin-btn-ghost"}`}
          onClick={() => onPageChange(p)}
          style={btn}
          aria-label={`Página ${p + 1}`}
          aria-current={p === page ? "page" : undefined}
        >
          {p + 1}
        </button>
      ))}

      <button
        className="admin-btn admin-btn-ghost"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages - 1}
        style={{ ...btn, opacity: page >= totalPages - 1 ? 0.35 : 1 }}
        aria-label="Página siguiente"
      >
        ›
      </button>
      <button
        className="admin-btn admin-btn-ghost"
        onClick={() => onPageChange(totalPages - 1)}
        disabled={page >= totalPages - 1}
        style={{ ...btn, opacity: page >= totalPages - 1 ? 0.35 : 1 }}
        aria-label="Última página"
      >
        »
      </button>
    </nav>
  );
}

const wrap: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: "0.25rem",
  marginTop: "1.5rem",
  flexWrap: "wrap",
};

const btn: React.CSSProperties = {
  padding: "0.4rem 0.65rem",
  minWidth: 36,
  justifyContent: "center",
};
