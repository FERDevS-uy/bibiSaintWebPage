import React from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  type?: "ok" | "error" | "info";
  title?: string;
  children: React.ReactNode;
}

export default function Modal({ open, onClose, type = "info", title, children }: ModalProps) {
  if (!open) return null;

  const icon = type === "ok" ? (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ) : type === "error" ? (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ) : (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div
        className={`admin-modal ${type === "ok" ? "admin-modal-ok" : type === "error" ? "admin-modal-error" : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={title || "Notificación"}
      >
        <div className="admin-modal-icon">{icon}</div>
        {title && <h3 className="admin-modal-title">{title}</h3>}
        <div className="admin-modal-body">{children}</div>
        <div className="admin-modal-footer">
          <button className="admin-btn admin-btn-primary admin-modal-btn" onClick={onClose} autoFocus>
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
