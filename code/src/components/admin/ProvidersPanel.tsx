import React, { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import Modal from "./Modal";

interface SyncResult {
  provider: string;
  status: "ok" | "error";
  count: number;
  error?: string;
}

interface SyncResponse {
  results: SyncResult[];
  totalUpserted: number;
  totalErrors: number;
}

export default function ProvidersPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const resp = await fetch("/api/admin/providers/sync", {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        throw new Error(body?.error || `Error HTTP ${resp.status}`);
      }
      const data: SyncResponse = await resp.json();
      setResult(data);
    } catch (e: any) {
      setError(e?.message || "Error al sincronizar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={wrap}>
      <div style={headerStyle}>
        <div>
          <h1 style={pageTitle}>Proveedores</h1>
          <p style={pageSub}>Sincronizar productos desde proveedores externos</p>
        </div>
        <button
          onClick={handleSync}
          disabled={loading}
          className="admin-btn admin-btn-primary"
          style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
        >
          {loading ? (
            <span className="admin-spinner" style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "adminSpin 0.6s linear infinite" }} />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          )}
          {loading ? "Sincronizando..." : "Sincronizar todos"}
        </button>
      </div>

      {loading && (
        <div style={{ padding: "2rem 0", textAlign: "center", color: "var(--admin-text-secondary)" }}>
          <div className="admin-skeleton" style={{ height: 14, width: "60%", margin: "0 auto 0.5rem" }} />
          <div className="admin-skeleton" style={{ height: 14, width: "40%", margin: "0 auto" }} />
        </div>
      )}

      <Modal open={!!error} onClose={() => setError(null)} type="error" title="Error de sincronización">
        {error}
      </Modal>

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {result.results.map((r) => (
            <div
              key={r.provider}
              style={{
                background: "var(--admin-surface)",
                borderRadius: "var(--admin-radius)",
                padding: "1rem 1.25rem",
                boxShadow: "var(--admin-shadow)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <strong>{r.provider}</strong>
                {r.status === "ok" ? (
                  <span style={{ color: "var(--admin-success)", marginLeft: "0.5rem", fontSize: "0.85rem" }}>
                    {r.count} productos sincronizados
                  </span>
                ) : (
                  <span style={{ color: "var(--admin-danger)", marginLeft: "0.5rem", fontSize: "0.85rem" }}>
                    Error: {r.error}
                  </span>
                )}
              </div>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: r.status === "ok" ? "var(--admin-success)" : "var(--admin-danger)",
                  flexShrink: 0,
                }}
              />
            </div>
          ))}
          <div
            style={{
              background: "var(--admin-surface)",
              borderRadius: "var(--admin-radius)",
              padding: "0.75rem 1.25rem",
              boxShadow: "var(--admin-shadow)",
              fontSize: "0.85rem",
              color: "var(--admin-text-secondary)",
            }}
          >
            Total: {result.totalUpserted} productos upserted
            {result.totalErrors > 0 && `, ${result.totalErrors} errores`}
          </div>
        </div>
      )}

      {!loading && !result && !error && (
        <div style={emptyState}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--admin-text-secondary)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          <p style={{ margin: "0.5rem 0 0", color: "var(--admin-text-secondary)", fontSize: "0.9rem" }}>
            Presiona "Sincronizar todos" para importar productos de Martina, Kai Deco y Alondra.
          </p>
        </div>
      )}
    </div>
  );
}

const wrap: React.CSSProperties = {
  animation: "slideUp 0.3s ease",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: "1rem",
  flexWrap: "wrap",
  gap: "1rem",
};

const pageTitle: React.CSSProperties = {
  fontFamily: "var(--admin-font-serif)",
  fontSize: "1.6rem",
  fontWeight: 400,
  margin: 0,
  color: "var(--admin-text)",
  lineHeight: 1.2,
};

const pageSub: React.CSSProperties = {
  fontSize: "0.8rem",
  color: "var(--admin-text-secondary)",
  margin: "0.15rem 0 0 0",
};

const emptyState: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "4rem 2rem",
  textAlign: "center",
};
