import React from "react";

export function Section({ title, children, loading }: { title: string; children: React.ReactNode; loading?: boolean }) {
  return (
    <div className="admin-card">
      <div style={cardHeader}>
        <h2 style={cardTitle}>{title}</h2>
        {loading && <span style={{ fontSize: "0.75rem", color: "var(--admin-text-secondary)" }}>Cargando...</span>}
      </div>
      <div style={sectionActionsInner}>{children}</div>
    </div>
  );
}

export function Field({ label, htmlFor, error, children }: { label: string; htmlFor?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} style={labelStyle}>
        {label}
      </label>
      {children}
      {error && (
        <p style={errorTextStyle} role="alert">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
        </p>
      )}
    </div>
  );
}

export function Toggle({ checked, onChange, label, title }: { checked: boolean; onChange: (v: boolean) => void; label: string; title?: string }) {
  return (
    <label style={flagLabel} title={title}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={flagInput}
      />
      <span style={flagToggleVisual} aria-hidden="true">
        <span style={flagToggleDot(checked)} />
      </span>
      <span style={flagToggleLabel}>{label}</span>
    </label>
  );
}

const cardHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "1rem",
  flexWrap: "wrap",
  gap: "0.5rem",
};

const cardTitle: React.CSSProperties = {
  fontSize: "0.95rem",
  fontWeight: 700,
  margin: 0,
  color: "var(--admin-text)",
};

const sectionActionsInner: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "var(--admin-text-secondary)",
  marginBottom: "0.3rem",
};

const errorTextStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.3rem",
  fontSize: "0.78rem",
  fontWeight: 600,
  color: "var(--admin-error)",
  margin: "0.35rem 0 0 0",
  lineHeight: 1.3,
};

const flagLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  fontSize: "0.85rem",
  fontWeight: 500,
  cursor: "pointer",
  color: "var(--admin-text)",
  userSelect: "none",
};

const flagInput: React.CSSProperties = {
  position: "absolute",
  opacity: 0,
  width: 0,
  height: 0,
};

const flagToggleVisual: React.CSSProperties = {
  position: "relative",
  width: 36,
  height: 20,
  borderRadius: 10,
  background: "var(--admin-border)",
  transition: "background 0.2s",
  flexShrink: 0,
};

const flagToggleDot = (checked: boolean): React.CSSProperties => ({
  position: "absolute",
  top: 2,
  left: checked ? 18 : 2,
  width: 16,
  height: 16,
  borderRadius: "50%",
  background: checked ? "var(--admin-accent)" : "#fff",
  transition: "left 0.2s, background 0.2s",
  boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
});

const flagToggleLabel: React.CSSProperties = {
  fontSize: "0.85rem",
  fontWeight: 500,
};
