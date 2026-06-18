import React from "react";
import { AuthProvider, useAuth } from "./AuthContext";

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <p>Cargando...</p>
      </div>
    );
  }

  if (!user) {
    window.location.href = "/admin/login";
    return null;
  }

  return (
    <div style={styles.layout}>
      <aside style={styles.sidebar}>
        <h2 style={styles.logo}>Bibi's Admin</h2>
        <nav style={styles.nav}>
          <a href="/admin" style={styles.link}>
            Productos
          </a>
          <a href="/admin/productos/nuevo" style={styles.link}>
            + Nuevo producto
          </a>
        </nav>
        <button onClick={signOut} style={styles.logout}>
          Cerrar sesión
        </button>
      </aside>
      <main style={styles.main}>{children}</main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  loadingWrap: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100dvh",
    fontFamily: "Poppins, sans-serif",
  },
  layout: {
    display: "flex",
    minHeight: "100dvh",
    fontFamily: "Poppins, sans-serif",
  },
  sidebar: {
    width: 240,
    minWidth: 240,
    background: "#1a1a1a",
    color: "#fff",
    padding: "1.5rem 1rem",
    display: "flex",
    flexDirection: "column",
    gap: "1.5rem",
  },
  logo: {
    fontSize: "1.1rem",
    fontWeight: 800,
    letterSpacing: "0.02em",
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  link: {
    color: "#ccc",
    textDecoration: "none",
    padding: "0.5rem 0.7rem",
    borderRadius: 6,
    fontSize: "0.9rem",
    fontWeight: 500,
    transition: "background 0.15s, color 0.15s",
  },
  logout: {
    marginTop: "auto",
    background: "none",
    border: "1px solid #555",
    color: "#ccc",
    padding: "0.5rem",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  main: {
    flex: 1,
    padding: "2rem",
    background: "#f9f9f9",
    overflowY: "auto",
  },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </AuthProvider>
  );
}
