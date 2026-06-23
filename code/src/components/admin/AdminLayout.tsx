import React, { useState } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import { ThemeProvider, useTheme } from "./ThemeContext";

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [navOpen, setNavOpen] = useState(false);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", background: "var(--admin-bg)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", width: 200 }}>
          <div className="admin-skeleton" style={{ height: 14 }} />
          <div className="admin-skeleton" style={{ height: 14, width: "60%" }} />
        </div>
      </div>
    );
  }

  if (!user) {
    window.location.href = "/admin/login";
    return null;
  }

  const pathname = typeof window !== "undefined" ? window.location.pathname : "/admin";

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin" || pathname === "/admin/";
    return pathname.startsWith(href);
  };

  const userEmail = user.email ?? "";
  const initials = userEmail.charAt(0).toUpperCase();

  return (
    <div className="admin-layout" data-admin-theme={theme}>
      {/* Hamburger button — mobile only */}
      <button
        className="admin-hamburger"
        onClick={() => setNavOpen(!navOpen)}
        aria-label={navOpen ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={navOpen}
        style={{
          position: "fixed",
          top: 12,
          left: 12,
          zIndex: 200,
          flexDirection: "column",
          gap: 4,
          padding: 10,
          background: "var(--admin-surface)",
          border: "1px solid var(--admin-border)",
          borderRadius: 10,
          cursor: "pointer",
          boxShadow: "var(--admin-shadow)",
          transition: "all 0.2s ease",
        }}
      >
        <span style={{ display: "block", width: 20, height: 2, background: "var(--admin-text)", borderRadius: 2, transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.2s", transform: navOpen ? "rotate(45deg) translate(4px,4px)" : "none" }} />
        <span style={{ display: "block", width: 20, height: 2, background: "var(--admin-text)", borderRadius: 2, transition: "opacity 0.2s", opacity: navOpen ? 0 : 1 }} />
        <span style={{ display: "block", width: 20, height: 2, background: "var(--admin-text)", borderRadius: 2, transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.2s", transform: navOpen ? "rotate(-45deg) translate(4px,-4px)" : "none" }} />
      </button>

      {/* Overlay — mobile */}
      {navOpen && <div className="admin-overlay" onClick={() => setNavOpen(false)} />}

      {/* Sidebar */}
      <aside className={`admin-sidebar ${navOpen ? "open" : ""}`}>
        <div className="admin-sidebar-inner">
          <div style={{ padding: "0 1.25rem", display: "flex", flexDirection: "column", gap: "2rem" }}>
            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0 0.25rem" }}>
              <span style={{
                width: 38,
                height: 38,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(135deg, var(--admin-accent), var(--admin-accent-hover))",
                color: "#fff",
                borderRadius: 10,
                fontFamily: "var(--admin-font-serif)",
                fontSize: "1.15rem",
                fontWeight: 700,
                lineHeight: 1,
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              }}>B</span>
              <div>
                <h1 style={{ fontFamily: "var(--admin-font-serif)", fontSize: "1.15rem", fontWeight: 400, color: "#fff", margin: 0, lineHeight: 1.2 }}>Bibi's</h1>
                <p style={{ fontSize: "0.65rem", color: "var(--admin-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.15em", margin: "0.1rem 0 0 0" }}>Admin</p>
              </div>
            </div>

            {/* Nav */}
            <nav aria-label="Navegación principal" style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
              <a
                href="/admin"
                className={`admin-nav-link ${isActive("/admin") ? "active" : ""}`}
                onClick={() => setNavOpen(false)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
                Productos
              </a>
              <a
                href="/admin/productos/nuevo"
                className={`admin-nav-link ${isActive("/admin/productos/nuevo") ? "active" : ""}`}
                onClick={() => setNavOpen(false)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Nuevo producto
              </a>
              <a
                href="/admin/proveedores"
                className={`admin-nav-link ${isActive("/admin/proveedores") ? "active" : ""}`}
                onClick={() => setNavOpen(false)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                Proveedores
              </a>
            </nav>
          </div>

          {/* Bottom */}
          <div style={{ padding: "0 1.25rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            {/* User */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.65rem",
              padding: "0.6rem 0.85rem",
              marginBottom: "0.5rem",
            }}>
              <span style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "linear-gradient(135deg, var(--admin-accent), var(--admin-accent-hover))",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.75rem",
                fontWeight: 700,
                flexShrink: 0,
              }}>{initials}</span>
              <span style={{
                fontSize: "0.75rem",
                color: "var(--admin-sidebar-text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                opacity: 0.8,
              }}>{userEmail}</span>
            </div>

            <div style={{ height: 1, background: "var(--admin-sidebar-hover)", margin: "0 0.5rem 0.5rem" }} />

            <button className="admin-sidebar-btn" onClick={toggleTheme} title={theme === "dark" ? "Modo claro" : "Modo oscuro"}>
              {theme === "dark" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
              {theme === "dark" ? "Modo claro" : "Modo oscuro"}
            </button>

            <button className="admin-sidebar-btn" onClick={signOut} style={{ opacity: 0.6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="admin-main">
        <div className="admin-main-inner">{children}</div>
      </main>

      {/* Mobile FAB */}
      <a href="/admin/productos/nuevo" className="admin-fab" aria-label="Nuevo producto">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </a>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <AdminLayoutInner>{children}</AdminLayoutInner>
      </ThemeProvider>
    </AuthProvider>
  );
}
